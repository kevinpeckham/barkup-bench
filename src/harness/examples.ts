/**
 * Study P worked examples (docs/BRIEF-P.md): a fixed example tree
 * unrelated to every corpus tree, and two exchanges targeting the
 * stateless failure class (an ordinal insert and an ordinal move).
 * Instructions come from the corpus's own describeEdit so the phrasing
 * matches real session steps; views come from the same buildView the
 * session runner serializes; replies are bare anchored-patch arrays in
 * the terse style real history exhibits. The examples are independent
 * snapshots of the same base tree, not sequential edits. Their patches
 * are unit-tested to apply cleanly and produce the described outcome.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { buildView, referencedIds } from "../conditions/views.js";
import type { Edit } from "../corpus/edits.js";
import { describeEdit } from "../corpus/edits.js";

export const EXAMPLE_TREE: BarkupNode = {
	type: "document",
	id: "ex-root",
	attributes: { title: "Field Guide" },
	children: [
		{
			type: "page",
			id: "ex-page",
			name: "guide",
			children: [
				{
					type: "block",
					id: "ex-block",
					name: "steps",
					children: [
						{
							type: "text-atom",
							id: "ex-t1",
							name: "first",
							attributes: { maxLength: 40 },
						},
						{ type: "text-atom", id: "ex-t2", attributes: { maxLength: 40 } },
						{ type: "text-atom", id: "ex-t3", attributes: { maxLength: 40 } },
						{ type: "image-atom", id: "ex-img", name: "banner" },
					],
				},
				{ type: "block", id: "ex-aside" },
			],
		},
	],
};

export interface WorkedExample {
	edit: Edit;
	instruction: string;
	view: string;
	reply: string;
}

function exampleView(edit: Edit): string {
	return `${JSON.stringify(buildView(EXAMPLE_TREE, referencedIds(edit), "minimal"), null, 2)}\n`;
}

const insertEdit: Edit = {
	kind: "insert-node",
	parentId: "ex-block",
	index: 2,
	node: { type: "text-atom", name: "note", attributes: { maxLength: 60 } },
};

const moveEdit: Edit = {
	kind: "move-node",
	nodeId: "ex-img",
	newParentId: "ex-block",
	index: 1,
};

/** Pre-registered (BRIEF-P.md): ordinal insert, then ordinal move. */
export const WORKED_EXAMPLES: [WorkedExample, WorkedExample] = [
	{
		edit: insertEdit,
		instruction: describeEdit(EXAMPLE_TREE, insertEdit),
		view: exampleView(insertEdit),
		reply:
			'[{"op": "insert", "node": {"type": "text-atom", "name": "note", "id": "new-note-k4q7", "attributes": {"maxLength": 60}}, "before": "ex-t3"}]',
	},
	{
		edit: moveEdit,
		instruction: describeEdit(EXAMPLE_TREE, moveEdit),
		view: exampleView(moveEdit),
		reply: '[{"op": "move", "id": "ex-img", "before": "ex-t2"}]',
	},
];

/** P-system: the same examples as a system-prompt documentation block. */
export const WORKED_EXAMPLES_BLOCK = `

Worked examples (from a different, unrelated tree):

${WORKED_EXAMPLES.map(
	(example, i) => `Example ${i + 1}:

Here is a focused view of the current tree:

${example.view}
Edit request: ${example.instruction}

Reply:
${example.reply}`,
).join("\n\n")}`;
