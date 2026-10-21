/**
 * Study AS — drives replicator's shipped PDF→template pipeline endpoint
 * (POST /api/pdf-template-pipeline) through all six stages for one corpus
 * item, exactly as the product client sequences them: start → decompose
 * (per page) → match (per page) → build (per build-decision region) →
 * assemble → verify (per page), threading the validated state blob between
 * requests. Auth is the shipped preview bypass (x-preview-token header +
 * activeOrg cookie).
 *
 * After scoring, EVERY created artifact (template, pages, widgets, staged
 * page PNGs) is deleted via replicator's scripts/pdf-pipeline-cleanup.ts
 * run under varlock in the replicator checkout — the shared DB must end
 * each item exactly as it started, so item order cannot grow the reuse
 * catalog (registered harness contract, docs/BRIEF-AS.md).
 *
 * Transport failures (network error / 5xx) retry once per stage call;
 * pipeline errors (4xx structured failures) end the item unretried.
 */

export interface StageLogEntry {
	stage: string;
	pageIndex?: number;
	regionId?: string;
	ms: number;
	status: number;
	retried: boolean;
	meta: Record<string, unknown>;
}

export interface VerifyReport {
	finalScore: number;
	findingsApplied: number;
	initialScore: number;
	iterations: number;
	reverted: boolean;
}

export interface ItemRunRecord {
	slug: string;
	tier: string;
	baseUrl: string;
	replicatorCommit: string;
	pdfSha256: string;
	startedAtIso: string;
	totalMs: number;
	completed: boolean;
	failedStage?: string;
	error?: string;
	stages: StageLogEntry[];
	regionCountByPage: Record<string, number>;
	reuseCount: number;
	buildCount: number;
	fallbackCount: number;
	templateId?: string;
	verify: Record<string, VerifyReport>;
	/** Pages where finalScore < initialScore — must stay empty (gate G3a). */
	invariantViolations: string[];
	finalState: unknown;
	cleanup: Record<string, unknown> | null;
	cleanupError?: string;
}

export interface RunnerConfig {
	baseUrl: string;
	previewToken: string;
	orgId: string;
	replicatorDir: string;
}

interface PipelineState {
	pipelineId: string;
	pages: { index: number }[];
	decisions: Record<string, { action: string; widgetId?: string }>;
	builtWidgets: Record<string, { fallback: boolean; widgetId: string }>;
	createdPages: Record<string, string>;
	[key: string]: unknown;
}

const STAGE_TIMEOUT_MS = 15 * 60_000;

function authHeaders(config: RunnerConfig): Record<string, string> {
	return {
		cookie: `activeOrg=${config.orgId}`,
		// SvelteKit's CSRF guard 403s form-content POSTs whose Origin doesn't
		// match the app origin (the multipart start stage); JSON stages are
		// exempt but the header is harmless there.
		origin: config.baseUrl,
		"x-preview-token": config.previewToken,
	};
}

interface StageCallResult {
	status: number;
	body: Record<string, unknown>;
	retried: boolean;
}

/** One stage request with a single retry on network error / 5xx. */
async function callStage(
	config: RunnerConfig,
	init: RequestInit,
): Promise<StageCallResult> {
	const url = `${config.baseUrl}/api/pdf-template-pipeline`;
	let retried = false;
	for (let attempt = 0; ; attempt++) {
		try {
			const response = await fetch(url, {
				...init,
				signal: AbortSignal.timeout(STAGE_TIMEOUT_MS),
			});
			if (response.status >= 500 && attempt === 0) {
				retried = true;
				await Bun.sleep(2000);
				continue;
			}
			const body = (await response.json().catch(() => ({}))) as Record<
				string,
				unknown
			>;
			return { body, retried, status: response.status };
		} catch (e) {
			if (attempt === 0) {
				retried = true;
				await Bun.sleep(2000);
				continue;
			}
			throw e;
		}
	}
}

