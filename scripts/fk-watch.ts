/**
 * The Turso FK watch (Study AW's standing tripwire). Four signals,
 * compared against scripts/fk-watch-state.json:
 *
 *  1. drizzle-orm's LATEST (stable) release gains the
 *     `tursodatabase`/`tursodatabase-serverless` export — the moment the
 *     native-driver path stops being rc-only (today it lives on the
 *     `turso-sls` dist-tag).
 *  2. `@tursodatabase/serverless` moves a major version.
 *  3. Turso's pragmas doc stops saying foreign keys are off by default
 *     (or the page goes away) — the default may have changed.
 *  4. The engine's measured BEHAVIOR changes (requires TURSO_API_TOKEN +
 *     TURSO_SANDBOX_ORG + TURSO_SANDBOX_GROUP and the turso CLI; skipped
 *     otherwise): default enforcement, and whether a plain-execute
 *     `PRAGMA foreign_keys = ON` sticks across clients — the behavior
 *     that flipped under us between 2026-11-02 and 2026-11-03.
 *
 * Prints `SIGNAL:` lines and exits 2 when anything moved; exits 0 when
 * quiet. `--update` rewrites the state file to current observations
 * (run it when a signal has been read and acted on). Zero model spend;
 * the probe costs one throwaway database create/destroy.
 */
import { readFileSync, writeFileSync } from "node:fs";

const statePath = new URL("./fk-watch-state.json", import.meta.url).pathname;
const state = JSON.parse(readFileSync(statePath, "utf8"));
const signals: string[] = [];
const now: Record<string, unknown> = {};

// 1 + 2: npm
const dz = (await (await fetch("https://registry.npmjs.org/drizzle-orm")).json()) as {
	"dist-tags": Record<string, string>;
	versions: Record<string, { exports?: Record<string, unknown> }>;
};
const latest = dz["dist-tags"].latest ?? "";
const latestExports = Object.keys(dz.versions[latest]?.exports ?? {});
// Floor assertions (the Replicator agent's rule: zero findings from zero
// inspected is a broken instrument, not a pass). A malformed registry
// response must fail loudly, never read as "no signal".
if (!latest || latestExports.length < 5)
	throw new Error(`floor: drizzle-orm registry response looks broken (latest=${JSON.stringify(latest)}, ${latestExports.length} exports)`);
now.drizzleLatest = latest;
now.drizzleLatestHasTursoExport = latestExports.some((e) => e.includes("tursodatabase"));
if (now.drizzleLatestHasTursoExport && !state.drizzleLatestHasTursoExport)
	signals.push(`SIGNAL: drizzle-orm@latest (${latest}) now ships the tursodatabase driver exports — the stable path exists; re-evaluate the engine driver (Study AW correction, portal response §3).`);

const sls = (await (await fetch("https://registry.npmjs.org/@tursodatabase%2fserverless")).json()) as {
	"dist-tags"?: Record<string, string>;
};
const slsLatest = sls["dist-tags"]?.latest ?? "";
if (!slsLatest) throw new Error("floor: @tursodatabase/serverless registry response has no latest tag");
now.serverlessLatest = slsLatest;
const major = (v: string) => Number(v.split(".")[0] ?? 0);
if (slsLatest && major(slsLatest) !== major(state.serverlessLatest ?? "0"))
	signals.push(`SIGNAL: @tursodatabase/serverless moved a major: ${state.serverlessLatest} → ${slsLatest}.`);

// 3: the pragmas doc
try {
	const doc = (await (await fetch("https://docs.turso.tech/sql-reference/pragmas")).text())
		.toLowerCase()
		.replace(/\s+/g, " ");
	// Floor: a WAF page or stub must not read as "the sentence is gone".
	if (doc.length < 10000 || !doc.includes("foreign"))
		throw new Error(`floor: pragmas doc response looks broken (${doc.length} chars)`);
	now.pragmasOffByDefault = doc.includes("off by default");
	if (state.pragmasOffByDefault && !now.pragmasOffByDefault)
		signals.push("SIGNAL: Turso's pragmas doc no longer says foreign keys are off by default — the default may have changed; re-probe before believing either way.");
} catch (e) {
	now.pragmasOffByDefault = state.pragmasOffByDefault;
	console.log(`note: pragmas doc unreachable (${(e as Error).message}); doc signal skipped this run`);
}

