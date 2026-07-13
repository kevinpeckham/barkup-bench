/**
 * Study Z standing-context corpus (docs/BRIEF-Z.md): seeded org packs
 * (About → Solutions → four clients → a 12-rule styleguide) with
 * planted, machine-checkable obligations. Each pack carries one
 * target client, three same-schema distractors (the near-miss bait),
 * and governing rules at controlled styleguide positions. Twelve
 * packs × three tasks (fact / rule / combined) over a fixed
 * four-slot document.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { findById } from "../tree.js";
import { nodeRef } from "./edits.js";
import { word } from "./humanize.js";
import type { Rng } from "./rng.js";

export type StandingKind = "fact" | "rule" | "combined";
export type RulePosition = "head" | "middle" | "tail";
export type RuleTaskForm = "headline" | "tagline" | "cta";

export interface ClientFacts {
	name: string;
	slug: string;
	email: string;
	phone: string;
	product: string;
	city: string;
	tagline: string;
}

export interface StandingTask {
	id: string;
	family: "transformation";
	bucket: "xs";
	packId: string;
	kind: StandingKind;
	/** rule tasks only */
	form?: RuleTaskForm;
	rulePosition?: RulePosition;
	tree: BarkupNode;
	pack: string;
	slicePack: string;
	/** Distilled governing-rule notes for the Z-memo arm. */
	memoRules: string[];
	instruction: string;
	targetId: string;
	target: ClientFacts;
	distractors: ClientFacts[];
	/** Machine-checkable obligations, evaluated by gradeStanding. */
	obligations: string[];
}

/** Registered pools (BRIEF-Z.md). Product names and cities are
 * capitalized single words disjoint from the humanizer vocabulary
 * by suffix digits on nothing — checked disjoint per pack instead. */
const PRODUCT_POOL = [
	"Kestrelline",
	"Northglide",
	"Suncrest",
	"Deepwake",
	"Fernlight",
	"Stonebriar",
	"Cloudmere",
	"Ironquill",
] as const;

const CITY_POOL = [
	"Ashford",
	"Brindale",
	"Corvane",
	"Dunmore",
	"Eastwick",
	"Farrowdale",
] as const;

export const RULE_TEXTS = {
	tm: (product: string) =>
		`Product names always carry the ™ mark: write "${product}™" on every mention.`,
	cta: `Calls to action always read exactly "Get Started".`,
	style: `Headlines always use the textStyle "display-serif".`,
	end: `Taglines always end with the phrase "Built to Endure."`,
	contact: `Contact lines always follow the form "{email} | {city}".`,
} as const;

/** Registered filler rules — real-sounding, never machine-graded,
 * chosen not to conflict with any governing obligation. */
export const FILLER_RULES = [
	"Prefer active voice in all copy.",
	"Keep paragraphs to three sentences or fewer.",
	"Use sentence case for navigation labels.",
	"Avoid jargon unless the audience is technical.",
	"Numbers one through nine are spelled out in prose.",
	"Every page links back to the client's main site.",
	"Photography is preferred over illustration for case studies.",
	"Alt text describes function before appearance.",
	"Dates are written in the month-day-year form.",
	"Quotations are attributed with full name and role.",
] as const;

const ABOUT_SENTENCES = [
	"We are a design and engineering studio serving mid-market brands.",
	"Our teams pair strategists with builders on every engagement.",
	"We measure our work by outcomes our clients can audit.",
	"The studio has shipped platform work across four industries.",
] as const;

const SOLUTION_LINES = [
	"Brand systems: identity, voice, and governance.",
	"Platform builds: content systems and commerce.",
	"Growth engineering: experimentation and analytics.",
	"Managed evolution: continuous design and delivery.",
] as const;

/**
 * Combinatorial filler prose (registered pools): subject × verb ×
 * complement gives 10 × 8 × 10 = 800 distinct sentences, so the
 * padding that brings each pack into the registered 3–5k-token band
 * reads as varied agency boilerplate. None of these fragments can
 * collide with a planted value or a governing-rule token by
 * construction (no ™, no pipe, no quoted phrases, no client slugs).
 */
const FILLER_SUBJECTS = [
	"Our strategy team",
	"The engineering group",
	"Every engagement lead",
	"The design practice",
	"Our research staff",
	"The delivery office",
	"Each account partner",
	"The platform guild",
	"Our editorial desk",
	"The measurement team",
] as const;

