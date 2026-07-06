/**
 * Replace fast-check's arbitrary attribute values / names with realistic
 * ones, deterministically (seeded Rng). treeArbitrary supplies the tree
 * SHAPE (types, containment, which optional attributes are present);
 * this pass supplies believable content so tasks read like real work
 * instead of unicode noise. Pre-registered corpus policy — runs before
 * any scored run.
 */
import type { AttributeValue, BarkupNode } from "@kevinpeckham/barkup";
import { cloneTree, walkTree } from "../tree.js";
import type { Rng } from "./rng.js";

const WORDS = [
	"alpine",
	"amber",
	"anchor",
	"arbor",
	"atlas",
	"aurora",
	"basalt",
	"beacon",
	"birch",
	"bloom",
	"breeze",
	"canyon",
	"cedar",
	"cobalt",
	"comet",
	"coral",
	"crest",
	"delta",
	"drift",
	"ember",
	"fable",
	"fern",
	"flint",
	"garnet",
	"glade",
	"grove",
	"harbor",
	"hazel",
	"horizon",
	"indigo",
	"iris",
	"jasper",
	"juniper",
	"kestrel",
	"lagoon",
	"larch",
	"lantern",
	"linen",
	"lumen",
	"maple",
	"meadow",
	"mesa",
	"mica",
	"monsoon",
	"moss",
	"north",
	"oak",
	"onyx",
	"opal",
	"orchid",
	"pebble",
	"pine",
	"prairie",
	"quartz",
	"raven",
	"reef",
	"ridge",
	"river",
	"saffron",
	"sage",
	"sierra",
	"slate",
	"sparrow",
	"spruce",
	"summit",
	"tide",
	"timber",
	"topaz",
	"tundra",
	"umber",
	"vale",
	"violet",
	"walnut",
	"willow",
	"zephyr",
] as const;

const THEMES = ["light", "dark", "brand", "high-contrast"] as const;
const LAYOUTS = ["narrow", "standard", "wide", "full-bleed"] as const;
const TEXT_STYLES = [
	"heading",
	"subheading",
	"body",
	"caption",
	"quote",
] as const;
const RATIOS = ["16:9", "4:3", "1:1", "3:2", "21:9"] as const;
const CSS_TOKENS = [
	"p-4",
	"p-8",
	"rounded-lg",
	"shadow",
	"grid",
	"flex",
	"gap-4",
	"border",
	"bg-muted",
	"centered",
] as const;

export function word(rng: Rng): string {
	return rng.pick(WORDS);
}

export function slug(rng: Rng): string {
	return `${word(rng)}-${word(rng)}`;
}

function titleCase(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function sentence(rng: Rng): string {
	const count = rng.int(3, 8);
	const words: string[] = [];
	for (let i = 0; i < count; i += 1) words.push(word(rng));
	return `${titleCase(words.join(" "))}.`;
}

/**
 * A realistic value for a declared attribute of the benchmark grammar.
 * Also used by the edit generator so edit values look like corpus values.
 */
export function generateAttributeValue(
	rng: Rng,
	nodeType: string,
	key: string,
): AttributeValue {
	switch (`${nodeType}.${key}`) {
		case "document.title": {
			const count = rng.int(2, 4);
			const words: string[] = [];
			for (let i = 0; i < count; i += 1) words.push(titleCase(word(rng)));
			return words.join(" ");
		}
		case "document.theme":
			return rng.pick(THEMES);
		case "page.layoutSize":
			return rng.pick(LAYOUTS);
		case "block.containerClasses": {
			const count = rng.int(1, 3);
			const tokens = new Set<string>();
			while (tokens.size < count) tokens.add(rng.pick(CSS_TOKENS));
			return [...tokens].join(" ");
		}
		case "block.featured":
		case "widget-slot.requireBleed":
			return rng.chance(0.5);
		case "widget-slot.defaultWidgetId":
			return `wgt-${word(rng)}`;
		case "widget-slot.allowedWidgetIds": {
			const count = rng.int(1, 4);
			const ids = new Set<string>();
			while (ids.size < count) ids.add(`wgt-${word(rng)}`);
			return [...ids];
		}
		case "text-atom.textStyle":
			return rng.pick(TEXT_STYLES);
		case "text-atom.maxLength":
			return rng.int(20, 200);
		case "text-atom.minLength":
			return rng.int(0, 15);
		case "text-atom.content":
			return sentence(rng);
		case "image-atom.src":
			return `/images/${word(rng)}-${word(rng)}.jpg`;
		case "image-atom.aspectRatio":
			return rng.pick(RATIOS);
		default:
			return word(rng);
	}
}

/**
 * Return a copy of the tree with every present attribute value and every
 * present name replaced by a realistic one. Presence/absence of optional
 * attributes and names is preserved from the arbitrary. Names are made
 * unique tree-wide so tasks can reference "the node named X" without
 * ambiguity.
 */
export function humanizeTree(root: BarkupNode, rng: Rng): BarkupNode {
	const copy = cloneTree(root);
	const usedNames = new Set<string>();
	walkTree(copy, ({ node }) => {
		if (node.name !== undefined) {
			let candidate = slug(rng);
			while (usedNames.has(candidate)) candidate = `${candidate}-${word(rng)}`;
			usedNames.add(candidate);
			node.name = candidate;
		}
		if (node.attributes) {
			for (const key of Object.keys(node.attributes)) {
				node.attributes[key] = generateAttributeValue(rng, node.type, key);
			}
		}
	});
	return copy;
}
