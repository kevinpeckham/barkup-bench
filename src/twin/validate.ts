/**
 * The JSON twin validator — the single most important fairness artifact
 * in this benchmark (see BRIEF.md).
 *
 * It gives the JSON arms the SAME validation quality the HTML arms get
 * from barkup's parse()/validate(): the same strictness (every check has
 * a barkup counterpart), the same structured error shape (GrammarIssue:
 * code, message, path, nodeId?, attribute?), the same human-readable
 * paths (`document > page(main) > block`), and message wording copied
 * from barkup verbatim wherever the check is identical.
 *
 * Issue-code mapping for JSON-shape problems (there is no eleventh code —
 * every JSON-side failure maps onto the closest barkup markup-side code so
 * error categories stay comparable across arms):
 *
 *   JSON.parse failure            → parse-failed   (adapter failure)
 *   root not exactly one object   → invalid-root   (root-count check)
 *   bare string as a node         → unexpected-text (text content)
 *   non-object node               → unknown-type   (type undeterminable)
 *   missing / non-string "type"   → unknown-type   (missing data-type)
 *   extra node-level property     → reserved-attribute (non-dialect attr)
 *   non-string "name" / "id"      → invalid-attribute-value
 *   malformed "attributes" value  → invalid-attribute-value
 *   malformed "children" value    → invalid-child
 */
import type {
	AttributeSpec,
	AttributeValue,
	BarkupNode,
	GrammarConfig,
	GrammarIssue,
} from "@kevinpeckham/barkup";

export type TwinResult =
	| { ok: true; node: BarkupNode }
	| { ok: false; issues: GrammarIssue[] };

const NODE_PROPERTIES = new Set([
	"type",
	"name",
	"id",
	"attributes",
	"children",
]);

function pathSegment(type: string, name?: string): string {
	return name !== undefined ? `${type}(${name})` : type;
}

function describeJsonValue(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "an array";
	return `a ${typeof value}`;
}

/** Parse a JSON string and validate it as a tree in one pass. */
export function parseJsonTree(config: GrammarConfig, text: string): TwinResult {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch (error) {
		return {
			ok: false,
			issues: [
				{
					code: "parse-failed",
					message: `The input could not be parsed as JSON: ${
						error instanceof Error ? error.message : String(error)
					}`,
					path: "(root)",
				},
			],
		};
	}
	return validateJsonValue(config, value);
}

/** Validate an already-parsed JSON value as a tree over the grammar. */
export function validateJsonValue(
	config: GrammarConfig,
	value: unknown,
): TwinResult {
	const issues: GrammarIssue[] = [];

	if (Array.isArray(value)) {
		issues.push({
			code: "invalid-root",
			message: `Expected exactly one root object, found an array of ${value.length}.`,
			path: "(root)",
		});
		return { ok: false, issues };
	}
	if (value === null || typeof value !== "object") {
		issues.push({
			code: "invalid-root",
			message: `Expected exactly one root object, found ${describeJsonValue(value)}.`,
			path: "(root)",
		});
		return { ok: false, issues };
	}

	const seenIds = new Set<string>();
	const roots = config.roots ?? Object.keys(config.nodes);
	const node = visit(
		config,
		roots,
		value as Record<string, unknown>,
		"",
		true,
		seenIds,
		issues,
	);

	if (issues.length > 0 || node === null) {
		return { ok: false, issues };
	}
	return { ok: true, node };
}

function visit(
	config: GrammarConfig,
	roots: readonly string[],
	raw: Record<string, unknown>,
	parentPath: string,
	isRoot: boolean,
	seenIds: Set<string>,
	issues: GrammarIssue[],
): BarkupNode | null {
	const type = raw.type;
	const name = raw.name;
	const id = raw.id;

	const displayType = typeof type === "string" ? type : "node";
	const displayName = typeof name === "string" ? name : undefined;
	const path = parentPath
		? `${parentPath} > ${pathSegment(displayType, displayName)}`
		: pathSegment(displayType, displayName);
	const issueBase = typeof id === "string" ? { nodeId: id } : {};

	if (type === undefined) {
		issues.push({
			code: "unknown-type",
			message: 'Node has no "type" property.',
			path,
			...issueBase,
		});
		return null;
	}
	if (typeof type !== "string") {
		issues.push({
			code: "unknown-type",
			message: `Node "type" must be a string, found ${describeJsonValue(type)}.`,
			path,
			...issueBase,
		});
		return null;
	}

	const spec = config.nodes[type];
	if (!spec) {
		issues.push({
			code: "unknown-type",
			message: `Node type "${type}" is not declared in the grammar.`,
			path,
			...issueBase,
		});
		return null;
	}

	if (isRoot && !roots.includes(type)) {
		issues.push({
			code: "invalid-root",
			message: `Node type "${type}" is not an allowed root (allowed: ${roots.join(
				", ",
			)}).`,
			path,
			...issueBase,
		});
	}

	for (const key of Object.keys(raw)) {
		if (!NODE_PROPERTIES.has(key)) {
			issues.push({
				code: "reserved-attribute",
				message: `Property "${key}" is not part of the format — nodes have only "type", "name", "id", "attributes", "children".`,
				path,
				attribute: key,
				...issueBase,
			});
		}
	}

	if (name !== undefined && typeof name !== "string") {
		issues.push({
			code: "invalid-attribute-value",
			message: `Property "name" must be a string, found ${describeJsonValue(name)}.`,
			path,
			attribute: "name",
			...issueBase,
		});
	}
	if (id !== undefined && typeof id !== "string") {
		issues.push({
			code: "invalid-attribute-value",
			message: `Property "id" must be a string, found ${describeJsonValue(id)}.`,
			path,
			attribute: "id",
			...issueBase,
		});
	} else if (typeof id === "string") {
		if (seenIds.has(id)) {
			issues.push({
				code: "duplicate-id",
				message: `Duplicate id "${id}".`,
				path,
				nodeId: id,
			});
		}
		seenIds.add(id);
	}

	const attributes = visitAttributes(
		spec.attributes ?? {},
		raw,
		path,
		type,
		issueBase,
		issues,
	);
	const children = visitChildren(
		config,
		roots,
		spec.children ?? [],
		raw,
		path,
		type,
		issueBase,
		seenIds,
		issues,
	);

	const node: BarkupNode = { type };
	if (typeof name === "string") node.name = name;
	if (typeof id === "string") node.id = id;
	if (attributes && Object.keys(attributes).length > 0) {
		node.attributes = attributes;
	}
	if (children.length > 0) node.children = children;
	return node;
}