const FILLER_VERBS = [
	"documents",
	"reviews",
	"coordinates",
	"maintains",
	"audits",
	"prototypes",
	"schedules",
	"benchmarks",
] as const;

const FILLER_COMPLEMENTS = [
	"quarterly roadmaps with client stakeholders",
	"component libraries across active engagements",
	"accessibility findings before every release",
	"content models for long-running platforms",
	"analytics dashboards for weekly readouts",
	"migration plans for legacy publishing stacks",
	"onboarding guides for embedded contractors",
	"retrospective notes after each milestone",
	"capacity forecasts for the coming quarter",
	"integration checklists for third-party vendors",
] as const;

function fillerSentence(rng: Rng): string {
	return `${rng.pick([...FILLER_SUBJECTS])} ${rng.pick([...FILLER_VERBS])} ${rng.pick([...FILLER_COMPLEMENTS])}.`;
}

function fillerParagraph(rng: Rng, sentences: number): string {
	return Array.from({ length: sentences }, () => fillerSentence(rng)).join(" ");
}

/** Registered pack-size band (BRIEF-Z.md: ~3–5k tokens ≈ 4 chars/token). */
export const PACK_MIN_CHARS = 13000;
export const PACK_MAX_CHARS = 20000;

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

export function generateClient(
	rng: Rng,
	taken: Set<string>,
	product: string,
	city: string,
): ClientFacts {
	let slugName = `${word(rng)}-${word(rng)}`;
	while (taken.has(slugName)) slugName = `${word(rng)}-${word(rng)}`;
	taken.add(slugName);
	const name = titleCase(slugName);
	const phone = `+1 (555) 0${rng.int(10, 99)}-${rng.int(1000, 9999)}`;
	return {
		name,
		slug: slugName,
		email: `hello@${slugName}.example`,
		phone,
		product,
		city,
		tagline: `${name} makes ${product} for teams in ${city}.`,
	};
}

export interface GoverningRule {
	key: keyof typeof RULE_TEXTS;
	text: string;
}

/**
 * Governing-rule slot bands. BRIEF-Z registers 2-slot bands (1–2 /
 * 6–7 / 11–12) for "the two governing rules per task", but one pack
 * text serves all three of its tasks and the union of the rule-task
 * and combined-task governing rules is THREE rules (they share R-tm),
 * so the bands hold three slots: head 1–3, middle 6–8, tail 10–12
 * (tail shifted down so all three fit). Position semantics unchanged;
 * disclosed as a protocol note.
 */
const POSITION_SLOTS: Record<RulePosition, [number, number]> = {
	head: [1, 3],
	middle: [6, 8],
	tail: [10, 12],
};

/** The slice arm's pack: About header, target client, governing rules. */
export function renderSlice(
	orgName: string,
	target: ClientFacts,
	governing: GoverningRule[],
): string {
	const styleguide =
		governing.length > 0
			? `\n\n## Styleguide (applicable rules)\n${governing.map((g, i) => `${i + 1}. ${g.text}`).join("\n")}`
			: "";
	return `# ${orgName} — Agency Context (relevant excerpt)

## Client
### ${target.name}
- Contact email: ${target.email}
- Phone: ${target.phone}
- Product: ${target.product}
- City: ${target.city}
- Tagline: ${target.tagline}${styleguide}`;
}

/** The fixed four-slot document every pack's tasks edit. */
export function buildStandingTree(): BarkupNode {
	const atom = (id: string, name: string, content: string): BarkupNode => ({
		type: "text-atom",
		id,
		name,
		attributes: { textStyle: "body", maxLength: 300, content },
	});
	return {
		type: "document",
		id: "n1",
		name: "client-page",
		attributes: { title: "Client Page", theme: "light" },
		children: [
			{
				type: "page",
				id: "n2",
				name: "main",
				attributes: { layoutSize: "standard" },
				children: [
					{
						type: "block",
						id: "n3",
						name: "hero",
						children: [
							atom("n4", "headline-slot", "(headline pending)"),
							atom("n5", "cta-slot", "(cta pending)"),
						],
					},
					{
						type: "block",
						id: "n6",
						name: "footer",
						children: [
							atom("n7", "tagline-slot", "(tagline pending)"),
							atom("n8", "contact-slot", "(contact pending)"),
						],
					},
				],
			},
		],
	};
}

