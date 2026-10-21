/**
 * Study AS runner CLI — see docs/BRIEF-AS.md (pre-registered).
 *
 * PREVIEW_AUTH_TOKEN must be in the process env, and varlock MASKS secret
 * values in child stdout (so the token cannot be captured from a probe
 * subprocess — by design). Invoke THROUGH the replicator checkout's
 * varlock wrapper; the token then arrives in-process and is never printed:
 *
 *   cd ~/projects/replicator && APP_ENV=development bunx varlock run -- \
 *     bun ~/projects/barkup-bench/scripts/run-study-as.ts --pilot
 *
 * Modes: --pilot (t1-event-flyer + t3-case-study) | --full (all 12,
 * manifest order) | --items a,b,c
 *
 * Env (besides PREVIEW_AUTH_TOKEN, all optional on this VM):
 *   STUDY_AS_BASE_URL   default http://localhost:5183 (replicator-dev.service)
 *   STUDY_AS_ORG_ID     default the SecureLogix org (the preview identity's org)
 *   REPLICATOR_DIR      default <bench>/../replicator
 *
 * Writes one raw record per item to results/raw/study-as/<slug>.json.
 * Items run sequentially in the registered order. A record is written even
 * for failed items (completion is itself a measure, gate G1).
 */

import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
	type ItemRunRecord,
	type RunnerConfig,
	runStudyAsItem,
	sha256Hex,
} from "../src/harness/pdf-pipeline-runner";
import { tierOf } from "../src/harness/study-as-stats";

const BENCH_ROOT = resolve(import.meta.dir, "..");
const CORPUS_DIR = `${BENCH_ROOT}/corpus/pdf-pipeline`;
const RESULTS_DIR = `${BENCH_ROOT}/results/raw/study-as`;
const PILOT_SLUGS = ["t1-event-flyer", "t3-case-study"];
const DEFAULT_ORG_ID = "org-zMHZz-wQJegq5LHcHZA-E"; // SecureLogix

interface ManifestEntry {
	slug: string;
	sha256: string;
}

function resolvePreviewToken(): string {
	const token = process.env.PREVIEW_AUTH_TOKEN ?? "";
	// The preview bypass fails closed under 32 chars; varlock masking also
	// means a token "captured" from a subprocess would be mask glyphs.
	if (token.length < 32) {
		throw new Error(
			"PREVIEW_AUTH_TOKEN missing — invoke through the replicator varlock wrapper (see file header)",
		);
	}
	return token;
}

async function main() {
	const args = process.argv.slice(2);
	const manifest = (await Bun.file(
		`${CORPUS_DIR}/manifest.json`,
	).json()) as ManifestEntry[];

	let slugs: string[];
	if (args.includes("--pilot")) {
		slugs = PILOT_SLUGS;
	} else if (args.includes("--full")) {
		slugs = manifest.map((m) => m.slug);
	} else {
		const itemsArg = args[args.indexOf("--items") + 1];
		if (!args.includes("--items") || !itemsArg) {
			console.error("Usage: run-study-as.ts --pilot | --full | --items a,b,c");
			process.exit(1);
		}
		slugs = itemsArg.split(",").map((s) => s.trim());
	}

	const replicatorDir = resolve(
		process.env.REPLICATOR_DIR ?? `${BENCH_ROOT}/../replicator`,
	);
	const config: RunnerConfig = {
		baseUrl: process.env.STUDY_AS_BASE_URL ?? "http://localhost:5183",
		orgId: process.env.STUDY_AS_ORG_ID ?? DEFAULT_ORG_ID,
		previewToken: resolvePreviewToken(),
		replicatorDir,
	};

	await mkdir(RESULTS_DIR, { recursive: true });

	for (const slug of slugs) {
		const entry = manifest.find((m) => m.slug === slug);
		if (!entry) {
			console.error(`"${slug}" is not in the corpus manifest — skipping`);
			continue;
		}
		const pdfBytes = new Uint8Array(
			await Bun.file(`${CORPUS_DIR}/pdf/${slug}.pdf`).arrayBuffer(),
		);
		console.log(
			`\n=== ${slug} (${tierOf(slug)}) — ${(pdfBytes.length / 1024).toFixed(0)} KB, sha ${(await sha256Hex(pdfBytes)).slice(0, 12)}… ===`,
		);
		const record: ItemRunRecord = await runStudyAsItem(
			config,
			slug,
			tierOf(slug),
			pdfBytes,
			entry.sha256,
		);
		const outPath = `${RESULTS_DIR}/${slug}.json`;
		await Bun.write(outPath, JSON.stringify(record, null, "\t"));

		const verdict = record.completed ? "COMPLETED" : "FAILED";
		const scores = Object.entries(record.verify)
			.map(
				([i, r]) =>
					`p${i} ${r.initialScore.toFixed(3)}→${r.finalScore.toFixed(3)}${r.reverted ? " (reverted)" : ""}`,
			)
			.join(", ");
		console.log(
			`${verdict} in ${(record.totalMs / 1000).toFixed(0)}s — regions ${Object.values(
				record.regionCountByPage,
			).reduce(
				(a, b) => a + b,
				0,
			)}, reuse ${record.reuseCount}, build ${record.buildCount} (${record.fallbackCount} fallback)` +
				(scores ? ` — ${scores}` : "") +
				(record.failedStage
					? ` — failed at ${record.failedStage}: ${record.error}`
					: "") +
				(record.cleanupError
					? ` — CLEANUP ERROR: ${record.cleanupError}`
					: ` — cleanup ${JSON.stringify(record.cleanup)}`),
		);
		if (record.invariantViolations.length > 0) {
			console.error(
				`!!! KEEP-BEST INVARIANT VIOLATED: ${record.invariantViolations.join(", ")} (gate G3a fails; replicator bug)`,
			);
		}
	}
	console.log("\nDone. Analyze with: bun scripts/analyze-study-as.ts");
}

await main();
