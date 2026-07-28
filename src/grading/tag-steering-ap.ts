/**
 * Study AP mechanical scoring (docs/BRIEF-AP.md), extracted from the
 * AO runner so the grader carries unit tests. The lint and slug
 * algorithm are the shipped replicator implementations ported
 * verbatim (registered in BRIEF-AO/BRIEF-AP); the tag_create guard is
 * the tool as it would ship — the server owns the invariant.
 */

export interface TagCatalogEntry {
	name: string;
	category: string;
}

export interface TagWarning {
	message: string;
	path: string;
}

export type ApClass = "covered" | "trap" | "adjacent" | "foreign";
export type ApArm = "AP-shipped" | "AP-fork" | "AP-empty" | "AP-tool";

/** Shipped slug algorithm (replicator tagCatalogLint.tagSlug, verbatim). */
export function tagSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[™®©]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * A cell's live catalog: the fixture catalog plus any tags minted (and
 * accepted) during the cell. Mutable per cell, never shared.
 */
export class CellCatalog {
	readonly names = new Set<string>();
	private readonly bySlug = new Map<string, string>();
	readonly mints: string[] = [];
	mintAttempts = 0;
	readonly mintRejections: string[] = [];

	constructor(entries: TagCatalogEntry[]) {
		for (const entry of entries) {
			this.names.add(entry.name);
			this.bySlug.set(tagSlug(entry.name), entry.name);
		}
	}

	/** Shipped lint, ported verbatim (message strings registered in the brief). */
	lint(tags: unknown): TagWarning[] {
		if (!Array.isArray(tags)) return [];
		const warnings: TagWarning[] = [];
		tags.forEach((entry, index) => {
			if (typeof entry !== "string" || !entry.trim()) return;
			if (this.names.has(entry)) return;
			const canonical = this.bySlug.get(tagSlug(entry));
			warnings.push({
				message: canonical
					? `"${entry}" is not a canonical tag — did you mean "${canonical}"?`
					: `"${entry}" is not a canonical tag — pick from tags_list, or add it in Org Settings → Tags`,
				path: `tags.${index}`,
			});
		});
		return warnings;
	}

	/**
	 * tag_create guard (BRIEF-AP, "as it would ship"): rejects empty and
	 * over-long names and anything slug-equivalent to an existing name
	 * (fixture or prior mint). Accepted mints join the catalog.
	 */
	mint(name: string): { ok: true } | { ok: false; error: string } {
		this.mintAttempts += 1;
		const trimmed = name.trim();
		if (trimmed === "") {
			this.mintRejections.push(name);
			return { ok: false, error: "Tag name must not be empty." };
		}
		if (trimmed.length > 40) {
			this.mintRejections.push(name);
			return { ok: false, error: "Tag name must be 40 characters or fewer." };
		}
		const canonical = this.bySlug.get(tagSlug(trimmed));
		if (canonical) {
			this.mintRejections.push(name);
			return {
				ok: false,
				error: `"${trimmed}" is slug-equivalent to canonical tag "${canonical}" — use "${canonical}" instead.`,
			};
		}
		this.names.add(trimmed);
		this.bySlug.set(tagSlug(trimmed), trimmed);
		this.mints.push(trimmed);
		return { ok: true };
	}
}

export interface CellScore {
	/** Per-cell success bit; null for the registered no-gate cell class (AP-shipped × foreign). */
	conformant: boolean | null;
	/** Non-empty and every tag exact in the cell's catalog (fixture + accepted mints). */
	canonicalClean: boolean;
	empty: boolean;
	inventedCount: number;
}

export function scoreCell(input: {
	cls: ApClass;
	arm: ApArm;
	finalTags: string[] | null;
	catalog: CellCatalog;
	acceptableTags?: string[] | undefined;
}): CellScore {
	const { cls, arm, finalTags, catalog } = input;
	const tags = finalTags ?? [];
	const mintSet = new Set(catalog.mints);
	const invented = tags.filter((t) => !catalog.names.has(t));
	const canonicalClean =
		finalTags !== null &&
		tags.length > 0 &&
		tags.every((t) => catalog.names.has(t));
	const empty = finalTags !== null && tags.length === 0;

	let conformant: boolean | null;
	switch (cls) {
		case "covered":
		case "trap":
			conformant =
				canonicalClean && (arm !== "AP-tool" || catalog.mintAttempts === 0);
			break;
		case "adjacent": {
			const acceptable = new Set(input.acceptableTags ?? []);
			conformant =
				finalTags !== null &&
				tags.length > 0 &&
				invented.length === 0 &&
				tags.filter((t) => !mintSet.has(t)).every((t) => acceptable.has(t));
			break;
		}
		case "foreign":
			if (arm === "AP-shipped") {
				conformant = null;
			} else if (arm === "AP-tool") {
				conformant =
					empty || (catalog.mints.length >= 1 && invented.length === 0);
			} else {
				conformant = empty;
			}
			break;
	}

	return { conformant, canonicalClean, empty, inventedCount: invented.length };
}
