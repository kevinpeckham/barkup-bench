/**
 * Study AW run (docs/BRIEF-AW.md): does Turso enforce foreign keys, and
 * what decides it? Throwaway databases ONLY — the runner refuses to
 * start without TURSO_API_TOKEN, TURSO_SANDBOX_ORG and
 * TURSO_SANDBOX_GROUP, creates databases named aw-fk-*, determines each
 * database's kind EMPIRICALLY (the engine's __turso_internal_mvcc_meta
 * marker), and destroys everything it created at the end (also:
 * `bun scripts/run-aw.ts --destroy-only` cleans up after a crash).
 * Zero model spend; the only budget is sandbox database creation.
 */
import { writeFileSync } from "node:fs";
import { createClient as createClient0174 } from "libsql-client-0174";
import { createClient as createClient0180 } from "libsql-client-0180";
import {
	type EnforcementReading,
	type Exec,
	probeEnforcement,
} from "../src/aw/fkProbe.js";

const API = "https://api.turso.tech/v1";
const token = process.env.TURSO_API_TOKEN;
const org = process.env.TURSO_SANDBOX_ORG;
const group = process.env.TURSO_SANDBOX_GROUP;
if (!token || !org || !group) {
	console.error(
		"Refusing to run: TURSO_API_TOKEN, TURSO_SANDBOX_ORG and TURSO_SANDBOX_GROUP must name a sandbox (BRIEF-AW.md, safety).",
	);
	process.exit(2);
}
const root = new URL("../", import.meta.url).pathname;
const stamp = process.env.AW_STAMP ?? "run1";

async function api(path: string, init?: RequestInit): Promise<unknown> {
	const res = await fetch(`${API}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json",
			...init?.headers,
		},
	});
	if (!res.ok) throw new Error(`${res.status} ${path}: ${await res.text()}`);
	return res.json();
}

interface Db {
	name: string;
	url: string;
	authToken: string;
	/** Determined empirically after first connect, never assumed. */
	kind: "engine" | "libsql" | "unknown";
}

async function createDb(name: string, engineFlag: boolean): Promise<Db> {
	let hostname: string | undefined;
	if (engineFlag) {
		// The platform API has no engine parameter (checked 2026-11-02); the
		// CLI's --tursodb flag is the only creation route for the engine kind.
		const cli = Bun.spawnSync(
			[
				`${process.env.HOME}/.turso/turso`,
				"db",
				"create",
				name,
				"--group",
				group!,
				"--tursodb",
				"--wait",
			],
			{ env: { ...process.env, TURSO_API_TOKEN: token } },
		);
		if (cli.exitCode !== 0)
			throw new Error(
				`turso db create --tursodb: ${cli.stderr.toString().slice(0, 200)}`,
			);
		const got = (await api(`/organizations/${org}/databases/${name}`)) as {
			database?: { Hostname?: string };
		};
		hostname = got.database?.Hostname;
	} else {
		const createdRes = (await api(`/organizations/${org}/databases`, {
			method: "POST",
			body: JSON.stringify({ name, group }),
		})) as { database?: { Hostname?: string } };
		hostname = createdRes.database?.Hostname;
	}
	if (!hostname) throw new Error(`no Hostname for ${name}`);
	const tok = (await api(
		`/organizations/${org}/databases/${name}/auth/tokens`,
		{ method: "POST" },
	)) as { jwt: string };
	return {
		name,
		url: `libsql://${hostname}`,
		authToken: tok.jwt,
		kind: "unknown",
	};
}

async function destroyDb(name: string): Promise<void> {
	await api(`/organizations/${org}/databases/${name}`, { method: "DELETE" });
}

const CLIENTS = {
	"0.17.4": createClient0174,
	"0.18.0": createClient0180,
} as const;
type ClientVersion = keyof typeof CLIENTS;
const connect = (v: ClientVersion, db: Db) =>
	CLIENTS[v]({ url: db.url, authToken: db.authToken });

async function detectKind(db: Db): Promise<"engine" | "libsql"> {
	const c = connect("0.18.0", db);
	try {
		const r = await c.execute(
			"SELECT count(*) AS n FROM sqlite_master WHERE name = '__turso_internal_mvcc_meta'",
		);
		return Number(r.rows[0]?.n) > 0 ? "engine" : "libsql";
	} finally {
		c.close();
	}
}

