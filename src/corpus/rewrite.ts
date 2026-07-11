/**
 * Study V rewrite corpus (docs/BRIEF-V.md): fictional company About
 * pages with a PLANTED off-thesis paragraph, assembled from committed
 * sentence-template pools so the improvement direction is known by
 * construction and the corpus stays fully seeded.
 *
 * Domain vocabularies are deliberately disjoint on content words: a
 * distractor sentence can never accidentally mention the thesis, and
 * the layer-2 proxy (thesis-word coverage) has a clean signal.
 */
import type { BarkupNode } from "@kevinpeckham/barkup";
import { serializeView } from "../conditions/views.js";
import { findById } from "../tree.js";
import type { Rng } from "./rng.js";
import type { Family } from "./tasks.js";
import type { BucketName } from "./trees.js";

export interface RewriteDomain {
	id: string;
	/** `{company}` slot-filled at generation time. */
	thesis: string;
	/** Content words of the thesis (the proxy + validation vocabulary). */
	thesisWords: string[];
	sentences: string[];
}

/** Pre-registered domain pools (BRIEF-V.md). Vocabularies disjoint. */
export const DOMAINS: RewriteDomain[] = [
	{
		id: "alpine-safety",
		thesis:
			"{company} builds certified safety equipment that mountain guides can trust with their lives.",
		thesisWords: ["safety", "equipment", "mountain", "guides", "certified"],
		sentences: [
			"Every harness and anchor {company} ships is certified against alpine impact standards.",
			"Mountain guides helped design the locking system on our newest carabiners.",
			"Our equipment is tested in freezing conditions before it ever reaches a shop wall.",
			"Safety is not a feature we add at the end; it is the first line of every specification.",
			"Certified inspectors review each production batch of climbing equipment by hand.",
			"Guides in four mountain ranges carry {company} gear on every ascent.",
			"The safety record of our equipment across a decade of expeditions speaks for itself.",
			"We publish the certification results for every mountain product we sell.",
			"A guide's trust is earned one piece of dependable equipment at a time.",
			"Our design team includes working mountain guides who test prototypes on real routes.",
		],
	},
	{
		id: "harbor-logistics",
		thesis:
			"{company} moves freight through crowded ports faster with scheduling software built for harbor pilots.",
		thesisWords: ["freight", "ports", "scheduling", "harbor", "software"],
		sentences: [
			"Our scheduling software shaves idle hours off every freight window in the port.",
			"Harbor pilots see berth availability update in real time on {company} dashboards.",
			"Freight that used to wait three days at anchor now clears the port in one.",
			"The software models tide tables and berth queues together, which no printed timetable can.",
			"Ports running {company} report double-digit gains in freight throughput.",
			"Every harbor is different, so the scheduling engine tunes itself to local traffic.",
			"Dispatchers and harbor pilots share one live picture of the port instead of six phone calls.",
			"We built the first version dockside, sitting with the pilots who move the freight.",
			"Scheduling conflicts surface hours early, while there is still time to re-route.",
			"{company} integrates with the port systems harbors already run.",
		],
	},
	{
		id: "orchard-robotics",
		thesis:
			"{company} makes gentle picking robots that let orchards harvest ripe fruit without bruising it.",
		thesisWords: ["robots", "orchards", "harvest", "fruit", "picking"],
		sentences: [
			"Our picking robots close their grippers with less force than a careful human hand.",
			"Orchards report bruise rates near zero across entire harvest seasons.",
			"The vision system finds ripe fruit under leaves that hide it from human pickers.",
			"A single robot can harvest through the night without fatigue or dropped fruit.",
			"{company} robots roll between orchard rows on wheels designed for soft soil.",
			"Growers watch the harvest count climb in real time from the packing shed.",
			"Every gripper is calibrated against the tenderest fruit the orchard grows.",
			"The robots learn each orchard's layout in a single mapping pass.",
			"Harvest crews redeploy to grading and packing while the robots handle picking.",
			"Fruit picked by {company} machines reaches the packing line minutes after leaving the tree.",
		],
	},
	{
		id: "archive-paper",
		thesis:
			"{company} restores and digitizes fragile paper archives so libraries never lose a page to time.",
		thesisWords: ["archives", "libraries", "digitizes", "paper", "restores"],
		sentences: [
			"Our conservators restore brittle paper leaf by leaf before a scanner ever sees it.",
			"Libraries send us archives that have survived floods, fires, and a century of handling.",
			"The digitization lab captures every page at conservation-grade resolution.",
			"{company} returns each archive with a digital twin and a restored original.",
			"Acid damage that once doomed paper collections can now be arrested and reversed.",
			"Archivists track every folder of their collection through our restoration pipeline.",
			"A library's rarest paper materials never leave climate-controlled custody.",
			"We have digitized archives in eleven languages and four alphabets.",
			"Every restored page is verified against its scan before the archive ships home.",
			"Paper outlives us all when someone restores it in time.",
		],
	},
	{
		id: "reef-sensors",
		thesis:
			"{company} anchors solar sensor buoys on reefs to give marine scientists live ocean data.",
		thesisWords: ["reefs", "buoys", "marine", "ocean", "solar"],
		sentences: [
			"Each buoy streams temperature, salinity, and current data from the reef every minute.",
			"Marine scientists open a browser and watch their reef breathe in live charts.",
			"The solar array keeps every sensor running through monsoon season.",
			"{company} buoys have survived three cyclone seasons without losing a data day.",
			"Ocean acidity trends that took years to assemble now appear in a single season.",
			"Our anchors hold sensors steady without touching living reef structure.",
			"Research teams deploy a full sensor grid from one small boat in an afternoon.",
			"The data feed plugs straight into the models marine labs already use.",
			"Every reef in the network contributes to one shared ocean dataset.",
			"When the ocean changes, the buoys notice before anyone else.",
		],
	},
	{
		id: "loom-textiles",
		thesis:
			"{company} weaves durable textiles from reclaimed fiber on looms powered entirely by wind.",
		thesisWords: ["textiles", "fiber", "looms", "reclaimed", "wind"],
		sentences: [
			"Every bolt of {company} fabric starts as reclaimed fiber sorted by hand.",
			"Our looms run on wind power from the turbines behind the mill.",
			"Textiles woven from reclaimed fiber now outlast the virgin fabrics we replaced.",
			"The weave patterns are engineered to hide splice points in recovered fiber.",
			"Wind availability schedules the looms, and the mill banks power on gusty days.",
			"Designers choose {company} textiles for durability first and provenance second.",
			"Each fiber lot is traceable back to the garments it was reclaimed from.",
			"The mill diverts tons of fiber from landfill every production month.",
			"Loom tension is tuned per lot, because no two reclaimed fibers behave alike.",
			"A textile should carry its history without wearing it out.",
		],
	},
];