const FACT_FIELDS = ["email", "phone", "product"] as const;

export function generateStandingPack(
	rng: Rng,
	packIndex: number,
): StandingTask[] {
	const taken = new Set<string>();
	const orgName = titleCase(`${word(rng)}-collective`);
	// Products and cities must differ across pack clients (near-miss
	// integrity: contamination detection needs distinct values), so
	// draw four distinct of each up front.
	const drawDistinct = (pool: readonly string[], count: number): string[] => {
		const remaining = [...pool];
		const out: string[] = [];
		for (let i = 0; i < count; i += 1) {
			const idx = rng.int(0, remaining.length - 1);
			out.push(remaining.splice(idx, 1)[0] as string);
		}
		return out;
	};
	const products = drawDistinct(PRODUCT_POOL, 4);
	const cities = drawDistinct(CITY_POOL, 4);
	const clients = Array.from({ length: 4 }, (_, i) =>
		generateClient(rng, taken, products[i] as string, cities[i] as string),
	);
	const target = clients[rng.int(0, 3)] as ClientFacts;
	const distractors = clients.filter((c) => c !== target);
	const tree = buildStandingTree();
	const packId = `pack-${packIndex + 1}`;
	const positions: RulePosition[] = ["head", "middle", "tail"];
	const rulePosition = positions[packIndex % 3] as RulePosition;
	const forms: RuleTaskForm[] = ["headline", "tagline", "cta"];
	const form = forms[packIndex % 3] as RuleTaskForm;

	// Governing rules for the rule task (by form) and combined task.
	const ruleGoverning: GoverningRule[] =
		form === "headline"
			? [
					{ key: "tm", text: RULE_TEXTS.tm(target.product) },
					{ key: "style", text: RULE_TEXTS.style },
				]
			: form === "tagline"
				? [
						{ key: "tm", text: RULE_TEXTS.tm(target.product) },
						{ key: "end", text: RULE_TEXTS.end },
					]
				: [{ key: "cta", text: RULE_TEXTS.cta }];
	const combinedGoverning: GoverningRule[] = [
		{ key: "contact", text: RULE_TEXTS.contact },
		{ key: "tm", text: RULE_TEXTS.tm(target.product) },
	];

	// One pack text serves the whole pack's three tasks: rule + combined
	// governing rules all placed at this pack's position band. The
	// styleguide carries the union (deduplicated by key).
	const union: GoverningRule[] = [];
	for (const g of [...ruleGoverning, ...combinedGoverning]) {
		if (!union.some((u) => u.key === g.key)) union.push(g);
	}
	// POSITION_SLOTS carries two slots; a union larger than two extends
	// into the following slots deterministically.
	const pack = renderPack(orgName, clients, union, rulePosition, rng);

	const factField = FACT_FIELDS[packIndex % FACT_FIELDS.length] as
		| "email"
		| "phone"
		| "product";
	const factValue = target[factField];
	const factLabel =
		factField === "email"
			? "contact email"
			: factField === "phone"
				? "phone number"
				: "product name";

	const tasks: StandingTask[] = [];

	tasks.push({
		id: `stand-${packIndex + 1}-fact`,
		family: "transformation",
		bucket: "xs",
		packId,
		kind: "fact",
		tree,
		pack,
		slicePack: renderSlice(orgName, target, []),
		memoRules: [],
		instruction: `Set the "content" attribute of ${nodeRef(tree, "n8")} to ${target.name}'s ${factLabel}, exactly as our records have it.`,
		targetId: "n8",
		target,
		distractors,
		obligations: [`fact:${factField}:${factValue}`],
	});

	const ruleSlot =
		form === "headline" ? "n4" : form === "tagline" ? "n7" : "n5";
	const ruleInstruction =
		form === "headline"
			? `Write the headline for ${target.name}'s launch page in ${nodeRef(tree, "n4")}, mentioning their product ${target.product}. Set the "content" attribute (and any attribute our style calls for).`
			: form === "tagline"
				? `Write a one-sentence tagline for ${target.name} in ${nodeRef(tree, "n7")}, mentioning their product ${target.product}. Set the "content" attribute.`
				: `Set the "content" attribute of ${nodeRef(tree, "n5")} with an appropriate call to action for ${target.name}'s page.`;
	tasks.push({
		id: `stand-${packIndex + 1}-rule`,
		family: "transformation",
		bucket: "xs",
		packId,
		kind: "rule",
		form,
		rulePosition,
		tree,
		pack,
		slicePack: renderSlice(orgName, target, ruleGoverning),
		memoRules: ruleGoverning.map((g) => g.text),
		instruction: ruleInstruction,
		targetId: ruleSlot,
		target,
		distractors,
		obligations:
			form === "headline"
				? [`tm:${target.product}`, "style:display-serif"]
				: form === "tagline"
					? [`tm:${target.product}`, "end:Built to Endure."]
					: ["cta:Get Started"],
	});

	tasks.push({
		id: `stand-${packIndex + 1}-combined`,
		family: "transformation",
		bucket: "xs",
		packId,
		kind: "combined",
		rulePosition,
		tree,
		pack,
		slicePack: renderSlice(orgName, target, combinedGoverning),
		memoRules: combinedGoverning.map((g) => g.text),
		instruction: `Set the footer contact line for ${target.name} in ${nodeRef(tree, "n8")}, using our standard contact format and mentioning their product ${target.product}.`,
		targetId: "n8",
		target,
		distractors,
		obligations: [
			`contact:${target.email} | ${target.city}`,
			`tm:${target.product}`,
		],
	});

	return tasks;
}