// 4: the behavior probe (optional)
const token = process.env.TURSO_API_TOKEN;
const org = process.env.TURSO_SANDBOX_ORG;
const group = process.env.TURSO_SANDBOX_GROUP;
if (token && org && group) {
	const name = `aw-fk-watch-${Date.now().toString(36)}`;
	const api = async (path: string, init?: RequestInit) => {
		const r = await fetch(`https://api.turso.tech/v1${path}`, {
			...init,
			headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers },
		});
		if (!r.ok) throw new Error(`${r.status} ${path}`);
		return r.json();
	};
	try {
		const tursoBin = Bun.which("turso") ?? `${process.env.HOME}/.turso/turso`;
		const cli = Bun.spawnSync(
			[tursoBin, "db", "create", name, "--group", group, "--tursodb", "--wait"],
			{ env: { ...process.env, TURSO_API_TOKEN: token } },
		);
		if (cli.exitCode !== 0) throw new Error(cli.stderr.toString().slice(0, 120));
		const got = (await api(`/organizations/${org}/databases/${name}`)) as { database?: { Hostname?: string } };
		const tok = (await api(`/organizations/${org}/databases/${name}/auth/tokens`, { method: "POST" })) as { jwt: string };
		const { createClient } = await import("libsql-client-0180");
		const url = `libsql://${got.database?.Hostname}`;
		const fresh = async (sql: string) => {
			const c = createClient({ url, authToken: tok.jwt });
			try {
				return await c.execute(sql);
			} finally {
				c.close();
			}
		};
		const readFresh = async () => Number(Object.values((await fresh("PRAGMA foreign_keys")).rows[0] ?? {})[0]);
		const before = await readFresh();
		await fresh("PRAGMA foreign_keys = ON");
		const afterAcrossClients = await readFresh();
		await fresh("CREATE TABLE p (id TEXT PRIMARY KEY)");
		await fresh("CREATE TABLE ch (id TEXT PRIMARY KEY, pid TEXT NOT NULL REFERENCES p(id) ON DELETE CASCADE)");
		await fresh("INSERT INTO p VALUES ('p1')");
		await fresh("INSERT INTO ch VALUES ('c1','p1')");
		await fresh("DELETE FROM p WHERE id='p1'");
		const cascade = Number((await fresh("SELECT count(*) AS n FROM ch")).rows[0]?.n) === 0;
		now.probe = { cascadeThroughFreshClients: cascade, defaultPragma: before, pragmaSticksAcrossClients: afterAcrossClients === 1 };
		const p = state.probe ?? {};
		for (const k of ["defaultPragma", "pragmaSticksAcrossClients", "cascadeThroughFreshClients"] as const) {
			if ((now.probe as Record<string, unknown>)[k] !== p[k])
				signals.push(`SIGNAL: engine behavior moved — ${k}: ${p[k]} → ${(now.probe as Record<string, unknown>)[k]} (rolling build; the AW lesson).`);
		}
	} finally {
		await api(`/organizations/${org}/databases/${name}`, { method: "DELETE" }).catch(() => {});
	}
} else {
	now.probe = state.probe;
	console.log("note: no sandbox credentials; behavior probe skipped (npm + doc signals only)");
}

console.log("observed:", JSON.stringify(now));
if (process.argv.includes("--update")) {
	writeFileSync(statePath, `${JSON.stringify({ ...state, ...now, updated: new Date().toISOString().slice(0, 10) }, null, "\t")}\n`);
	console.log("state updated");
}
for (const s of signals) console.log(s);
if (signals.length) process.exit(2);
console.log("quiet: nothing moved");
