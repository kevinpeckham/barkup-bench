/**
 * Render the article figures as standalone SVG + retina PNG, light and
 * dark variants, from results/chart-data.json. Palette and mark specs
 * follow the validated set used in the results dashboard.
 *
 *   bun run scripts/render-charts.ts     → docs/img/*.{svg,png}
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

interface CrossoverCell {
	bucket: string;
	n: number;
	ok: number;
	rate: number;
	low: number;
	high: number;
}
interface FootgunCell {
	ok: number;
	n: number;
	rate: number;
	low: number;
	high: number;
}
interface SizeExtSeries {
	model: string;
	condition: string;
	cells: { bucket: string; ok: number; n: number; rate: number }[];
}
interface ChartData {
	sizeext: SizeExtSeries[];
	footgun: { model: string; v1: FootgunCell; v2: FootgunCell }[];
	crossover: Record<string, CrossoverCell[]>;
	tokens: Record<string, { bucket: string; tokens: number }[]>;
	reference: {
		model: string;
		cells: {
			condition: string;
			ok: number;
			n: number;
			rate: number;
			low: number;
			high: number;
		}[];
	}[];
}

const DATA = JSON.parse(
	readFileSync("results/chart-data.json", "utf8"),
) as ChartData;

const CONDITIONS = ["A", "B", "C", "D", "E", "F"] as const;
const COND_NAMES: Record<string, string> = {
	A: "HTML + rewrite",
	B: "JSON + rewrite",
	C: "JSON + tools",
	D: "HTML + tools",
	E: "JSON Patch",
	F: "anchored patch",
};
const SHORT_MODEL: Record<string, string> = {
	"openai/gpt-5.4": "gpt-5.4",
	"anthropic/claude-sonnet-4.5": "sonnet-4.5",
	"anthropic/claude-haiku-4.5": "haiku-4.5",
	"google/gemini-3.5-flash": "gemini-3.5-flash",
};
const BUCKET_LABELS = ["~5 nodes", "~20", "~60", "~150"];

interface Theme {
	name: string;
	surface: string;
	ink: string;
	ink2: string;
	ink3: string;
	grid: string;
	hairline: string;
	series: Record<string, string>;
}
const LIGHT: Theme = {
	name: "light",
	surface: "#fcfcfb",
	ink: "#0b0b0b",
	ink2: "#52514e",
	ink3: "#8b8a83",
	grid: "#ebebe8",
	hairline: "#e0e0dc",
	series: {
		A: "#2a78d6",
		B: "#1baf7a",
		C: "#eda100",
		D: "#008300",
		E: "#4a3aa7",
		F: "#e34948",
	},
};
const DARK: Theme = {
	name: "dark",
	surface: "#1a1a19",
	ink: "#ffffff",
	ink2: "#c3c2b7",
	ink3: "#8b8a83",
	grid: "#2e2e2c",
	hairline: "#3a3a37",
	series: {
		A: "#3987e5",
		B: "#199e70",
		C: "#c98500",
		D: "#008300",
		E: "#9085e9",
		F: "#e66767",
	},
};

const SANS = "Seravek, 'Gill Sans', 'Helvetica Neue', Arial, sans-serif";
const MONO = "Menlo, 'SF Mono', Consolas, monospace";

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

/** Keep >= minGap between label y positions (labels sorted by y). */
function resolveLabels<T extends { y: number }>(
	items: T[],
	minGap: number,
): T[] {
	const sorted = [...items].sort((a, b) => a.y - b.y);
	for (let i = 1; i < sorted.length; i += 1) {
		const prev = sorted[i - 1] as T;
		const cur = sorted[i] as T;
		if (cur.y - prev.y < minGap) cur.y = prev.y + minGap;
	}
	return items;
}

function legendRow(theme: Theme, x: number, y: number): string {
	let out = "";
	let cx = x;
	for (const c of CONDITIONS) {
		out += `<rect x="${cx}" y="${y - 4}" width="14" height="4" rx="2" fill="${theme.series[c]}"/>`;
		out += `<text x="${cx + 20}" y="${y + 1}" font-family="${MONO}" font-size="12" font-weight="700" fill="${theme.ink}">${c}</text>`;
		out += `<text x="${cx + 32}" y="${y + 1}" font-family="${SANS}" font-size="12" fill="${theme.ink2}">${esc(COND_NAMES[c] as string)}</text>`;
		cx += 40 + (COND_NAMES[c] as string).length * 6.4 + 22;
	}
	return out;
}