async function jsonStage(
	config: RunnerConfig,
	payload: Record<string, unknown>,
): Promise<StageCallResult> {
	return callStage(config, {
		body: JSON.stringify(payload),
		headers: {
			...authHeaders(config),
			"content-type": "application/json",
		},
		method: "POST",
	});
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	const hasher = new Bun.CryptoHasher("sha256");
	hasher.update(bytes);
	return hasher.digest("hex");
}

export async function replicatorCommit(replicatorDir: string): Promise<string> {
	const proc = Bun.spawn(["git", "-C", replicatorDir, "rev-parse", "HEAD"], {
		stderr: "pipe",
		stdout: "pipe",
	});
	const out = await new Response(proc.stdout).text();
	await proc.exited;
	return out.trim();
}

/** Delete the item's artifacts via replicator's cleanup script. */
async function cleanupItem(
	config: RunnerConfig,
	record: {
		orgId: string;
		pipelineId?: string | undefined;
		templateId?: string | undefined;
		pageIds: string[];
		widgetIds: string[];
	},
): Promise<Record<string, unknown>> {
	const tmpPath = `${process.env.TMPDIR ?? "/tmp"}/study-as-cleanup.json`;
	await Bun.write(tmpPath, JSON.stringify(record));
	const proc = Bun.spawn(
		[
			"bunx",
			"varlock",
			"run",
			"--",
			"bun",
			"scripts/pdf-pipeline-cleanup.ts",
			tmpPath,
		],
		{
			cwd: config.replicatorDir,
			env: { ...process.env, APP_ENV: "development" },
			stderr: "pipe",
			stdout: "pipe",
		},
	);
	const out = await new Response(proc.stdout).text();
	const err = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		throw new Error(`cleanup exited ${exitCode}: ${err.slice(0, 500)}`);
	}
	const lastLine = out.trim().split("\n").at(-1) ?? "{}";
	return JSON.parse(lastLine) as Record<string, unknown>;
}

