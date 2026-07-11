/**
 * Study V judge (docs/BRIEF-V.md): the pre-registered pairwise
 * protocol. Both presentation orders at temperature 0; a verdict only
 * when both orders agree; otherwise a tie. Prompt text is registered
 * verbatim in the brief and must never change after scored verdicts.
 */
import { generateText } from "ai";

export const PRIMARY_JUDGE = "openai/gpt-5.4";
export const SENSITIVITY_JUDGE = "anthropic/claude-haiku-4.5";

export const JUDGE_SYSTEM =
	"You are an impartial editor judging rewrites. Answer with JSON only.";

/** BRIEF-V judge user prompt, verbatim. */
export function judgePrompt(
	thesis: string,
	original: string,
	a: string,
	b: string,
): string {
	return `A paragraph on a company page was rewritten with this goal: focus the paragraph on the company's central thesis.\n\nThe central thesis: "${thesis}"\n\nThe original paragraph: "${original}"\n\nRewrite 1: "${a}"\n\nRewrite 2: "${b}"\n\nWhich rewrite better satisfies the goal? Consider thesis focus first, then clarity; ignore length differences unless one rewrite is bloated or empty. Reply with exactly {"winner": 1} or {"winner": 2}.`;
}

export function parseVerdict(text: string): 1 | 2 | null {
	const match = text.match(/"winner"\s*:\s*([12])/);
	if (!match) return null;
	return Number(match[1]) as 1 | 2;
}

async function callJudge(
	judgeModel: string,
	thesis: string,
	original: string,
	a: string,
	b: string,
): Promise<{
	winner: 1 | 2 | null;
	inputTokens: number;
	outputTokens: number;
}> {
	const result = await generateText({
		model: judgeModel,
		system: JUDGE_SYSTEM,
		messages: [{ role: "user", content: judgePrompt(thesis, original, a, b) }],
		temperature: 0,
		maxRetries: 4,
		maxOutputTokens: 2000,
	} as Parameters<typeof generateText>[0]);
	return {
		winner: parseVerdict(result.text),
		inputTokens: result.totalUsage.inputTokens ?? 0,
		outputTokens: result.totalUsage.outputTokens ?? 0,
	};
}

export interface PairVerdict {
	/** "A" | "B" when both orders agree; "tie" otherwise. */
	verdict: "A" | "B" | "tie";
	orderAB: 1 | 2 | null;
	orderBA: 1 | 2 | null;
	inputTokens: number;
	outputTokens: number;
}

/** Judge a pair in both orders (BRIEF-V consistency rule). */
export async function judgeBothOrders(
	judgeModel: string,
	thesis: string,
	original: string,
	a: string,
	b: string,
): Promise<PairVerdict> {
	const first = await callJudge(judgeModel, thesis, original, a, b);
	const second = await callJudge(judgeModel, thesis, original, b, a);
	let verdict: "A" | "B" | "tie" = "tie";
	// Order 1: winner 1 = A. Order 2 (swapped): winner 2 = A.
	if (first.winner === 1 && second.winner === 2) verdict = "A";
	else if (first.winner === 2 && second.winner === 1) verdict = "B";
	return {
		verdict,
		orderAB: first.winner,
		orderBA: second.winner,
		inputTokens: first.inputTokens + second.inputTokens,
		outputTokens: first.outputTokens + second.outputTokens,
	};
}
