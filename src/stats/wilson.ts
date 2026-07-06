/** Wilson score interval for a binomial proportion (default 95%). */
export interface WilsonInterval {
	proportion: number;
	low: number;
	high: number;
}

export function wilson(
	successes: number,
	trials: number,
	z = 1.96,
): WilsonInterval {
	if (trials === 0) return { proportion: Number.NaN, low: 0, high: 1 };
	const p = successes / trials;
	const z2 = z * z;
	const denominator = 1 + z2 / trials;
	const center = p + z2 / (2 * trials);
	const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
	return {
		proportion: p,
		low: Math.max(0, (center - margin) / denominator),
		high: Math.min(1, (center + margin) / denominator),
	};
}
