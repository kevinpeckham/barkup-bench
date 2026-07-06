/** Conditions: serialization round-trips, artifact extraction, tool semantics. */
import { describe, expect, test } from "bun:test";
import type { BarkupNode } from "@kevinpeckham/barkup";
import { nodesEqual } from "@kevinpeckham/barkup/testing";
import { conditionA } from "../src/conditions/a.js";
import { conditionC } from "../src/conditions/c.js";
import { extractArtifact } from "../src/conditions/shared.js";
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

async function call(
	toolDef: unknown,
	input: Record<string, unknown>,
): Promise<{ ok: boolean; nodeId?: string; error?: string }> {
	const t = toolDef as {
		execute: (
			input: unknown,
			options: unknown,
		) => Promise<{ ok: boolean; nodeId?: string; error?: string }>;
	};
	return t.execute(input, { toolCallId: "test", messages: [] });
}

describe("condition A", () => {
	test("serialize → parseArtifact round-trips", () => {
		const markup = conditionA.serialize(tree);
		const parsed = conditionA.parseArtifact(markup);
		expect(parsed.ok).toBe(true);
		if (parsed.ok) expect(nodesEqual(parsed.node, tree)).toBe(true);
	});

	test("accepts fenced output", () => {
		const markup = conditionA.serialize(tree);
		const parsed = conditionA.parseArtifact(
			`Here you go:\n\`\`\`html\n${markup}\`\`\``,
		);
		expect(parsed.ok).toBe(true);
	});

	test("invalid markup yields barkup issues", () => {
		const parsed = conditionA.parseArtifact('<div data-type="blok"></div>');
		expect(parsed.ok).toBe(false);
		if (!parsed.ok) expect(parsed.issues[0]?.code).toBe("unknown-type");
	});
});

describe("extractArtifact", () => {
	test("takes first fenced block, else whole text", () => {
		expect(extractArtifact('```json\n{"a":1}\n```')).toBe('{"a":1}');
		expect(extractArtifact("  plain  ")).toBe("plain");
	});
});

describe("condition C tool session", () => {
	test("happy path: insert, setAttribute, move, setName, remove", async () => {
		const session = conditionC.createSession(tree);
		const inserted = await call(session.tools.insertNode, {
			parentId: "p1",
			type: "block",
			index: 1,
			name: "hero",
		});
		expect(inserted.ok).toBe(true);
		const newId = inserted.nodeId as string;
		expect(findById(session.state.tree, newId)?.name).toBe("hero");

		const setAttr = await call(session.tools.setAttribute, {
			nodeId: newId,
			key: "featured",
			value: true,
		});
		expect(setAttr.ok).toBe(true);

		const moved = await call(session.tools.moveNode, {
			nodeId: "t1",
			newParentId: newId,
			index: 0,
		});
		expect(moved.ok).toBe(true);
		expect(findById(session.state.tree, newId)?.children?.[0]?.id).toBe("t1");

		const named = await call(session.tools.setName, {
			nodeId: "t1",
			name: "headline",
		});
		expect(named.ok).toBe(true);

		const removed = await call(session.tools.removeNode, { nodeId: "b1" });
		expect(removed.ok).toBe(true);
		expect(findById(session.state.tree, "b1")).toBeNull();

		expect(session.toolErrorCount).toBe(0);
		expect(conditionC.validateState(session.state.tree).ok).toBe(true);
	});

	test("realistic failures: stale id, bad containment, bad value, bad index, root ops", async () => {
		const session = conditionC.createSession(tree);
		const stale = await call(session.tools.setAttribute, {
			nodeId: "nope",
			key: "featured",
			value: true,
		});
		expect(stale.ok).toBe(false);
		expect(stale.error).toContain('No node with id "nope"');

		const containment = await call(session.tools.insertNode, {
			parentId: "d1",
			type: "block",
		});
		expect(containment.ok).toBe(false);
		expect(containment.error).toContain("not an allowed child");

		const badValue = await call(session.tools.setAttribute, {
			nodeId: "t1",
			key: "maxLength",
			value: "eighty",
		});
		expect(badValue.ok).toBe(false);

		const badIndex = await call(session.tools.insertNode, {
			parentId: "p1",
			type: "block",
			index: 5,
		});
		expect(badIndex.ok).toBe(false);
		expect(badIndex.error).toContain("out of range");

		const rootRemove = await call(session.tools.removeNode, { nodeId: "d1" });
		expect(rootRemove.ok).toBe(false);

		const cycle = await call(session.tools.moveNode, {
			nodeId: "p1",
			newParentId: "b1",
			index: 0,
		});
		expect(cycle.ok).toBe(false);

		expect(session.toolErrorCount).toBe(6);
		// Failed calls changed nothing.
		expect(nodesEqual(session.state.tree, tree)).toBe(true);
	});

	test("validateState catches missing required attributes after insert", async () => {
		const session = conditionC.createSession(tree);
		const inserted = await call(session.tools.insertNode, {
			parentId: "b1",
			type: "text-atom",
		});
		expect(inserted.ok).toBe(true);
		const validated = conditionC.validateState(session.state.tree);
		expect(validated.ok).toBe(false);
		if (!validated.ok) {
			expect(validated.issues[0]?.code).toBe("missing-attribute");
		}
	});
});
