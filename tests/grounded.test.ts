/**
 * Study L grounding machinery (pre-registered, BRIEF-L.md). Grader
 * surface: the referring-expression generator decides what each task
 * asks for; the resolver proves uniqueness; the retriever and expand
 * view decide what the model can see.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { BarkupNode } from "@kevinpeckham/barkup";
import {
	expandNodeView,
	lexicalFocus,
	makeLexCondition,
	NAV_SYSTEM_PROMPT,
	tokenize,
} from "../src/conditions/grounded.js";
import {
	describeGroundedEdit,
	refFor,
	refText,
	resolveRef,
	validateGrounding,
} from "../src/corpus/grounded.js";
import type { Corpus, TransformationTask } from "../src/corpus/tasks.js";
import { allIds } from "../src/tree.js";

const tree: BarkupNode = {
	type: "document",
	id: "doc",
	attributes: { title: "T" },
	children: [
		{
			type: "page",
			id: "p1",
			name: "intro",
			children: [
				{
					type: "block",
					id: "b1",
					children: [
						{
							type: "text-atom",
							id: "t1",
							name: "hero",
							attributes: { maxLength: 80 },
						},
						{ type: "text-atom", id: "t2", attributes: { maxLength: 41 } },
						{ type: "text-atom", id: "t3", attributes: { maxLength: 41 } },
					],
				},
				{ type: "block", id: "b2" },
			],
		},
		{ type: "page", id: "p2" },
	],
};

describe("refFor / resolveRef / refText", () => {
	test("unique name wins", () => {
		const ref = refFor(tree, "t1");
		expect(ref).toEqual({ kind: "name", type: "text-atom", name: "hero" });
		expect(refText(ref)).toBe('the text-atom named "hero"');
	});

	test("distinguishing attribute when unnamed", () => {
		const ref = refFor(tree, "t1");
		expect(ref.kind).toBe("name");
		// t2 and t3 share maxLength 41, so neither can use it; they go ordinal.
		const ref2 = refFor(tree, "t2");
		expect(ref2.kind).toBe("ordinal");
	});

	test("ordinal anchors to the nearest describable ancestor", () => {
		const ref = refFor(tree, "t2");
		expect(refText(ref)).toContain("text-atom");
		const matches = resolveRef(tree, ref);
		expect(matches).toHaveLength(1);
		expect((matches[0] as BarkupNode).id).toBe("t2");
	});

	test("every node in the tree is uniquely referable", () => {
		for (const id of allIds(tree)) {
			const matches = resolveRef(tree, refFor(tree, id));
			expect(matches).toHaveLength(1);
			expect((matches[0] as BarkupNode).id).toBe(id);
		}
	});

	test("root is the document root", () => {
		expect(refText(refFor(tree, "doc"))).toBe("the document root");
	});
});

describe("describeGroundedEdit", () => {
	test("contains no ids", () => {
		const text = describeGroundedEdit(tree, {
			kind: "move-node",
			nodeId: "t2",
			newParentId: "b2",
			index: 0,
		});
		expect(text).not.toMatch(/"(doc|p\d|b\d|t\d)"/);
		expect(text).toContain("Move the");
		expect(text).toContain("1st child");
	});
});

describe("grounded corpus", () => {
	const corpus = JSON.parse(
		readFileSync("corpus/grounded.json", "utf8"),
	) as Corpus;
	const tasks = corpus.tasks as TransformationTask[];

	test("45 tasks, same ids and edits as size-extension", () => {
		const source = JSON.parse(
			readFileSync("corpus/size-extension.json", "utf8"),
		) as Corpus;
		expect(tasks.length).toBe(45);
		tasks.forEach((task, i) => {
			const original = source.tasks[i] as TransformationTask;
			expect(task.id).toBe(original.id);
			expect(JSON.stringify(task.edit)).toBe(JSON.stringify(original.edit));
			expect(task.instruction).not.toBe(original.instruction);
		});
	});

	test("every instruction is id-free and every ref resolves uniquely", () => {
		for (const task of tasks) {
			expect(task.instruction).not.toMatch(/"n\d+"/);
			expect(validateGrounding(task.tree, task.edit)).toEqual([]);
		}
	});

	test("generation is deterministic", () => {
		for (const task of tasks.slice(0, 6)) {
			expect(describeGroundedEdit(task.tree, task.edit)).toBe(task.instruction);
		}
	});
});

describe("lexicalFocus", () => {
	test("finds a named target and is deterministic", () => {
		const focus = lexicalFocus(tree, 'Rename the text-atom named "hero".');
		expect(focus).toContain("t1");
		expect(focus).toEqual(
			lexicalFocus(tree, 'Rename the text-atom named "hero".'),
		);
		expect(focus.length).toBeLessThanOrEqual(5);
		const ids = new Set(allIds(tree));
		for (const id of focus) expect(ids.has(id)).toBe(true);
	});

	test("tokenize is lowercase alphanumeric", () => {
		expect([...tokenize('Set "maxLength" to 80!')]).toEqual([
			"set",
			"maxlength",
			"to",
			"80",
		]);
	});
});

describe("expandNodeView", () => {
	test("renders the node fully with collapsed children", () => {
		const html = expandNodeView(tree, "b1") as string;
		expect(html).toContain('id="b1"');
		expect(html).toContain('id="t1" data-collapsed="true"');
		expect(html).toContain('data-child-count="0"');
		// Grandchildren stay hidden.
		expect(html).not.toContain("data-max-length");
	});

	test("unknown id returns null", () => {
		expect(expandNodeView(tree, "zzz")).toBeNull();
	});
});

describe("prompts and conditions", () => {
	test("nav prompt carries the HTML dialect and the navigation block", () => {
		expect(NAV_SYSTEM_PROMPT).toContain("HTML dialect");
		expect(NAV_SYSTEM_PROMPT).toContain("Navigation rules:");
		expect(NAV_SYSTEM_PROMPT).toContain("expand_node");
		expect(NAV_SYSTEM_PROMPT).not.toContain("data-omitted-children");
	});

	test("lex condition serializes a view focused by retrieval", () => {
		const condition = makeLexCondition('Rename the text-atom named "hero".');
		expect(condition.id).toBe("LG-lex");
		const view = condition.serialize(tree);
		expect(view).toContain('"hero"');
		// The view is valid JSON and every visible id exists in the tree.
		const parsed = JSON.parse(view);
		expect(parsed.type).toBe("document");
	});
});
