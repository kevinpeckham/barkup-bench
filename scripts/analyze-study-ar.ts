/**
 * Study AR analysis (docs/BRIEF-AR.md): advertised headroom — per-
 * candidate no-harm gate, pooled headroom effect, guards, truecap
 * directional read, and pathway anatomy.
 *
 *   bun run scripts/analyze-study-ar.ts
 */
import { existsSync, readFileSync } from "node:fs";
import type { TaskRunRecord } from "../src/harness/records.js";

const MODELS = [
	"anthropic/claude-fable-5",
	"moonshotai/kimi-k3",
	"anthropic/claude-sonnet-4.5",
	"google/gemini-3.5-flash",
];
const SWAP_CANDIDATES = ["anthropic/claude-fable-5", "moonshotai/kimi-k3"];

const records: TaskRunRecord[] = [];
for (const model of MODELS) {
	const slug = model.replace(/[^a-z0-9.-]+/gi, "_");
	const path = `results/raw/studyar-${slug}.jsonl`;
	if (!existsSync(path)) continue;
	for (const line of readFileSync(path, "utf8").split("\n")) {
		if (line.trim() !== "") records.push(JSON.parse(line) as TaskRunRecord);
	}
}
const d = (r: TaskRunRecord) => (r.detail ?? {}) as Record<string, unknown>;
const short = (m: string) => m.split("/")[1] as string;

const isPrune = (r: TaskRunRecord) =>
	d(r).outcome === "pruned-old" || d(r).outcome === "lost-old";
const isGoalLoss = (r: TaskRunRecord) => d(r).goalSafe === false;
const landed = (r: TaskRunRecord) =>
	!["dropped-new", "skipped-tool", "over-cap-lost-newest"].includes(
		String(d(r).outcome),
	);

function exactBinomialP(k: number, n: number): number {
	let p = 0;
	for (let i = 0; i <= k; i += 1) {
		let c = 1;
		for (let j = 0; j < i; j += 1) c = (c * (n - j)) / (j + 1);
		p += c / 2 ** n;
	}
	return p;
}

const capEdge = (m: string, arm: string) =>
	records.filter((r) => r.model === m && r.condition === `${arm}-k20`);
const underCap = (m: string) =>
	records.filter(
		(r) =>
			r.model === m &&
			(r.condition === "AR-headroom-k10" || r.condition === "AR-headroom-k19"),
	);
const pathway = (rs: TaskRunRecord[]) => {
	const overCap = rs.filter((r) => d(r).overCap === true).length;
	const consolidated = rs.filter(
		(r) =>
			d(r).overCap !== true && !isPrune(r) && Number(d(r).rawLength ?? 99) < 20,
	).length;
	return `over-send ${overCap}, consolidated ${consolidated}, pruned ${rs.filter(isPrune).length}`;
};

let gateH1 = true;
let gateH3 = true;
for (const model of MODELS) {
	const control = capEdge(model, "AK-eviction");
	const headroom = capEdge(model, "AR-headroom");
	const truecap = capEdge(model, "AR-truecap");
	console.log(`--- ${short(model)} ---`);
	console.log(
		`  prune cells: control ${control.filter(isPrune).length}/40, headroom ${headroom.filter(isPrune).length}/40, truecap ${truecap.filter(isPrune).length}/40`,
	);
	console.log(
		`  goal-loss:   control ${control.filter(isGoalLoss).length}/40, headroom ${headroom.filter(isGoalLoss).length}/40, truecap ${truecap.filter(isGoalLoss).length}/40`,
	);
	console.log(`  pathways control:  ${pathway(control)}`);
	console.log(`  pathways headroom: ${pathway(headroom)}`);
	console.log(`  pathways truecap:  ${pathway(truecap)}`);
	const uc = underCap(model);
	const ucClean = uc.filter(
		(r) => d(r).outcome === "clean-update" && d(r).goalSafe !== false,
	).length;
	const landing = [control, headroom, truecap].map(
		(rs) => rs.filter(landed).length,
	);
	console.log(
		`  no-op guard: ${ucClean}/${uc.length} clean | landing c/h/t: ${landing.join("/")}/40`,
	);
	if (SWAP_CANDIDATES.includes(model)) {
		const ok =
			headroom.filter(isPrune).length <= control.filter(isPrune).length &&
			headroom.filter(isGoalLoss).length <= 2 &&
			headroom.filter(landed).length >= 38;
		if (!ok) gateH1 = false;
	}
	if (uc.length > 0 && ucClean < 19) gateH3 = false;
	if (landing.some((n) => n < 38)) gateH3 = false;
}

// AR-H2: pooled swap-candidate paired sign test, headroom vs control.
let controlOnly = 0;
let headroomOnly = 0;
let pooledControlPrunes = 0;
for (const model of SWAP_CANDIDATES) {
	const control = capEdge(model, "AK-eviction");
	const headroom = capEdge(model, "AR-headroom");
	pooledControlPrunes += control.filter(isPrune).length;
	const byTask = new Map(control.map((r) => [r.taskId, r]));
	for (const h of headroom) {
		const c = byTask.get(h.taskId);
		if (!c) continue;
		const cp = isPrune(c);
		const hp = isPrune(h);
		if (cp && !hp) controlOnly += 1;
		else if (!cp && hp) headroomOnly += 1;
	}
}
const discordant = controlOnly + headroomOnly;
const p = discordant > 0 ? exactBinomialP(headroomOnly, discordant) : 1;
const baselineInsufficient = pooledControlPrunes < 5;
const gateH2 = !baselineInsufficient && p < 0.05 && controlOnly > headroomOnly;

console.log("\n=== Gates ===");
console.log(
	`AR-H1 (no-harm on both swap candidates): ${gateH1 ? "PASS" : "FAIL"}`,
);
console.log(
	`AR-H2 (pooled headroom effect): ${gateH2 ? "PASS" : "FAIL"} — pooled control prunes ${pooledControlPrunes}/80${baselineInsufficient ? " (BASELINE INSUFFICIENT — registered fallback row)" : ""}, discordant ${discordant} (control-only ${controlOnly}, headroom-only ${headroomOnly}), one-sided exact p=${p.toFixed(5)}`,
);
console.log(`AR-H3 (guards): ${gateH3 ? "PASS" : "FAIL"}`);
console.log(`STUDY GATE: ${gateH1 && gateH2 && gateH3 ? "PASS" : "FAIL"}`);