function visitAttributes(
	declared: Record<string, AttributeSpec>,
	raw: Record<string, unknown>,
	path: string,
	nodeType: string,
	issueBase: { nodeId?: string },
	issues: GrammarIssue[],
): Record<string, AttributeValue> | null {
	const rawAttributes = raw.attributes;
	let provided: Record<string, unknown> = {};

	if (rawAttributes !== undefined) {
		if (
			rawAttributes === null ||
			typeof rawAttributes !== "object" ||
			Array.isArray(rawAttributes)
		) {
			issues.push({
				code: "invalid-attribute-value",
				message: `Property "attributes" must be an object of attribute values, found ${describeJsonValue(
					rawAttributes,
				)}.`,
				path,
				attribute: "attributes",
				...issueBase,
			});
			return null;
		}
		provided = rawAttributes as Record<string, unknown>;
	}

	const out: Record<string, AttributeValue> = {};
	for (const [key, value] of Object.entries(provided)) {
		const spec = declared[key];
		if (!spec) {
			issues.push({
				code: "unknown-attribute",
				message: `Attribute "${key}" is not declared for node type "${nodeType}".`,
				path,
				attribute: key,
				...issueBase,
			});
			continue;
		}
		const problem = checkValue(value, spec);
		if (problem) {
			issues.push({
				code: "invalid-attribute-value",
				message: `Attribute "${key}" ${problem}.`,
				path,
				attribute: key,
				...issueBase,
			});
			continue;
		}
		out[key] = value as AttributeValue;
	}

	for (const [key, spec] of Object.entries(declared)) {
		if (spec.required && !(key in provided)) {
			issues.push({
				code: "missing-attribute",
				message: `Required attribute "${key}" is missing on node type "${nodeType}".`,
				path,
				attribute: key,
				...issueBase,
			});
		}
	}

	return out;
}

function visitChildren(
	config: GrammarConfig,
	roots: readonly string[],
	allowed: readonly string[],
	raw: Record<string, unknown>,
	path: string,
	nodeType: string,
	issueBase: { nodeId?: string },
	seenIds: Set<string>,
	issues: GrammarIssue[],
): BarkupNode[] {
	const rawChildren = raw.children;
	if (rawChildren === undefined) return [];
	if (!Array.isArray(rawChildren)) {
		issues.push({
			code: "invalid-child",
			message: `Property "children" must be an array of nodes, found ${describeJsonValue(
				rawChildren,
			)}.`,
			path,
			...issueBase,
		});
		return [];
	}

	const allowsAny = allowed.includes("*");
	const children: BarkupNode[] = [];
	for (const rawChild of rawChildren) {
		if (typeof rawChild === "string") {
			issues.push({
				code: "unexpected-text",
				message:
					"Text content is not part of the format — put text in a declared attribute.",
				path,
				...issueBase,
			});
			continue;
		}
		if (
			rawChild === null ||
			typeof rawChild !== "object" ||
			Array.isArray(rawChild)
		) {
			issues.push({
				code: "unknown-type",
				message: `Tree nodes must be JSON objects, found ${describeJsonValue(
					rawChild,
				)}.`,
				path,
				...issueBase,
			});
			continue;
		}
		const child = visit(
			config,
			roots,
			rawChild as Record<string, unknown>,
			path,
			false,
			seenIds,
			issues,
		);
		if (!child) continue;
		if (!allowsAny && !allowed.includes(child.type)) {
			issues.push({
				code: "invalid-child",
				message: `Node type "${child.type}" is not an allowed child of "${nodeType}".`,
				path,
				...issueBase,
			});
		}
		children.push(child);
	}
	return children;
}

function checkValue(value: unknown, spec: AttributeSpec): string | null {
	switch (spec.type) {
		case "string":
			return typeof value === "string"
				? null
				: `is declared "string" but is ${describeJsonValue(value).replace(/^an? /, "")}`;
		case "number":
			return typeof value === "number" && Number.isFinite(value)
				? null
				: 'is declared "number" but is not a finite number';
		case "boolean":
			return typeof value === "boolean"
				? null
				: `is declared "boolean" but is ${describeJsonValue(value).replace(/^an? /, "")}`;
		case "json": {
			try {
				return JSON.stringify(value) === undefined
					? 'is declared "json" but is not JSON-serializable'
					: null;
			} catch {
				return 'is declared "json" but is not JSON-serializable';
			}
		}
	}
}