const COMPANY_WORDS = [
	"atlas",
	"cedar",
	"garnet",
	"ember",
	"juniper",
	"lantern",
	"meadow",
	"quartz",
	"sierra",
	"willow",
] as const;

export const REWRITE_MAXLENGTH = 600;

export interface RewriteTask {
	id: string;
	family: Family;
	bucket: BucketName;
	tree: BarkupNode;
	/** The planted goal, verbatim. */
	thesis: string;
	thesisWords: string[];
	targetId: string;
	missionId: string;
	/** The planted off-thesis paragraph (pre-edit content). */
	original: string;
	company: string;
	domain: string;
	distractorDomain: string;
}

function titleCase(s: string): string {
	return s
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");
}

function fill(template: string, company: string): string {
	return template.replaceAll("{company}", company);
}

function pickSentences(rng: Rng, pool: string[], n: number): string[] {
	const indices = new Set<number>();
	while (indices.size < n) indices.add(rng.int(0, pool.length - 1));
	return [...indices].map((i) => pool[i] as string);
}

/** Content words of a text (lowercased, ≥4 chars, minus the company). */
export function contentWords(text: string, company: string): Set<string> {
	const words = new Set(
		(text.toLowerCase().match(/[a-z]+/g) ?? []).filter((w) => w.length >= 4),
	);
	for (const part of company.toLowerCase().split(/\s+/)) words.delete(part);
	return words;
}

/** Layer-2 proxy: fraction of thesis words present in the text. */
export function thesisCoverage(task: RewriteTask, text: string): number {
	const words = contentWords(text, task.company);
	const hits = task.thesisWords.filter((w) => words.has(w)).length;
	return hits / task.thesisWords.length;
}

