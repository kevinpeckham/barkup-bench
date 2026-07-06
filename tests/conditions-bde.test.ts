/** Conditions B, D, E and the regime layer. */
import { describe, expect, test } from "bun:test";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { nodesEqual } from "@kevinpeckham/barkup/testing";
import { conditionB } from "../src/conditions/b.js";
import { conditionD } from "../src/conditions/d.js";
import { conditionE } from "../src/conditions/e.js";
import {
	ALL_CONDITIONS,
	conditionsForRegime,
} from "../src/conditions/index.js";
import { findById } from "../src/tree.js";

const tree: BarkupNode = {
	type: "document",
	id: "d1",
	attributes: { title: "T" },
	children: [
		{
			type: "page",
			id: "p1",
			children: [
				{
					type: "block",
					id: "b1",
					children: [
						{
							type: "text-atom",
							id: "t1",
							attributes: { maxLength: 80 },
						},
					],
				},
			],
		},
	],
};

describe("condition B (JSON rewrite)", () => {
	test("serialize → parseArtifact round-trips", () => {
		const parsed = conditionB.parseArtifact(conditionB.serialize(tree));
		expect(parsed.ok).toBe(true);
		if (parsed.ok) expect(nodesEqual(parsed.node, tree)).toBe(true);
	});

	test("fenced output accepted; invalid JSON yields twin issues", () => {
		const fenced = conditionB.parseArtifact(
			`\`\`\`json\n${conditionB.serialize(tree)}\`\`\``,
		);
		expect(fenced.ok).toBe(true);
		const bad = conditionB.parseArtifact('{"type": "blok"}');
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.issues[0]?.code).toBe("unknown-type");
	});
});

describe("condition D (HTML + tools)", () => {
	test("serializes as markup and validates state via barkup", async () => {
		expect(conditionD.serialize(tree)).toContain('data-type="document"');
		const session = conditionD.createSession(tree);
		const insert = session.tools.insertNode as unknown as {
			execute: (
				input: unknown,
				options: unknown,
			) => Promise<{ ok: boolean; nodeId?: string }>;
		};
		const inserted = await insert.execute(
			{ parentId: "b1", type: "text-atom" },
			{ toolCallId: "t", messages: [] },
		);
		expect(inserted.ok).toBe(true);
		const validated = conditionD.validateState(session.state.tree);
		expect(validated.ok).toBe(false);
		if (!validated.ok) {
			expect(validated.issues[0]?.code).toBe("missing-attribute");
		}
	});
});

describe("condition E (JSON Patch)", () => {
	test("valid patch applies and validates", () => {
		const result = conditionE.applyArtifact(
			'[{"op":"replace","path":"/attributes/title","value":"New"}]',
			tree,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.node.attributes?.title).toBe("New");
			// Untouched parts intact.
			expect(findById(result.node, "t1")).not.toBeNull();
		}
	});

	test("add a node with a fresh id", () => {
		const result = conditionE.applyArtifact(
			`\`\`\`json
[{"op":"add","path":"/children/0/children/1","value":{"type":"widget-slot","id":"w9"}}]
\`\`\``,
			tree,
		);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(findById(result.node, "w9")?.type).toBe("widget-slot");
		}
	});

	test("malformed JSON → parse-failed; non-array → invalid-patch", () => {
		const bad = conditionE.applyArtifact("{oops", tree);
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.issues[0]?.code).toBe("parse-failed");
		const notArray = conditionE.applyArtifact('{"op":"remove"}', tree);
		expect(notArray.ok).toBe(false);
		if (!notArray.ok) expect(notArray.issues[0]?.code).toBe("invalid-patch");
	});

	test("bad path → invalid-patch with the operation index", () => {
		const result = conditionE.applyArtifact(
			'[{"op":"replace","path":"/children/7/attributes/x","value":1}]',
			tree,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]?.code).toBe("invalid-patch");
			expect(result.issues[0]?.message).toContain("Operation 0");
		}
	});

	test("patch that yields an invalid tree → twin issues", () => {
		const result = conditionE.applyArtifact(
			'[{"op":"remove","path":"/children/0/children/0/children/0/attributes/maxLength"}]',
			tree,
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]?.code).toBe("missing-attribute");
		}
	});

	test("base tree is never mutated", () => {
		conditionE.applyArtifact(
			'[{"op":"replace","path":"/attributes/title","value":"Mutated?"}]',
			tree,
		);
		expect(tree.attributes?.title).toBe("T");
	});
});

describe("regimes", () => {
	test("six conditions, parity prompts differ from best-effort", () => {
		expect(ALL_CONDITIONS.map((c) => c.id)).toEqual([
			"A",
			"B",
			"C",
			"D",
			"E",
			"F",
		]);
		const parity = conditionsForRegime("parity");
		const best = conditionsForRegime("best");
		for (let i = 0; i < parity.length; i += 1) {
			const p = parity[i] as (typeof parity)[number];
			const b = best[i] as (typeof best)[number];
			expect(b.systemPrompt.startsWith(p.systemPrompt)).toBe(true);
			expect(b.systemPrompt).toContain("Worked example:");
			expect(b.systemPrompt).toContain("Accuracy rules:");
		}
	});

	test("condition filter works", () => {
		expect(conditionsForRegime("parity", ["A", "C"]).map((c) => c.id)).toEqual([
			"A",
			"C",
		]);
	});
});
