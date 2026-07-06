/**
 * The benchmark grammar — ONE semantics shared by every condition.
 *
 * Modeled on the document grammar in barkup's tests/helpers.ts (document →
 * page → block → text/image atoms, plus a widget-slot with a json
 * attribute). Both the HTML side (barkup) and the JSON twin derive their
 * constraints from this single config, which is what makes the comparison
 * fair: same node types, same containment, same attribute types.
 */

import type {
	DomParserLike,
	Grammar,
	GrammarConfig,
} from "@kevinpeckham/barkup";
import { defineGrammar, domParserAdapter } from "@kevinpeckham/barkup";
import { DOMParser } from "linkedom";

export const adapter = domParserAdapter(
	new DOMParser() as unknown as DomParserLike,
);

export const BENCH_CONFIG: GrammarConfig = {
	nodes: {
		document: {
			label: "Document",
			children: ["page"],
			attributes: {
				title: { type: "string" },
				theme: { type: "string" },
			},
		},
		page: {
			label: "Page",
			tag: "section",
			children: ["block", "widget-slot"],
			attributes: {
				layoutSize: { type: "string" },
			},
		},
		block: {
			label: "Block",
			children: ["block", "text-atom", "image-atom"],
			attributes: {
				containerClasses: { type: "string" },
				featured: { type: "boolean" },
			},
		},
		"widget-slot": {
			label: "Widget Slot",
			attributes: {
				defaultWidgetId: { type: "string" },
				allowedWidgetIds: { type: "json" },
				requireBleed: { type: "boolean" },
			},
		},
		"text-atom": {
			label: "Text",
			attributes: {
				textStyle: { type: "string" },
				maxLength: { type: "number", required: true },
				minLength: { type: "number" },
				content: { type: "string" },
			},
		},
		"image-atom": {
			label: "Image",
			attributes: {
				src: { type: "string" },
				aspectRatio: { type: "string" },
			},
		},
	},
	roots: ["document"],
};

/** The compiled barkup grammar used by condition A (and D later). */
export const grammar: Grammar = defineGrammar(BENCH_CONFIG, { adapter });