function header(
	theme: Theme,
	W: number,
	title: string,
	subtitle: string,
): string {
	return (
		`<rect width="${W}" height="100%" fill="${theme.surface}"/>` +
		`<text x="32" y="38" font-family="${SANS}" font-size="19" font-weight="700" fill="${theme.ink}">${esc(title)}</text>` +
		`<text x="32" y="60" font-family="${SANS}" font-size="12.5" fill="${theme.ink2}">${esc(subtitle)}</text>` +
		legendRow(theme, 32, 84)
	);
}

function footerNote(theme: Theme, W: number, H: number, note: string): string {
	return `<text x="${W - 32}" y="${H - 14}" text-anchor="end" font-family="${SANS}" font-size="10.5" fill="${theme.ink3}">${esc(note)}</text>`;
}

interface LineSeriesPoint {
	value: number;
	low?: number;
	high?: number;
}

function lineChart(
	theme: Theme,
	opts: {
		title: string;
		subtitle: string;
		series: Record<string, LineSeriesPoint[]>;
		yMin: number;
		yMax: number;
		ticks: number[];
		fmt: (v: number) => string;
		jitterCI: boolean;
		endLabel: (c: string) => string;
		xTitle: string;
		note: string;
	},
): string {
	const W = 960;
	const H = 584;
	const TOP = 116;
	const L = 72;
	const R = 148;
	const B = 88;
	const iw = W - L - R;
	const ih = H - TOP - B;
	const xs = BUCKET_LABELS.map(
		(_, i) => L + (iw * i) / (BUCKET_LABELS.length - 1),
	);
	const yOf = (v: number) =>
		TOP + ih - ((v - opts.yMin) / (opts.yMax - opts.yMin)) * ih;

	let g = header(theme, W, opts.title, opts.subtitle);
	for (const tick of opts.ticks) {
		const y = yOf(tick);
		g += `<line x1="${L}" x2="${L + iw}" y1="${y}" y2="${y}" stroke="${theme.grid}" stroke-width="1"/>`;
		g += `<text x="${L - 10}" y="${y + 4}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${theme.ink2}">${opts.fmt(tick)}</text>`;
	}
	BUCKET_LABELS.forEach((lab, i) => {
		g += `<text x="${xs[i]}" y="${H - B + 24}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${theme.ink2}">${lab}</text>`;
	});
	g += `<text x="${L + iw / 2}" y="${H - B + 44}" text-anchor="middle" font-family="${SANS}" font-size="11.5" fill="${theme.ink3}">${esc(opts.xTitle)}</text>`;

	let marks = "";
	const endLabels: { c: string; x: number; y: number }[] = [];
	CONDITIONS.forEach((c, ci) => {
		const series = opts.series[c] as LineSeriesPoint[];
		const jitter = opts.jitterCI ? (ci - 2) * 3 : 0;
		const pts = series.map((v, i) => ({
			x: (xs[i] as number) + jitter,
			y: yOf(v.value),
			v,
		}));
		if (opts.jitterCI) {
			for (const p of pts) {
				if (p.v.low === undefined || p.v.high === undefined) continue;
				const y1 = yOf(p.v.low);
				const y2 = yOf(p.v.high);
				marks += `<line x1="${p.x}" x2="${p.x}" y1="${y1}" y2="${y2}" stroke="${theme.series[c]}" stroke-width="1.5" opacity="0.45"/>`;
				marks += `<line x1="${p.x - 3}" x2="${p.x + 3}" y1="${y1}" y2="${y1}" stroke="${theme.series[c]}" stroke-width="1.5" opacity="0.45"/>`;
				marks += `<line x1="${p.x - 3}" x2="${p.x + 3}" y1="${y2}" y2="${y2}" stroke="${theme.series[c]}" stroke-width="1.5" opacity="0.45"/>`;
			}
		}
		const path = pts
			.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
			.join(" ");
		marks += `<path d="${path}" fill="none" stroke="${theme.series[c]}" stroke-width="2.5" stroke-linejoin="round"/>`;
		for (const p of pts) {
			marks += `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${theme.series[c]}" stroke="${theme.surface}" stroke-width="2"/>`;
		}
		const last = pts[pts.length - 1] as (typeof pts)[number];
		endLabels.push({ c, x: last.x + 14, y: last.y + 4 });
	});
	resolveLabels(endLabels, 18);
	for (const l of endLabels) {
		marks += `<text x="${l.x}" y="${l.y}" font-family="${MONO}" font-size="13" font-weight="700" fill="${theme.series[l.c]}">${l.c} · ${opts.endLabel(l.c)}</text>`;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}${marks}${footerNote(theme, W, H, opts.note)}</svg>`;
}

function referenceDotPlot(theme: Theme): string {
	const W = 960;
	const ROW = 68;
	const TOP = 112;
	const B = 92;
	const L = 190;
	const R = 40;
	const rows = DATA.reference
		.map((r) => ({ ...r, short: SHORT_MODEL[r.model] ?? r.model }))
		.sort(
			(a, b) =>
				["gpt-5.4", "sonnet-4.5", "haiku-4.5", "gemini-3.5-flash"].indexOf(
					a.short,
				) -
				["gpt-5.4", "sonnet-4.5", "haiku-4.5", "gemini-3.5-flash"].indexOf(
					b.short,
				),
		);
	const H = TOP + rows.length * ROW + B;
	const iw = W - L - R;
	const xOf = (v: number) => L + (v / 100) * iw;

	let g = header(
		theme,
		W,
		"Corrected: multi-turn reference edits are near-parity under correct tool history",
		"Success on “insert a node, then edit it by the id from your own output” — protocol v2, parity prompts, n = 40 per cell, Wilson 95% CI",
	);
	for (const tick of [0, 25, 50, 75, 100]) {
		const x = xOf(tick);
		g += `<line x1="${x}" x2="${x}" y1="${TOP}" y2="${H - B}" stroke="${theme.grid}" stroke-width="1"/>`;
		g += `<text x="${x}" y="${H - B + 22}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${theme.ink2}">${tick}%</text>`;
	}
	g += `<text x="${L + iw / 2}" y="${H - B + 44}" text-anchor="middle" font-family="${SANS}" font-size="11.5" fill="${theme.ink3}">reference-task success</text>`;
	rows.forEach((row, ri) => {
		const cy = TOP + ri * ROW + ROW / 2;
		g += `<line x1="${L}" x2="${L + iw}" y1="${cy}" y2="${cy}" stroke="${theme.hairline}" stroke-width="1"/>`;
		g += `<text x="${L - 14}" y="${cy + 4}" text-anchor="end" font-family="${MONO}" font-size="13" fill="${theme.ink}">${row.short}</text>`;
		for (const cell of row.cells) {
			const c = cell.condition;
			g += `<line x1="${xOf(cell.low)}" x2="${xOf(cell.high)}" y1="${cy}" y2="${cy}" stroke="${theme.series[c]}" stroke-width="1.5" opacity="0.4"/>`;
		}
		for (const cell of row.cells) {
			const c = cell.condition;
			g += `<circle cx="${xOf(cell.rate)}" cy="${cy}" r="6" fill="${theme.series[c]}" stroke="${theme.surface}" stroke-width="2"/>`;
		}
	});
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}${footerNote(theme, W, H, "barkup-bench · zero stale-id failures in every arm · gemini-3.5-flash residual failures are phase-1 tools accuracy, not follow-up dropout")}</svg>`;
}