/** Render the pack skeleton (BRIEF-Z.md, registered): the governing
 * union fills the position band's consecutive slots. */
export function renderPack(
	orgName: string,
	clients: ClientFacts[],
	governing: GoverningRule[],
	position: RulePosition,
	rng: Rng,
): string {
	const rules: string[] = [];
	const fillers: string[] = [...FILLER_RULES];
	for (let i = fillers.length - 1; i > 0; i -= 1) {
		const j = rng.int(0, i);
		const a = fillers[i] as string;
		fillers[i] = fillers[j] as string;
		fillers[j] = a;
	}
	const start = POSITION_SLOTS[position][0];
	let fillerIdx = 0;
	for (let n = 1; n <= 12; n += 1) {
		const gIdx = n - start;
		if (gIdx >= 0 && gIdx < governing.length) {
			rules.push(`${n}. ${(governing[gIdx] as GoverningRule).text}`);
		} else {
			rules.push(`${n}. ${fillers[fillerIdx % fillers.length]}`);
			fillerIdx += 1;
		}
	}
	const clientSections = clients
		.map(
			(c) =>
				`### ${c.name}\n- Contact email: ${c.email}\n- Phone: ${c.phone}\n- Product: ${c.product}\n- City: ${c.city}\n- Tagline: ${c.tagline}\n\n${fillerParagraph(rng, 4)}`,
		)
		.join("\n\n");
	const about = Array.from({ length: 3 }, () => fillerParagraph(rng, 6));
	const render = (
		waysOfWorking: string[],
	): string => `# ${orgName} — Agency Context

## About ${orgName}
${ABOUT_SENTENCES.join(" ")}

${about.join("\n\n")}

## Solutions
${SOLUTION_LINES.map((l) => `- ${l} ${fillerSentence(rng)}`).join("\n")}

## Ways of working
${waysOfWorking.join("\n\n")}

## Clients
${clientSections}

## Styleguide
${rules.join("\n")}`;
	// Pad into the registered 3–5k-token band by growing the
	// Ways-of-working prose — the registered skeleton order (About →
	// Solutions → Clients → Styleguide last) stays intact, and the
	// styleguide's head/middle/tail band semantics are untouched.
	const waysOfWorking = [fillerParagraph(rng, 6)];
	let pack = render(waysOfWorking);
	while (pack.length < PACK_MIN_CHARS) {
		waysOfWorking.push(fillerParagraph(rng, 6));
		pack = render(waysOfWorking);
	}
	return pack;
}

export interface StandingGrade {
	success: boolean;
	failedObligations: string[];
	/** Distractor same-schema values found in the output. */
	contamination: string[];
}

