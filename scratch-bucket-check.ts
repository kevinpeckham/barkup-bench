import { BUCKETS, sampleTrees } from "./src/corpus/trees.js";
import { countNodes } from "./src/tree.js";

for (const bucket of Object.values(BUCKETS)) {
	const started = performance.now();
	try {
		const trees = sampleTrees(bucket, 12345, 3);
		console.log(
			bucket.name,
			`ok in ${(performance.now() - started).toFixed(0)}ms`,
			trees.map((t) => countNodes(t)),
		);
	} catch (error) {
		console.log(
			bucket.name,
			`FAIL in ${(performance.now() - started).toFixed(0)}ms:`,
			error instanceof Error ? error.message : error,
		);
	}
}
