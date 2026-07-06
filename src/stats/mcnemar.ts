/**
 * McNemar's exact test for paired binary outcomes (same tasks through two
 * conditions). With benchmark-sized n the exact binomial form is the
 * right one — no chi-square approximation.
 */
export interface McNemarResult {
	/** Pairs where only the first condition succeeded. */
	firstOnly: number;
	/** Pairs where only the second condition succeeded. */
	secondOnly: number;
	discordant: number;
	/** Two-sided exact p-value (binomial, p = 0.5 over discordant pairs). */
	pValue: number;
}

function logChoose(n: number, k: number): number {
	let sum = 0;
	for (let i = 1; i <= k; i += 1) {
		sum += Math.log(n - k + i) - Math.log(i);
	}
	return sum;
}

export function mcnemarExact(
	firstOnly: number,
	secondOnly: number,
): McNemarResult {
	const n = firstOnly + secondOnly;
	if (n === 0) {
		return { firstOnly, secondOnly, discordant: 0, pValue: 1 };
	}
	const k = Math.min(firstOnly, secondOnly);
	let tail = 0;
	for (let i = 0; i <= k; i += 1) {
		tail += Math.exp(logChoose(n, i) - n * Math.LN2);
	}
	const pValue = Math.min(1, 2 * tail);
	return { firstOnly, secondOnly, discordant: n, pValue };
}