/** The registered obligation graders (BRIEF-Z.md). Deterministic. */
export function gradeStanding(
	task: StandingTask,
	finalTree: BarkupNode,
): StandingGrade {
	const node = findById(finalTree, task.targetId);
	const content = String(node?.attributes?.content ?? "");
	const failed: string[] = [];
	for (const ob of task.obligations) {
		const [type, ...rest] = ob.split(":");
		const value = rest.join(":");
		if (type === "fact") {
			// fact obligations encode fact:{field}:{value}
			const expectedValue = ob.split(":").slice(2).join(":");
			if (!content.includes(expectedValue)) failed.push(ob);
		} else if (type === "tm") {
			if (!content.includes(`${value}™`)) failed.push(ob);
		} else if (type === "style") {
			if (node?.attributes?.textStyle !== value) failed.push(ob);
		} else if (type === "end") {
			if (!content.trimEnd().endsWith(value)) failed.push(ob);
		} else if (type === "cta") {
			if (content.trim() !== value) failed.push(ob);
		} else if (type === "contact") {
			if (!content.includes(value)) failed.push(ob);
		}
	}
	const contamination: string[] = [];
	for (const d of task.distractors) {
		for (const v of [d.email, d.phone, d.product, d.city]) {
			if (v && content.includes(v)) contamination.push(`${d.name}:${v}`);
		}
	}
	return {
		success: failed.length === 0,
		failedObligations: failed,
		contamination,
	};
}

/** BRIEF-Z validation, per task. */
export function validateStandingTask(task: StandingTask): string[] {
	const problems: string[] = [];
	// Needed values never in instruction or tree.
	const needles: string[] = [];
	for (const ob of task.obligations) {
		if (ob.startsWith("fact:")) needles.push(ob.split(":").slice(2).join(":"));
		if (ob.startsWith("contact:"))
			needles.push(task.target.email, task.target.city);
		if (ob.startsWith("cta:")) needles.push("Get Started");
		if (ob.startsWith("end:")) needles.push("Built to Endure.");
		if (ob.startsWith("style:")) needles.push("display-serif");
	}
	for (const n of needles) {
		if (task.instruction.includes(n)) {
			problems.push(`${task.id}: instruction leaks "${n}"`);
		}
		if (JSON.stringify(task.tree).includes(n)) {
			problems.push(`${task.id}: tree leaks "${n}"`);
		}
		if (!task.pack.includes(n)) {
			problems.push(`${task.id}: pack missing "${n}"`);
		}
		if (!task.slicePack.includes(n) && task.kind !== "fact") {
			problems.push(`${task.id}: slice missing "${n}"`);
		}
	}
	// Fact tasks: slice must carry the fact even with no governing rules,
	// and the fact value belongs to the target's client section ONLY —
	// no distractor section may contain it. (Product names also appear in
	// the target's tagline and the R-tm rule text; both still denote the
	// target's value, so section-scoped exclusivity is the real invariant.)
	if (task.kind === "fact") {
		const value = (task.obligations[0] as string).split(":").slice(2).join(":");
		if (!task.slicePack.includes(value)) {
			problems.push(`${task.id}: slice missing fact value`);
		}
		// Each client section runs to the next heading (h3 or h2).
		const sections = task.pack
			.split("### ")
			.slice(1)
			.map((s) => s.split("\n## ")[0] as string);
		const targetSection = sections.find((s) => s.startsWith(task.target.name));
		if (!targetSection?.includes(value)) {
			problems.push(`${task.id}: fact value missing from target section`);
		}
		for (const d of task.distractors) {
			const sec = sections.find((s) => s.startsWith(d.name));
			if (sec?.includes(value)) {
				problems.push(`${task.id}: fact value leaks into ${d.name} section`);
			}
		}
	}
	// Governing-rule tokens absent from instructions: no ™ hint either.
	if (task.instruction.includes("™")) {
		problems.push(`${task.id}: instruction leaks the ™ mark`);
	}
	// Registered pack-size band (~3–5k tokens).
	if (task.pack.length < PACK_MIN_CHARS || task.pack.length > PACK_MAX_CHARS) {
		problems.push(`${task.id}: pack size ${task.pack.length} outside band`);
	}
	// Every distractor carries a same-schema near-miss distinct from target.
	for (const d of task.distractors) {
		if (!task.pack.includes(d.email)) {
			problems.push(`${task.id}: distractor ${d.name} missing from pack`);
		}
		if (d.email === task.target.email || d.product === task.target.product) {
			problems.push(`${task.id}: distractor collides with target`);
		}
	}
	return problems;
}
