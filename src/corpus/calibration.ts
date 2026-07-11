/**
 * Study V judge-calibration suite (docs/BRIEF-V.md): pairs with known
 * correct verdicts, assembled from the same committed pools as the
 * rewrite corpus. The judge is a grader; this is its unit test.
 */
import type { RewriteDomain } from "./rewrite.js";
import { DOMAINS } from "./rewrite.js";
import type { Rng } from "./rng.js";

export type CalibrationKind = "known" | "identity" | "length";

export interface CalibrationPair {
	id: string;
	kind: CalibrationKind;
	thesis: string;
	original: string;
	a: string;
	b: string;
	/** "A" | "B" for known/length; "tie" for identity. */
	expected: "A" | "B" | "tie";
}

function fill(template: string, company: string): string {
	return template.replaceAll("{company}", company);
}

function sample(rng: Rng, pool: string[], n: number): string[] {
	const indices = new Set<number>();
	while (indices.size < n) indices.add(rng.int(0, pool.length - 1));
	return [...indices].map((i) => pool[i] as string);
}

const COMPANIES = [
	"Cedar Atlas",
	"Garnet Ember",
	"Juniper Lantern",
	"Meadow Quartz",
	"Sierra Willow",
	"Quartz Cedar",
] as const;

export function generateCalibration(rng: Rng): CalibrationPair[] {
	const pairs: CalibrationPair[] = [];
	const domainAt = (i: number): RewriteDomain =>
		DOMAINS[i % DOMAINS.length] as RewriteDomain;
	const otherDomain = (d: RewriteDomain, i: number): RewriteDomain => {
		const candidates = DOMAINS.filter((x) => x.id !== d.id);
		return candidates[i % candidates.length] as RewriteDomain;
	};

	// 30 known-verdict pairs: good (on-thesis) vs bad (off-thesis).
	for (let i = 0; i < 30; i += 1) {
		const domain = domainAt(i);
		const distractor = otherDomain(domain, i);
		const company = COMPANIES[i % COMPANIES.length] as string;
		const thesis = fill(domain.thesis, company);
		const on = domain.sentences.map((s) => fill(s, company));
		const off = distractor.sentences.map((s) => fill(s, company));
		const original = sample(rng, off, 3).join(" ");
		const good = sample(rng, on, 3).join(" ");
		const bad = sample(rng, off, 3).join(" ");
		const goodIsA = rng.chance(0.5);
		pairs.push({
			id: `cal-known-${i + 1}`,
			kind: "known",
			thesis,
			original,
			a: goodIsA ? good : bad,
			b: goodIsA ? bad : good,
			expected: goodIsA ? "A" : "B",
		});
	}

	// 10 identity probes: same rewrite both sides — must resolve to tie.
	for (let i = 0; i < 10; i += 1) {
		const domain = domainAt(i);
		const distractor = otherDomain(domain, i + 1);
		const company = COMPANIES[(i + 2) % COMPANIES.length] as string;
		const thesis = fill(domain.thesis, company);
		const on = domain.sentences.map((s) => fill(s, company));
		const off = distractor.sentences.map((s) => fill(s, company));
		const original = sample(rng, off, 3).join(" ");
		const same = sample(rng, on, 3).join(" ");
		pairs.push({
			id: `cal-identity-${i + 1}`,
			kind: "identity",
			thesis,
			original,
			a: same,
			b: same,
			expected: "tie",
		});
	}

	// 10 length probes: short on-thesis vs long off-thesis (longer is worse).
	for (let i = 0; i < 10; i += 1) {
		const domain = domainAt(i + 3);
		const distractor = otherDomain(domain, i);
		const company = COMPANIES[(i + 4) % COMPANIES.length] as string;
		const thesis = fill(domain.thesis, company);
		const on = domain.sentences.map((s) => fill(s, company));
		const off = distractor.sentences.map((s) => fill(s, company));
		const original = sample(rng, off, 3).join(" ");
		const shortGood = sample(rng, on, 2).join(" ");
		const longBad = sample(rng, off, 5).join(" ");
		const goodIsA = rng.chance(0.5);
		pairs.push({
			id: `cal-length-${i + 1}`,
			kind: "length",
			thesis,
			original,
			a: goodIsA ? shortGood : longBad,
			b: goodIsA ? longBad : shortGood,
			expected: goodIsA ? "A" : "B",
		});
	}

	return pairs;
}

/** BRIEF-V judge gate thresholds. */
export const CALIBRATION_GATE = {
	knownMin: 27,
	identityTieMin: 8,
	lengthMin: 9,
} as const;
