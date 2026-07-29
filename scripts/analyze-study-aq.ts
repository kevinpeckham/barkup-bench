/**
 * Study AQ analysis (docs/BRIEF-AQ.md): the powered fence — paired
 * McNemar on prune cells per swap candidate, no-op guard, landing
 * guard, and the H4 pathway anatomy.
 *
 *   bun run scripts/analyze-study-aq.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";

const MODELS = [
	"anthropic/claude-fable-5",
	"moonshotai/kimi-k3",
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];
const SWAP_CANDIDATES = new Set([
	"anthropic/claude-fable-5",
	"moonshotai/kimi-k3",
]);

const records: TaskRunRecord[] = [];
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const path = `results/raw/studyaq-${slug}.jsonl`;
	if (!existsSync(path)) continue;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (line.trim() !== "") records.push(JSON.parse(line) as TaskRunRecord);
	}
}
const d = (r: TaskRunRecord) => (r.detail ?? {}) as Record<string, unknown>;
const short = (m: string) => m.split("/")[1] as string;

/** Registered prune definition (BRIEF-AQ): raw call already missing an old note. */
const isPrune = (r: TaskRunRecord) =>
	d(r).outcome === "pruned-old" || d(r).outcome === "lost-old";
const isGoalLoss = (r: TaskRunRecord) => d(r).goalSafe === false;
/** Registered landing definition: the new declaration survives to the final memo. */
const landed = (r: TaskRunRecord) =>
	!["dropped-new", "skipped-tool", "over-cap-lost-newest"].includes(
		String(d(r).outcome),
	);

function exactBinomialP(k: number, n: number): number {
	// One-sided sign test: P(X <= k) for X ~ Bin(n, 0.5).
	let p = 0;
	for (let i = 0; i <= k; i += 1) {
		let c = 1;
		for (let j = 0; j < i; j += 1) c = (c * (n - j)) / (j + 1);
		p += c / 2 ** n;
	}
	return p;
}

const capEdge = (m: string, arm: string) =>
	records.filter(
		(r) =>
			r.model === m &&
			r.condition === `${arm}-k20` &&
			String(r.taskId).length > 0,
	);
const underCap = (m: string) =>
	records.filter(
		(r) =>
			r.model === m &&
			(r.condition === "AL-fence-k10" || r.condition === "AL-fence-k19"),
	);

let gateH1 = true;
let gateH2 = true;
let gateH3 = true;
for (const model of MODELS) {
	const control = capEdge(model, "AK-eviction");
	const fence = capEdge(model, "AL-fence");
	const byTask = new Map(control.map((r) => [r.taskId, r]));
	let both = 0;
	let controlOnly = 0;
	let fenceOnly = 0;
	for (const f of fence) {
		const c = byTask.get(f.taskId);
		if (!c) continue;
		const cp = isPrune(c);
		const fp = isPrune(f);
		if (cp && fp) both += 1;
		else if (cp) controlOnly += 1;
		else if (fp) fenceOnly += 1;
	}
	const discordant = controlOnly + fenceOnly;
	const p = discordant > 0 ? exactBinomialP(fenceOnly, discordant) : 1;
	const controlPrunes = control.filter(isPrune).length;
	const fencePrunes = fence.filter(isPrune).length;
	const fenceGoalLoss = fence.filter(isGoalLoss).length;
	const controlGoalLoss = control.filter(isGoalLoss).length;
	const pathway = (rs: TaskRunRecord[]) => {
		const overCap = rs.filter((r) => d(r).overCap === true).length;
		const consolidated = rs.filter(
			(r) =>
				d(r).overCap !== true &&
				!isPrune(r) &&
				Number(d(r).rawLength ?? 99) < 20,
		).length;
		return `over-send ${overCap}, consolidated ${consolidated}, pruned ${rs.filter(isPrune).length}`;
	};
	console.log(`--- ${short(model)} ---`);
	console.log(
		`  prune cells: control ${controlPrunes}/40, fence ${fencePrunes}/40 | discordant ${discordant} (control-only ${controlOnly}, fence-only ${fenceOnly}) | one-sided exact p=${p.toFixed(5)}`,
	);
	console.log(
		`  goal-loss: control ${controlGoalLoss}/40, fence ${fenceGoalLoss}/40`,
	);
	console.log(`  pathways control: ${pathway(control)}`);
	console.log(`  pathways fence:   ${pathway(fence)}`);
	const uc = underCap(model);
	const ucClean = uc.filter(
		(r) => d(r).outcome === "clean-update" && d(r).goalSafe !== false,
	).length;
	const landC = control.filter(landed).length;
	const landF = fence.filter(landed).length;
	console.log(
		`  no-op guard: ${ucClean}/${uc.length} clean | landing: control ${landC}/40, fence ${landF}/40`,
	);
	if (SWAP_CANDIDATES.has(model)) {
		if (!(p < 0.05 && fencePrunes < controlPrunes && fenceGoalLoss <= 2)) {
			gateH1 = false;
		}
	}
	if (uc.length > 0 && ucClean < 19) gateH2 = false;
	if (landC < 38 || landF < 38) gateH3 = false;
}

console.log("\n=== Gates ===");
console.log(
	`AQ-H1 (fence effect on both swap candidates, p<.05 + goal-loss ≤2/40): ${gateH1 ? "PASS" : "FAIL"}`,
);
console.log(
	`AQ-H2 (no-op guard ≥19/20 every model): ${gateH2 ? "PASS" : "FAIL"}`,
);
console.log(
	`AQ-H3 (declaration lands ≥38/40 every model × arm): ${gateH3 ? "PASS" : "FAIL"}`,
);
console.log(`STUDY GATE: ${gateH1 && gateH2 && gateH3 ? "PASS" : "FAIL"}`);
