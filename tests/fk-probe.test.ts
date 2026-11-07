import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient as createClient0174 } from "libsql-client-0174";
import { createClient as createClient0180 } from "libsql-client-0180";
import { probeEnforcement, readPragma } from "../src/aw/fkProbe.js";

/**
 * The Study AW instrument proves itself before it measures anything
 * remote (the wrong-value-generator lesson): on a local file database,
 * where SQLite's pragma semantics are classical and known, the probe
 * must report ENFORCED when foreign_keys is ON and NOT ENFORCED when it
 * is OFF, under both client versions the production apps pin.
 */

const dir = mkdtempSync(join(tmpdir(), "aw-probe-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const CLIENTS = [
	["0.17.4", createClient0174],
	["0.18.0", createClient0180],
] as const;

describe("the fkProbe instrument detects both states on a known-semantics local db", () => {
	for (const [version, create] of CLIENTS) {
		test(`client ${version}: pragma ON means all three behaviors enforced`, async () => {
			const c = create({ url: `file:${join(dir, `on-${version}.db`)}` });
			await c.execute("PRAGMA foreign_keys = ON");
			expect(await readPragma(c)).toBe(1);
			const r = await probeEnforcement(c, "aw");
			expect([r.cascade, r.setNull, r.violationRejected]).toEqual([
				true,
				true,
				true,
			]);
			expect(r.coherent).toBe(true);
			expect(r.pragmaPredicts).toBe(true);
			c.close();
		});
		test(`client ${version}: pragma OFF means none enforced, and the probe says so`, async () => {
			const c = create({ url: `file:${join(dir, `off-${version}.db`)}` });
			await c.execute("PRAGMA foreign_keys = OFF");
			expect(await readPragma(c)).toBe(0);
			const r = await probeEnforcement(c, "aw");
			expect([r.cascade, r.setNull, r.violationRejected]).toEqual([
				false,
				false,
				false,
			]);
			expect(r.coherent).toBe(true);
			expect(r.pragmaPredicts).toBe(true);
			c.close();
		});
	}
	test("the probe leaves no tables behind", async () => {
		const c = createClient0180({ url: `file:${join(dir, "clean.db")}` });
		await c.execute("PRAGMA foreign_keys = ON");
		await probeEnforcement(c, "aw");
		const tables = await c.execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'aw_%'",
		);
		expect(tables.rows).toHaveLength(0);
		c.close();
	});
});