function footgunChart(theme: Theme): string {
	const W = 960;
	const ROW = 76;
	const TOP = 112;
	const B = 92;
	const L = 190;
	const R = 40;
	const rows = DATA.footgun
		.map((r) => ({ ...r, short: SHORT_MODEL[r.model] ?? r.model }))
		.sort((a, b) => a.v1.rate - b.v1.rate);
	const H = TOP + rows.length * ROW + B;
	const iw = W - L - R;
	const xOf = (v: number) => L + (v / 100) * iw;
	let g =
		`<rect width="${W}" height="100%" fill="${theme.surface}"/>` +
		`<text x="32" y="38" font-family="${SANS}" font-size="19" font-weight="700" fill="${theme.ink}">One hidden SDK default, two very different benchmarks</text>` +
		`<text x="32" y="60" font-family="${SANS}" font-size="12.5" fill="${theme.ink2}">Reference-edit success, tools arms, per model — v1: the model's own tool calls hidden from history (SDK footgun) vs v2: corrected</text>`;
	for (const tick of [0, 25, 50, 75, 100]) {
		const x = xOf(tick);
		g += `<line x1="${x}" x2="${x}" y1="${TOP}" y2="${H - B}" stroke="${theme.grid}" stroke-width="1"/>`;
		g += `<text x="${x}" y="${H - B + 22}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${theme.ink2}">${tick}%</text>`;
	}
	g += `<text x="${L + iw / 2}" y="${H - B + 44}" text-anchor="middle" font-family="${SANS}" font-size="11.5" fill="${theme.ink3}">reference-task success, tools conditions (C + D pooled, parity)</text>`;
	rows.forEach((row, ri) => {
		const cy = TOP + ri * ROW + ROW / 2;
		g += `<text x="${L - 14}" y="${cy + 4}" text-anchor="end" font-family="${MONO}" font-size="13" fill="${theme.ink}">${row.short}</text>`;
		const x1 = xOf(row.v1.rate);
		const x2 = xOf(row.v2.rate);
		g += `<line x1="${x1}" x2="${x2}" y1="${cy}" y2="${cy}" stroke="${theme.series.C}" stroke-width="3" opacity="0.35"/>`;
		g += `<circle cx="${x1}" cy="${cy}" r="6" fill="${theme.surface}" stroke="${theme.series.C}" stroke-width="2.5"/>`;
		g += `<circle cx="${x2}" cy="${cy}" r="6.5" fill="${theme.series.A}" stroke="${theme.surface}" stroke-width="2"/>`;
		g += `<text x="${x1}" y="${cy + 26}" text-anchor="middle" font-family="${MONO}" font-size="11.5" font-weight="700" fill="${theme.ink2}">${row.v1.rate}%</text>`;
		g += `<text x="${x2}" y="${cy - 14}" text-anchor="middle" font-family="${MONO}" font-size="11.5" font-weight="700" fill="${theme.series.A}">${row.v2.rate}%</text>`;
	});
	// Key: hollow = v1 (broken history), filled = v2 (fixed).
	g += `<circle cx="32" cy="84" r="6" fill="${theme.surface}" stroke="${theme.series.C}" stroke-width="2.5"/><text x="46" y="88" font-family="${SANS}" font-size="12" fill="${theme.ink2}">v1 — tool calls hidden from history</text>`;
	g += `<circle cx="300" cy="84" r="6.5" fill="${theme.series.A}" stroke="${theme.surface}" stroke-width="2"/><text x="314" y="88" font-family="${SANS}" font-size="12" fill="${theme.ink2}">v2 — corrected history</text>`;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}${footerNote(theme, W, H, "barkup-bench protocol correction, 2026-07-06 · same tasks, same models, same prompts — only the history construction differs")}</svg>`;
}

function sizeExtensionChart(theme: Theme): string {
	const W = 960;
	const H = 584;
	const TOP = 116;
	const L = 72;
	const R = 200;
	const B = 88;
	const iw = W - L - R;
	const ih = H - TOP - B;
	const SIZES = ["~300 nodes", "~600", "~1000"];
	const xs = SIZES.map((_, i) => L + (iw * i) / (SIZES.length - 1));
	const yOf = (v: number) => TOP + ih - (v / 100) * ih;
	let g =
		`<rect width="${W}" height="100%" fill="${theme.surface}"/>` +
		`<text x="32" y="38" font-family="${SANS}" font-size="19" font-weight="700" fill="${theme.ink}">The crossover, found: above ~300 nodes, only anchored patches hold</text>` +
		`<text x="32" y="60" font-family="${SANS}" font-size="12.5" fill="${theme.ink2}">Task success at 300–1000 nodes — solid: claude-sonnet-4.5, dashed: gemini-3.5-flash; n = 15 per point · barkup-bench Study H</text>`;
	// Legend: condition colors + line-style key.
	let cx = 32;
	for (const c of ["A", "E", "F"]) {
		g += `<rect x="${cx}" y="80" width="14" height="4" rx="2" fill="${theme.series[c]}"/>`;
		g += `<text x="${cx + 20}" y="85" font-family="${MONO}" font-size="12" font-weight="700" fill="${theme.ink}">${c}</text>`;
		g += `<text x="${cx + 32}" y="85" font-family="${SANS}" font-size="12" fill="${theme.ink2}">${COND_NAMES[c]}</text>`;
		cx += 40 + (COND_NAMES[c] as string).length * 6.4 + 22;
	}
	for (const tick of [0, 25, 50, 75, 100]) {
		const y = yOf(tick);
		g += `<line x1="${L}" x2="${L + iw}" y1="${y}" y2="${y}" stroke="${theme.grid}" stroke-width="1"/>`;
		g += `<text x="${L - 10}" y="${y + 4}" text-anchor="end" font-family="${MONO}" font-size="12" fill="${theme.ink2}">${tick}%</text>`;
	}
	SIZES.forEach((lab, i) => {
		g += `<text x="${xs[i]}" y="${H - B + 24}" text-anchor="middle" font-family="${MONO}" font-size="12" fill="${theme.ink2}">${lab}</text>`;
	});
	g += `<text x="${L + iw / 2}" y="${H - B + 44}" text-anchor="middle" font-family="${SANS}" font-size="11.5" fill="${theme.ink3}">tree size</text>`;
	let marks = "";
	const endLabels: { text: string; color: string; x: number; y: number }[] = [];
	for (const series of DATA.sizeext) {
		const c = series.condition;
		const dashed = series.model.includes("gemini");
		const pts = series.cells.map((cell, i) => ({
			x: xs[i] as number,
			y: yOf(cell.rate),
			rate: cell.rate,
		}));
		const path = pts
			.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`)
			.join(" ");
		marks += `<path d="${path}" fill="none" stroke="${theme.series[c]}" stroke-width="2.5" stroke-linejoin="round"${dashed ? ' stroke-dasharray="7 5"' : ""}/>`;
		for (const p of pts) {
			marks += `<circle cx="${p.x}" cy="${p.y}" r="4.5" fill="${theme.series[c]}" stroke="${theme.surface}" stroke-width="2"/>`;
		}
		const last = pts[pts.length - 1] as (typeof pts)[number];
		endLabels.push({
			text: `${c} ${dashed ? "gemini" : "sonnet"} · ${last.rate}%`,
			color: theme.series[c] as string,
			x: last.x + 12,
			y: last.y + 4,
		});
	}
	resolveLabels(endLabels, 17);
	for (const l of endLabels) {
		marks += `<text x="${l.x}" y="${l.y}" font-family="${MONO}" font-size="12" font-weight="700" fill="${l.color}">${l.text}</text>`;
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}${marks}${footerNote(theme, W, H, "protocol v2, streamed transport for large rewrites · RFC 6902 (E) and rewrite-on-small-models decay; anchored patches (F) hold 87–100% for both tiers")}</svg>`;
}

function renderAll(theme: Theme): Record<string, string> {
	return {
		"crossover-success": lineChart(theme, {
			title:
				"Corrected (protocol v2): no interface dominates — positional JSON Patch is the outlier at scale",
			subtitle:
				"Task success by tree size — 6 conditions × 4 models pooled, parity prompts, protocol v2 (corrected tool history), Wilson 95% CI · barkup-bench",
			series: Object.fromEntries(
				CONDITIONS.map((c) => [
					c,
					(DATA.crossover[c] as CrossoverCell[]).map((d) => ({
						value: d.rate,
						low: d.low,
						high: d.high,
					})),
				]),
			),
			yMin: 60,
			yMax: 100,
			ticks: [60, 70, 80, 90, 100],
			fmt: (v) => `${v}%`,
			jitterCI: true,
			endLabel: (c) => `${(DATA.crossover[c] as CrossoverCell[])[3]?.rate}%`,
			xTitle: "tree size bucket",
			note: "n per cell: 168–232 tasks",
		}),
		"tokens-per-solved": lineChart(theme, {
			title:
				"Tokens per solved task: anchored patches (F) are the cheapest condition at every size",
			subtitle:
				"Mean total tokens (input + output) per successfully solved task — parity prompts, models pooled · barkup-bench",
			series: Object.fromEntries(
				CONDITIONS.map((c) => [
					c,
					(DATA.tokens[c] as { tokens: number }[]).map((d) => ({
						value: d.tokens,
					})),
				]),
			),
			yMin: 0,
			yMax: 24000,
			ticks: [0, 6000, 12000, 18000, 24000],
			fmt: (v) => `${v / 1000}k`,
			jitterCI: false,
			endLabel: (c) =>
				`${(((DATA.tokens[c] as { tokens: number }[])[3]?.tokens ?? 0) / 1000).toFixed(1)}k`,
			xTitle: "tree size bucket",
			note: "at ~150 nodes, HTML rewrite (A) undercuts JSON rewrite (B) by ~30%",
		}),
		"reference-stability": referenceDotPlot(theme),
		"tool-history-footgun": footgunChart(theme),
		"size-extension": sizeExtensionChart(theme),
	};
}

mkdirSync("docs/img", { recursive: true });
for (const theme of [LIGHT, DARK]) {
	for (const [name, svg] of Object.entries(renderAll(theme))) {
		const base = `docs/img/${name}-${theme.name}`;
		// Belt and braces against mojibake (– × · “ ”): declare the
		// encoding AND emit non-ASCII as numeric character references so
		// the file is pure ASCII — immune to charset sniffing and wrong
		// Content-Type headers alike.
		const asciiSvg = svg.replace(
			/[\u0080-\uffff]/g,
			(ch) => `&#${ch.codePointAt(0)};`,
		);
		writeFileSync(
			`${base}.svg`,
			`<?xml version="1.0" encoding="UTF-8"?>\n${asciiSvg}\n`,
		);
		const png = new Resvg(svg, {
			fitTo: { mode: "zoom", value: 2 },
			font: { loadSystemFonts: true },
			background: theme.surface,
		}).render();
		writeFileSync(`${base}.png`, png.asPng());
		console.log(`${base}.svg + .png (${png.width}×${png.height})`);
	}
}