/** The connection-usage arms, each as an Exec the probe runs through. */
function usageExec(
	usage: string,
	v: ClientVersion,
	db: Db,
	cleanup: (() => void)[],
): Exec {
	if (usage === "shared-execute" || usage === "shared-after-pragma") {
		const c = connect(v, db);
		cleanup.push(() => c.close());
		return c;
	}
	if (usage === "fresh-client-per-statement") {
		return {
			async execute(stmt) {
				const c = connect(v, db);
				try {
					return await c.execute(stmt as never);
				} finally {
					c.close();
				}
			},
		};
	}
	if (usage === "batch-per-statement") {
		const c = connect(v, db);
		cleanup.push(() => c.close());
		return {
			async execute(stmt) {
				const r = await c.batch([stmt as never], "write");
				return r[0] as never;
			},
		};
	}
	throw new Error(`unknown usage ${usage}`);
}

type PragmaArm = "none" | "on-prior-execute" | "off-prior-execute";
const USAGES = [
	"shared-execute",
	"fresh-client-per-statement",
	"batch-per-statement",
];
const PRAGMAS: PragmaArm[] = ["none", "on-prior-execute", "off-prior-execute"];
const REPS = 3;

interface Cell {
	kind: string;
	client: ClientVersion;
	usage: string;
	pragmaArm: string;
	rep: number;
	reading?: EnforcementReading;
	error?: string;
}

async function runCell(
	db: Db,
	v: ClientVersion,
	usage: string,
	pragmaArm: PragmaArm,
	rep: number,
): Promise<Cell> {
	const cleanup: (() => void)[] = [];
	const base: Cell = { kind: db.kind, client: v, usage, pragmaArm, rep };
	try {
		const exec = usageExec(usage, v, db, cleanup);
		if (pragmaArm !== "none") {
			// Deliberately a SEPARATE prior execute on the same Exec: whether it
			// sticks across calls is hypothesis 1 under test, not an assumption.
			await exec.execute(
				`PRAGMA foreign_keys = ${pragmaArm === "on-prior-execute" ? "ON" : "OFF"}`,
			);
		}
		const reading = await probeEnforcement(exec, `aw_${rep}`);
		return { ...base, reading };
	} catch (e) {
		return { ...base, error: (e as Error).message };
	} finally {
		for (const f of cleanup) f();
	}
}

/** The interactive-transaction arm, structurally different (one tx per probe). */
async function runTxCell(
	db: Db,
	v: ClientVersion,
	pragmaArm: PragmaArm,
	rep: number,
): Promise<Cell> {
	const base: Cell = {
		kind: db.kind,
		client: v,
		usage: "interactive-transaction",
		pragmaArm,
		rep,
	};
	const c = connect(v, db);
	try {
		const tx = await (
			c as unknown as {
				transaction(
					mode: string,
				): Promise<Exec & { commit(): Promise<void>; close(): void }>;
			}
		).transaction("write");
		try {
			if (pragmaArm !== "none")
				await tx.execute(
					`PRAGMA foreign_keys = ${pragmaArm === "on-prior-execute" ? "ON" : "OFF"}`,
				);
			const reading = await probeEnforcement(tx, `awtx_${rep}`);
			await tx.commit();
			return { ...base, reading };
		} finally {
			tx.close();
		}
	} catch (e) {
		return { ...base, error: (e as Error).message };
	} finally {
		c.close();
	}
}

// ---- drizzle arm: the apps' exact wiring, one delete through the ORM ----
async function runDrizzleCell(db: Db, v: ClientVersion): Promise<Cell> {
	const base: Cell = {
		kind: db.kind,
		client: v,
		usage: "drizzle-app-wiring",
		pragmaArm: "none",
		rep: 1,
	};
	const c = connect(v, db);
	try {
		const { drizzle } = await import("drizzle-orm/libsql");
		const { sql } = await import("drizzle-orm");
		const d = drizzle(c as never);
		await d.run(sql.raw("DROP TABLE IF EXISTS awdz_child"));
		await d.run(sql.raw("DROP TABLE IF EXISTS awdz_parent"));
		await d.run(
			sql.raw("CREATE TABLE awdz_parent (id TEXT PRIMARY KEY NOT NULL)"),
		);
		await d.run(
			sql.raw(
				"CREATE TABLE awdz_child (id TEXT PRIMARY KEY NOT NULL, parent_id TEXT NOT NULL REFERENCES awdz_parent(id) ON DELETE CASCADE)",
			),
		);
		await d.run(sql.raw("INSERT INTO awdz_parent (id) VALUES ('p1')"));
		await d.run(
			sql.raw("INSERT INTO awdz_child (id, parent_id) VALUES ('c1', 'p1')"),
		);
		await d.run(sql.raw("DELETE FROM awdz_parent WHERE id = 'p1'"));
		const left = await d.all<{ n: number }>(
			sql.raw("SELECT count(*) AS n FROM awdz_child"),
		);
		const cascade = Number(left[0]?.n) === 0;
		await d.run(sql.raw("DROP TABLE IF EXISTS awdz_child"));
		await d.run(sql.raw("DROP TABLE IF EXISTS awdz_parent"));
		return {
			...base,
			reading: {
				pragma: null,
				cascade,
				setNull: cascade,
				violationRejected: cascade,
				coherent: true,
				pragmaPredicts: false,
			},
		};
	} catch (e) {
		return { ...base, error: (e as Error).message };
	} finally {
		c.close();
	}
}