export async function runStudyAsItem(
	config: RunnerConfig,
	slug: string,
	tier: string,
	pdfBytes: Uint8Array,
	expectedSha256: string,
): Promise<ItemRunRecord> {
	const startedAt = Date.now();
	const record: ItemRunRecord = {
		baseUrl: config.baseUrl,
		buildCount: 0,
		cleanup: null,
		completed: false,
		fallbackCount: 0,
		finalState: null,
		invariantViolations: [],
		pdfSha256: await sha256Hex(pdfBytes),
		regionCountByPage: {},
		replicatorCommit: await replicatorCommit(config.replicatorDir),
		reuseCount: 0,
		slug,
		stages: [],
		startedAtIso: new Date(startedAt).toISOString(),
		tier,
		totalMs: 0,
		verify: {},
	};

	if (record.pdfSha256 !== expectedSha256) {
		record.error = `corpus hash mismatch: ${record.pdfSha256} != manifest ${expectedSha256}`;
		record.failedStage = "manifest-check";
		record.totalMs = Date.now() - startedAt;
		return record;
	}

	let state: PipelineState | null = null;

	const logStage = (
		stage: string,
		result: StageCallResult,
		ms: number,
		extra: Partial<StageLogEntry> = {},
	) => {
		const { state: _omit, ...meta } = result.body;
		record.stages.push({
			meta,
			ms,
			retried: result.retried,
			stage,
			status: result.status,
			...extra,
		});
	};

	const fail = (stage: string, result: StageCallResult) => {
		record.failedStage = stage;
		record.error =
			typeof result.body.error === "string"
				? result.body.error
				: `HTTP ${result.status}`;
	};

	try {
		// ── start ──
		const form = new FormData();
		form.set("action", "start");
		form.set(
			"file",
			new File([pdfBytes as unknown as Blob], `AS-${slug}.pdf`, {
				type: "application/pdf",
			}),
		);
		let t = Date.now();
		const startResult = await callStage(config, {
			body: form,
			headers: authHeaders(config),
			method: "POST",
		});
		logStage("start", startResult, Date.now() - t);
		if (startResult.status !== 200) {
			fail("start", startResult);
			return record;
		}
		state = startResult.body.state as PipelineState;

		// ── decompose per page ──
		for (const page of state.pages) {
			t = Date.now();
			const result = await jsonStage(config, {
				action: "decompose",
				pageIndex: page.index,
				state,
			});
			logStage("decompose", result, Date.now() - t, {
				pageIndex: page.index,
			});
			if (result.status !== 200) {
				fail(`decompose p${page.index}`, result);
				return record;
			}
			state = result.body.state as PipelineState;
			record.regionCountByPage[String(page.index)] = Number(
				result.body.regionCount ?? 0,
			);
		}

		// ── match per page ──
		for (const page of state.pages) {
			t = Date.now();
			const result = await jsonStage(config, {
				action: "match",
				pageIndex: page.index,
				state,
			});
			logStage("match", result, Date.now() - t, { pageIndex: page.index });
			if (result.status !== 200) {
				fail(`match p${page.index}`, result);
				return record;
			}
			state = result.body.state as PipelineState;
			record.reuseCount += Number(result.body.reuseCount ?? 0);
			record.buildCount += Number(result.body.buildCount ?? 0);
		}

		// ── build per build-decision region ──
		const buildRegionIds = Object.entries(state.decisions)
			.filter(([, d]) => d.action === "build")
			.map(([regionId]) => regionId);
		for (const regionId of buildRegionIds) {
			t = Date.now();
			const result = await jsonStage(config, {
				action: "build",
				regionId,
				state,
			});
			logStage("build", result, Date.now() - t, { regionId });
			if (result.status !== 200) {
				fail(`build ${regionId}`, result);
				return record;
			}
			state = result.body.state as PipelineState;
			if (result.body.fallback === true) record.fallbackCount += 1;
		}

		// ── assemble ──
		t = Date.now();
		const assembleResult = await jsonStage(config, {
			action: "assemble",
			state,
		});
		logStage("assemble", assembleResult, Date.now() - t);
		if (assembleResult.status !== 200) {
			fail("assemble", assembleResult);
			return record;
		}
		state = assembleResult.body.state as PipelineState;
		record.templateId = String(assembleResult.body.templateId ?? "");

		// ── verify per page ──
		for (const page of state.pages) {
			t = Date.now();
			const result = await jsonStage(config, {
				action: "verify",
				pageIndex: page.index,
				state,
			});
			logStage("verify", result, Date.now() - t, { pageIndex: page.index });
			if (result.status !== 200) {
				fail(`verify p${page.index}`, result);
				return record;
			}
			state = result.body.state as PipelineState;
			if (result.body.skipped === true || !result.body.report) {
				// The route degrades verify errors to {skipped} — for the study
				// that is a stage failure (no score exists for the page).
				fail(`verify p${page.index}`, {
					...result,
					body: { error: "verify skipped (internal error)" },
				});
				return record;
			}
			const report = result.body.report as VerifyReport;
			record.verify[String(page.index)] = report;
			if (report.finalScore < report.initialScore) {
				record.invariantViolations.push(`${slug} p${page.index}`);
			}
		}

		record.completed = true;
		return record;
	} finally {
		record.finalState = state;
		record.totalMs = Date.now() - startedAt;
		// Cleanup runs for every item, completed or not — whatever exists.
		if (state) {
			try {
				record.cleanup = await cleanupItem(config, {
					orgId: config.orgId,
					pageIds: Object.values(state.createdPages ?? {}),
					pipelineId: state.pipelineId,
					templateId: record.templateId || undefined,
					widgetIds: Object.values(state.builtWidgets ?? {}).map(
						(b) => b.widgetId,
					),
				});
			} catch (e) {
				record.cleanupError = e instanceof Error ? e.message : String(e);
			}
		}
	}
}
