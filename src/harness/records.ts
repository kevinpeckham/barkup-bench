/** Result records written as JSONL, one line per task × condition × model. */
import type { Family } from "../corpus/tasks.js";
import type { BucketName } from "../corpus/trees.js";

export interface CallLog {
	/** 1 or 2 for reference tasks' two edits; 1 otherwise. */
	phase: number;
	/** 1 = initial attempt; 2..4 = correction rounds. */
	round: number;
	inputTokens: number;
	outputTokens: number;
	/** Provider-reported cached-input reads, for the with/without-cache cost views. */
	cacheReadTokens?: number;
	/** Provider-reported cache writes (Study Z caching appendix). */
	cacheWriteTokens?: number;
	/** Provider-reported reasoning tokens (subset of output). */
	reasoningTokens?: number;
	latencyMs: number;
	/** Tool-loop steps in this call (tools arms only). */
	steps?: number;
	/** Issue codes fed back after this call (empty when valid). */
	issueCodes: string[];
}

export interface TaskRunRecord {
	taskId: string;
	family: Family;
	bucket: BucketName;
	condition: string;
	model: string;
	regime: string;
	/** Task solved (validity + semantic correctness; both phases for reference). */
	success: boolean;
	/** First artifact was already valid (null where validity does not apply, i.e. reading). */
	firstPassValid: boolean | null;
	/** Success achieved without any correction round. */
	passAt1: boolean;
	/** Total model calls (rounds) across phases. */
	rounds: number;
	drift: number | null;
	idRefFailure: boolean | null;
	toolErrorCount: number | null;
	totalInputTokens: number;
	totalOutputTokens: number;
	totalLatencyMs: number;
	calls: CallLog[];
	/** Harness/API failure, if the task could not be completed. */
	error?: string;
	detail?: Record<string, unknown>;
}
