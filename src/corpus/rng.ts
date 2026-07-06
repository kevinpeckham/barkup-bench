/**
 * Small deterministic RNG (mulberry32) for corpus generation. Everything
 * derived from a committed seed must be byte-reproducible — never use
 * Math.random() in corpus code.
 */
export interface Rng {
	/** Float in [0, 1). */
	next(): number;
	/** Integer in [min, max] inclusive. */
	int(min: number, max: number): number;
	pick<T>(items: readonly T[]): T;
	chance(probability: number): boolean;
}

export function createRng(seed: number): Rng {
	let state = seed >>> 0;
	const next = (): number => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	return {
		next,
		int(min, max) {
			return min + Math.floor(next() * (max - min + 1));
		},
		pick(items) {
			if (items.length === 0) throw new Error("pick from empty list");
			return items[Math.floor(next() * items.length)] as (typeof items)[number];
		},
		chance(probability) {
			return next() < probability;
		},
	};
}