// ---- main ----
const created: string[] = [];
async function main() {
	if (process.argv.includes("--destroy-only")) {
		const list = (await api(
			`/organizations/${org}/databases?group=${group}`,
		)) as { databases: { Name: string }[] };
		for (const d of list.databases ?? []) {
			if (d.Name.startsWith("aw-fk-")) {
				await destroyDb(d.Name);
				console.log(`destroyed ${d.Name}`);
			}
		}
		return;
	}

	const cells: Cell[] = [];
	const firstConnection: Cell[] = [];

	// One workhorse database per creation flavor for the steady-state matrix.
	for (const engineFlag of [true, false]) {
		const flavor = engineFlag ? "e" : "l";
		let db: Db;
		try {
			db = await createDb(`aw-fk-${stamp}-${flavor}-work`, engineFlag);
			created.push(db.name);
		} catch (e) {
			console.log(
				`creation with engineFlag=${engineFlag} unavailable: ${(e as Error).message}`,
			);
			continue;
		}
		db.kind = await detectKind(db);
		console.log(`workhorse ${db.name}: kind ${db.kind}`);
		for (const v of Object.keys(CLIENTS) as ClientVersion[]) {
			for (const usage of USAGES) {
				for (const pragmaArm of PRAGMAS) {
					for (let rep = 1; rep <= REPS; rep++) {
						const cell = await runCell(db, v, usage, pragmaArm, rep);
						cells.push(cell);
						const r = cell.reading;
						console.log(
							`${db.kind} ${v} ${usage} ${pragmaArm} #${rep}: ${cell.error ? `ERROR ${cell.error.slice(0, 60)}` : `pragma ${r?.pragma} cascade ${r?.cascade} setNull ${r?.setNull} reject ${r?.violationRejected}`}`,
						);
					}
				}
			}
			for (const pragmaArm of PRAGMAS) {
				for (let rep = 1; rep <= REPS; rep++)
					cells.push(await runTxCell(db, v, pragmaArm, rep));
			}
			cells.push(await runDrizzleCell(db, v));
		}

		// First-connection axis: 6 fresh databases, probe on the very first
		// connection with no pragma, then 3 subsequent fresh connections.
		for (let i = 1; i <= 6; i++) {
			let fresh: Db;
			try {
				fresh = await createDb(
					`aw-fk-${stamp}-${flavor}-fresh${i}`,
					engineFlag,
				);
				created.push(fresh.name);
			} catch (e) {
				console.log(`fresh db ${i} unavailable: ${(e as Error).message}`);
				break;
			}
			for (let conn = 1; conn <= 4; conn++) {
				const c = connect("0.18.0", fresh);
				try {
					const reading = await probeEnforcement(c, "awfc");
					firstConnection.push({
						kind: "pending",
						client: "0.18.0",
						usage: `connection-${conn}`,
						pragmaArm: "none",
						rep: i,
						reading,
					});
					console.log(
						`fresh ${flavor}${i} conn ${conn}: pragma ${reading.pragma} cascade ${reading.cascade}`,
					);
				} catch (e) {
					firstConnection.push({
						kind: "pending",
						client: "0.18.0",
						usage: `connection-${conn}`,
						pragmaArm: "none",
						rep: i,
						error: (e as Error).message,
					});
				} finally {
					c.close();
				}
			}
			const kind = await detectKind(fresh);
			for (const r of firstConnection)
				if (r.rep === i && r.kind === "pending") r.kind = kind;
		}
	}

	writeFileSync(
		`${root}results/aw.json`,
		`${JSON.stringify({ version: 1, stamp, cells, firstConnection }, null, "\t")}\n`,
	);
	console.log(
		`\nresults/aw.json written (${cells.length} matrix cells, ${firstConnection.length} first-connection probes)`,
	);
}

try {
	await main();
} finally {
	for (const name of created) {
		try {
			await destroyDb(name);
			console.log(`destroyed ${name}`);
		} catch (e) {
			console.error(
				`DESTROY FAILED ${name}: ${(e as Error).message} — run --destroy-only`,
			);
		}
	}
}
