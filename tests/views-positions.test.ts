/**
 * Study O positioned views (pre-registered, BRIEF-O.md): position
 * numbering is grader-adjacent (it is what the intervention shows the
 * model), so it gets tests — including positions under omitted
 * siblings, where view-relative numbering would silently lie.
 */
import { describe, expect, test } from "bun:test";
import type { BarkupNode } from "@kevinpeckham/barkup";
import {
	buildView,
	POSITION_RULE,
	serializeView,
} from "../src/conditions/views.js";
import {
	POLICY_CONDITION,
	STATELESS_SYSTEM_POS,
	VIEW_SYSTEM_POS,
} from "../src/harness/session-runner.js";

const tree: BarkupNode = {
	type: "document",
	id: "doc",
	children: [
		{ type: "page", id: "a" },
		{ type: "page", id: "b" },
		{
			type: "page",
			id: "c",
			children: [
				{ type: "block", id: "x" },
				{ type: "block", id: "target" },
				{ type: "block", id: "z" },
			],
		},
	],
};

type ViewNode = Record<string, unknown> & { children?: ViewNode[] };

describe("buildView positions", () => {
	test("root carries no position; focus children carry 1-based positions", () => {
		const view = buildView(tree, ["c"], "minimal", true) as ViewNode;
		expect(view.position).toBeUndefined();
		const c = view.children?.find((n) => n.id === "c") as ViewNode;
		const positions = (c.children ?? []).map((n) => n.position);
		expect(positions).toEqual([1, 2, 3]);
	});

	test("positions count omitted siblings (true positions, never view-relative)", () => {
		// Focus deep so root's other children are omitted in minimal mode:
		// c is the 3rd child of doc even though a and b are not rendered.
		const view = buildView(tree, ["target"], "minimal", true) as ViewNode;
		expect(view.omittedChildren).toBe(2);
		const c = view.children?.[0] as ViewNode;
		expect(c.id).toBe("c");
		expect(c.position).toBe(3);
		const target = c.children?.find((n) => n.id === "target") as ViewNode;
		expect(target.position).toBe(2);
	});

	test("positions off (and by default) leaves the view untouched", () => {
		expect(serializeView(tree, ["c"], "minimal")).not.toContain('"position"');
		expect(JSON.stringify(buildView(tree, ["target"], "minimal", false))).toBe(
			JSON.stringify(buildView(tree, ["target"], "minimal")),
		);
	});
});

describe("Study O policy wiring", () => {
	test("condition ids follow the brief", () => {
		expect(POLICY_CONDITION.statelessPos).toBe("O-stateless");
		expect(POLICY_CONDITION.viewPos).toBe("O-view");
	});

	test("position rule text is the pre-registered line, appended to both prompts", () => {
		expect(POSITION_RULE).toContain("1-based position");
		expect(POSITION_RULE).toContain("counting children the view does not show");
		expect(STATELESS_SYSTEM_POS.endsWith(POSITION_RULE)).toBe(true);
		expect(VIEW_SYSTEM_POS.endsWith(POSITION_RULE)).toBe(true);
		expect(STATELESS_SYSTEM_POS).toContain("as it stands right now");
		expect(VIEW_SYSTEM_POS).toContain("arrive one at a time");
	});
});
