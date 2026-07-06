/**
 * JSON Schema (draft 2020-12) generated from the shared GrammarConfig —
 * the declarative half of the JSON twin. The hand-written validator in
 * validate.ts is what the harness uses (its errors are structured and
 * actionable, which ajv's are not); this schema exists so the twin's
 * strictness can be cross-checked mechanically against an independent
 * implementation (see tests/twin.test.ts).
 *
 * One constraint is not expressible in JSON Schema and is enforced only
 * by the validator: tree-wide id uniqueness (duplicate-id).
 */
import type { GrammarConfig } from "@kevinpeckham/barkup";

export function buildJsonSchema(
	config: GrammarConfig,
): Record<string, unknown> {
	const defs: Record<string, unknown> = {};
	const types = Object.keys(config.nodes);
	const roots = config.roots ?? types;

	for (const [type, spec] of Object.entries(config.nodes)) {
		const attributeProps: Record<string, unknown> = {};
		const requiredAttributes: string[] = [];
		for (const [key, attrSpec] of Object.entries(spec.attributes ?? {})) {
			attributeProps[key] =
				attrSpec.type === "json"
					? {}
					: attrSpec.type === "number"
						? { type: "number" }
						: { type: attrSpec.type };
			if (attrSpec.required) requiredAttributes.push(key);
		}

		const childTypes = spec.children?.includes("*")
			? types
			: [...(spec.children ?? [])];

		const properties: Record<string, unknown> = {
			type: { const: type },
			name: { type: "string" },
			id: { type: "string" },
			attributes: {
				type: "object",
				properties: attributeProps,
				additionalProperties: false,
				...(requiredAttributes.length > 0
					? { required: requiredAttributes }
					: {}),
			},
			children:
				childTypes.length === 0
					? { type: "array", maxItems: 0 }
					: {
							type: "array",
							items: {
								anyOf: childTypes.map((t) => ({ $ref: `#/$defs/${t}` })),
							},
						},
		};

		const required = ["type"];
		if (requiredAttributes.length > 0) required.push("attributes");

		defs[type] = {
			type: "object",
			properties,
			required,
			additionalProperties: false,
		};
	}

	return {
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$defs: defs,
		anyOf: roots.map((t) => ({ $ref: `#/$defs/${t}` })),
	};
}