export function generateRewriteTask(rng: Rng, index: number): RewriteTask {
	const domain = DOMAINS[index % DOMAINS.length] as RewriteDomain;
	let distractor = rng.pick(DOMAINS.filter((d) => d.id !== domain.id));
	// Deterministic but varied: re-pick if same as previous task's would be fine;
	// seeded rng already varies this.
	if (distractor.id === domain.id) distractor = DOMAINS[0] as RewriteDomain;
	const company = titleCase(
		`${rng.pick([...COMPANY_WORDS])}-${rng.pick([...COMPANY_WORDS])}`,
	);
	const thesis = fill(domain.thesis, company);
	const onThesis = domain.sentences.map((s) => fill(s, company));
	const offThesis = distractor.sentences.map((s) => fill(s, company));

	const para1 = pickSentences(rng, onThesis, 3).join(" ");
	const target = pickSentences(rng, offThesis, 3).join(" ");
	const para3 = pickSentences(rng, onThesis, 3).join(" ");

	const atom = (
		id: string,
		name: string,
		textStyle: string,
		content: string,
	): BarkupNode => ({
		type: "text-atom",
		id,
		name,
		attributes: { textStyle, maxLength: REWRITE_MAXLENGTH, content },
	});

	const tree: BarkupNode = {
		type: "document",
		id: "n1",
		name: company.toLowerCase().replace(/\s+/g, "-"),
		attributes: { title: `About ${company}`, theme: "light" },
		children: [
			{
				type: "page",
				id: "n2",
				name: "about",
				attributes: { layoutSize: "standard" },
				children: [
					{
						type: "block",
						id: "n3",
						name: "about-hero",
						children: [
							atom("n4", "about-heading", "heading", `About ${company}`),
							atom("n5", "mission-statement", "subheading", thesis),
						],
					},
					{
						type: "block",
						id: "n6",
						name: "about-body",
						children: [
							atom("n7", "about-para-1", "body", para1),
							atom("n8", "about-para-2", "body", target),
							atom("n9", "about-para-3", "body", para3),
						],
					},
				],
			},
		],
	};

	return {
		id: `rw-${index + 1}`,
		family: "transformation",
		bucket: "xs",
		tree,
		thesis,
		thesisWords: domain.thesisWords,
		targetId: "n8",
		missionId: "n5",
		original: target,
		company,
		domain: domain.id,
		distractorDomain: distractor.id,
	};
}

/** BRIEF-V no-leakage validation, per task. */
export function validateRewriteTask(task: RewriteTask): string[] {
	const problems: string[] = [];
	const originalWords = contentWords(task.original, task.company);
	for (const w of task.thesisWords) {
		if (originalWords.has(w)) {
			problems.push(`target paragraph contains thesis word "${w}"`);
		}
	}
	if (task.original.includes(task.thesis)) {
		problems.push("target paragraph contains the thesis verbatim");
	}
	const view1 = serializeView(task.tree, [task.targetId], "minimal");
	if (view1.includes(task.thesis)) {
		problems.push("target-only view shows the thesis");
	}
	for (const w of task.thesisWords) {
		if (view1.toLowerCase().includes(w)) {
			problems.push(`target-only view contains thesis word "${w}"`);
		}
	}
	const mission = findById(task.tree, task.missionId);
	if (mission?.attributes?.content !== task.thesis) {
		problems.push("mission node does not carry the thesis exactly");
	}
	const view2 = serializeView(
		task.tree,
		[task.targetId, task.missionId],
		"minimal",
	);
	if (!view2.includes(task.thesis)) {
		problems.push("both-nodes view does NOT show the thesis");
	}
	return problems;
}

/** Cross-domain vocabulary disjointness (unit-tested corpus property). */
export function domainVocabularyProblems(): string[] {
	const problems: string[] = [];
	for (const a of DOMAINS) {
		for (const b of DOMAINS) {
			if (a.id === b.id) continue;
			const bWords = contentWords(b.sentences.join(" "), "");
			for (const w of a.thesisWords) {
				if (bWords.has(w)) {
					problems.push(
						`domain ${b.id} sentences contain ${a.id} thesis word "${w}"`,
					);
				}
			}
		}
	}
	return problems;
}
