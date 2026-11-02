/**
 * Study AW instrument (docs/BRIEF-AW.md): does this connection enforce
 * foreign keys? Three behaviors probed mechanically — ON DELETE cascade,
 * ON DELETE set null, and rejection of a violating insert — plus the
 * `PRAGMA foreign_keys` reading, kept separate so the study can say
 * whether the reading PREDICTS the behavior. The probe owns its tables
 * (prefixed, dropped before and after) and never touches application
 * data; tests prove it detects both the enforcing and the
 * non-enforcing state on a local database before it is pointed at
 * anything remote.
 */

/** The slice of @libsql/client this probe needs, same across 0.17/0.18. */
export interface Exec {
	execute(
		stmt: string | { sql: string; args: unknown[] },
	): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface EnforcementReading {
	/** `PRAGMA foreign_keys` as reported, before any probe DML. */
	pragma: number | null;
	/** Deleting a parent removed its cascade children. */
	cascade: boolean;
	/** Deleting a parent nulled its set-null references. */
	setNull: boolean;
	/** Inserting a child pointing at a missing parent was rejected. */
	violationRejected: boolean;
	/** The three behaviors agree (all enforced or none). */
	coherent: boolean;
	/** The pragma reading predicts the behavior (1 ⇒ enforced, 0 ⇒ not). */
	pragmaPredicts: boolean;
}

export function createSql(prefix: string): string[] {
	return [
		`CREATE TABLE ${prefix}_parent (id TEXT PRIMARY KEY NOT NULL)`,
		`CREATE TABLE ${prefix}_child (
			id TEXT PRIMARY KEY NOT NULL,
			parent_id TEXT NOT NULL REFERENCES ${prefix}_parent(id) ON DELETE CASCADE,
			owner_id TEXT REFERENCES ${prefix}_parent(id) ON DELETE SET NULL
		)`,
	];
}

export function dropSql(prefix: string): string[] {
	return [
		`DROP TABLE IF EXISTS ${prefix}_child`,
		`DROP TABLE IF EXISTS ${prefix}_parent`,
	];
}

export async function readPragma(c: Exec): Promise<number | null> {
	const r = await c.execute("PRAGMA foreign_keys");
	const v = r.rows[0] ? Object.values(r.rows[0])[0] : null;
	return v === null || v === undefined ? null : Number(v);
}

/**
 * Run the three-behavior probe on one connection. `pragma` is read
 * FIRST, so the reading describes the same connection state the
 * behaviors are measured under. Statements run one `execute` at a
 * time — the connection-usage arms (batch, transaction) wrap this by
 * passing an Exec whose `execute` routes accordingly.
 */
export async function probeEnforcement(
	c: Exec,
	prefix: string,
): Promise<EnforcementReading> {
	const pragma = await readPragma(c);
	for (const s of dropSql(prefix)) await c.execute(s);
	for (const s of createSql(prefix)) await c.execute(s);
	await c.execute({
		sql: `INSERT INTO ${prefix}_parent (id) VALUES (?), (?)`,
		args: ["p1", "p2"],
	});
	await c.execute({
		sql: `INSERT INTO ${prefix}_child (id, parent_id, owner_id) VALUES (?, ?, ?)`,
		args: ["c1", "p1", "p2"],
	});

	// Violating insert: child pointing at a parent that does not exist.
	let violationRejected = false;
	try {
		await c.execute({
			sql: `INSERT INTO ${prefix}_child (id, parent_id) VALUES (?, ?)`,
			args: ["c-bad", "p-missing"],
		});
	} catch {
		violationRejected = true;
	}

	// set null: deleting p2 should null c1.owner_id.
	await c.execute({ sql: `DELETE FROM ${prefix}_parent WHERE id = ?`, args: ["p2"] });
	const owner = await c.execute(
		`SELECT owner_id FROM ${prefix}_child WHERE id = 'c1'`,
	);
	const setNull = owner.rows.length === 1 && owner.rows[0]?.owner_id === null;

	// cascade: deleting p1 should remove c1.
	await c.execute({ sql: `DELETE FROM ${prefix}_parent WHERE id = ?`, args: ["p1"] });
	const left = await c.execute(
		`SELECT count(*) AS n FROM ${prefix}_child WHERE id = 'c1'`,
	);
	const cascade = Number(left.rows[0]?.n) === 0;

	for (const s of dropSql(prefix)) await c.execute(s);

	const enforced = [cascade, setNull, violationRejected];
	const coherent = enforced.every(Boolean) || enforced.every((x) => !x);
	const pragmaPredicts =
		pragma === null
			? false
			: pragma === 1
				? enforced.every(Boolean)
				: enforced.every((x) => !x);
	return { pragma, cascade, setNull, violationRejected, coherent, pragmaPredicts };
}
