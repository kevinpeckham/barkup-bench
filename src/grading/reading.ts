/**
 * Grading for reading tasks: exact answers with light, pre-registered
 * normalization (models are told to answer with only the value; we
 * forgive formatting, never meaning).
 */

export function normalizeAnswer(text: string): string {
	const lines = text
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
	let answer = lines.length > 0 ? (lines[lines.length - 1] as string) : "";
	// Strip common wrapping: code fences/backticks, quotes, bold, trailing period.
	answer = answer.replace(/^```[a-z]*\s*|\s*```$/g, "");
	answer = answer.replace(/^\*\*(.*)\*\*$/s, "$1");
	answer = answer.replace(/^`(.*)`$/s, "$1");
	answer = answer.replace(/^"(.*)"$/s, "$1").replace(/^'(.*)'$/s, "$1");
	answer = answer.replace(/\.$/, "");
	return answer.trim();
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
		return `{${entries.join(",")}}`;
	}
	return JSON.stringify(value);
}

export function answersMatch(expected: string, actualRaw: string): boolean {
	const actual = normalizeAnswer(actualRaw);
	if (expected === actual) return true;

	// Numeric-aware comparison when the expected answer is a number.
	const expectedNumber = Number(expected);
	if (expected.trim() !== "" && Number.isFinite(expectedNumber)) {
		const actualNumber = Number(actual);
		return Number.isFinite(actualNumber) && expectedNumber === actualNumber;
	}

	// JSON-aware comparison when the expected answer is JSON (json attrs).
	try {
		const expectedValue = JSON.parse(expected);
		if (
			typeof expectedValue === "object" ||
			typeof expectedValue === "boolean"
		) {
			try {
				return (
					canonicalJson(expectedValue) === canonicalJson(JSON.parse(actual))
				);
			} catch {
				return false;
			}
		}
	} catch {
		// expected is a plain string — fall through
	}
	return false;
}
