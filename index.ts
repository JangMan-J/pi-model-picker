/**
 * Model Picker Extension
 *
 * Categorized, keyboard-driven model selector with per-category search.
 *
 * Tab switches provider/maker grouping; arrows switch categories when search is empty.
 *
 * Usage:
 *   /models          — open the categorized picker
 *   Ctrl+Shift+M     — keyboard shortcut (default; configurable, see below)
 *
 * Note: /model is a built-in pi command and cannot be overridden.
 *
 * Configuring the shortcut:
 *   Add to ~/.pi/agent/settings.json:
 *     { "pi-model-picker": { "shortcut": "ctrl+l" } }
 *   Accepts a string, an array of strings (binds multiple keys), or `false`
 *   to disable the shortcut entirely (the /models command still works).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Input, Key, matchesKey, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import type { KeyId } from "@mariozechner/pi-tui";
import type { Api, Model } from "@mariozechner/pi-ai";

// ─── settings ───────────────────────────────────────────────────────────────

const DEFAULT_SHORTCUT = "ctrl+shift+m";

function readSetting(setting: string): unknown {
	try {
		const raw = JSON.parse(readFileSync(join(homedir(), ".pi", "agent", "settings.json"), "utf-8"));
		return raw?.["pi-model-picker"]?.[setting];
	} catch {
		return undefined; // Missing or malformed settings use defaults.
	}
}

/** Accept a key, multiple keys, or false/[] to disable. */
function resolveShortcuts(setting = "shortcut", fallback = DEFAULT_SHORTCUT): string[] {
	const shortcut = readSetting(setting);
	if (shortcut === false) return [];
	if (typeof shortcut === "string") return shortcut ? [shortcut] : [];
	if (Array.isArray(shortcut)) return shortcut.filter((s): s is string => typeof s === "string" && s.length > 0);
	return [fallback];
}

// ─── helpers ────────────────────────────────────────────────────────────────

/** Friendly display name for a provider id — derived from the id itself, no hardcoding */
function providerLabel(id: string): string {
	return id
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

/** Format context window as human-readable */
function fmtCtx(tokens: number): string {
	if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(0)}M`;
	if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}k`;
	return String(tokens);
}

/** Format per-million-token cost as "$in/$out"; omit invalid or all-zero rates. */
function fmtCost(cost: { input: number; output: number }): string {
	const rates = [cost?.input, cost?.output];
	if (!rates.every((n) => Number.isFinite(n) && n >= 0) || !rates.some((n) => n > 0)) return "";
	const fmt = (n: number) => (n === 0 ? "0" : n < 1 ? n.toFixed(2) : n.toFixed(2).replace(/\.?0+$/, ""));
	return rates.map((n) => `$${fmt(n)}`).join("/");
}

const MAKERS: Record<string, RegExp> = {
	OpenAI: /^(?:openai\b|gpt[-\s]|chatgpt\b|o[134](?:[-\s]|$))/i,
	Anthropic: /^(?:anthropic\b|claude\b)/i,
	Google: /^(?:google\b|gemini\b|gemma\b)/i,
	Meta: /^(?:meta\b|llama\b)/i,
	DeepSeek: /^deepseek\b/i,
	Qwen: /^(?:qwen(?:\b|\d)|qwq\b)/i,
};

function modelMaker(model: Model<Api>): string {
	// ponytail: name/ID heuristic; add aliases here when a maker uses new branding.
	for (const text of [model.name, model.id.replace(/^hf:/i, ""), model.id.split("/").pop()!]) {
		const maker = Object.entries(MAKERS).find(([, pattern]) => pattern.test(text));
		if (maker) return maker[0];
	}
	return "Other";
}

// ─── component ──────────────────────────────────────────────────────────────

interface ModelPickerOptions {
	allModels: Model<Api>[];
	currentModel: Model<Api> | undefined;
	lastTab?: { byMaker: boolean; category: string };
	onSelect: (model: Model<Api>) => void;
	onCancel: () => void;
}

class ModelPickerComponent {
	// Focusable — needed so the Input inside gets IME cursor positioning
	focused = false;

	private categories: string[];
	private catIndex: number;
	private rowIndex = 0;
	private byMaker = false;

	// per-category source models (sorted, never mutated)
	private byCategory: Map<string, Model<Api>[]>;

	// per-category search terms (reset when category changes, preserved when returning)
	private searchTerms: Map<string, string> = new Map();

	// the search Input widget
	private searchInput: Input;

	// filtered models for the current view (recomputed on query/category change)
	private filteredRows: Model<Api>[] = [];

	constructor(private opts: ModelPickerOptions) {
		this.byMaker = opts.lastTab?.byMaker ?? false;
		this.byCategory = this.buildCategories();
		this.categories = Array.from(this.byCategory.keys());

		// Restore the saved tab if available, otherwise follow the current model.
		const cur = opts.currentModel;
		const startCat = opts.lastTab && this.byCategory.has(opts.lastTab.category)
			? opts.lastTab.category : cur ? this.categoryFor(cur) : this.categories[0];
		this.catIndex = Math.max(0, this.categories.indexOf(startCat ?? ""));

		// Build the search Input
		this.searchInput = new Input();
		this.searchInput.focused = true;
		this.searchInput.onEscape = () => opts.onCancel();
		this.searchInput.onSubmit = () => {
			const selected = this.filteredRows[this.rowIndex];
			if (selected) opts.onSelect(selected);
		};

		// Initialise filtered rows and pre-select current model
		this.applyFilter();
		if (cur) {
			const idx = this.filteredRows.findIndex(
				(m) => m.id === cur.id && m.provider === cur.provider,
			);
			this.rowIndex = Math.max(0, idx);
		}
	}

	getLastTab() {
		return { byMaker: this.byMaker, category: this.categories[this.catIndex] ?? "" };
	}

	// ── public Focusable propagation ─────────────────────────────────────
	set focusedState(v: boolean) {
		this.focused = v;
		this.searchInput.focused = v;
	}

	// ── category building ────────────────────────────────────────────────

	private categoryFor(model: Model<Api>): string {
		if (!this.byMaker) return model.provider;
		const maker = modelMaker(model);
		return ["DeepSeek", "Qwen"].includes(maker) ? "Open Weights" : maker;
	}

	private buildCategories(): Map<string, Model<Api>[]> {
		const map = new Map<string, Model<Api>[]>();
		for (const m of this.opts.allModels) {
			const key = this.categoryFor(m);
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(m);
		}

		const cur = this.opts.currentModel;

		// Sort models within each category: active first, then alphabetical
		for (const [, arr] of map) {
			arr.sort((a, b) => {
				const aCur = cur && a.id === cur.id && a.provider === cur.provider ? -1 : 0;
				const bCur = cur && b.id === cur.id && b.provider === cur.provider ? -1 : 0;
				if (aCur !== bCur) return aCur - bCur;
				return a.name.localeCompare(b.name) || a.provider.localeCompare(b.provider);
			});
		}

		if (this.byMaker) {
			return new Map(["OpenAI", "Anthropic", "Google", "Meta", "Open Weights", "Other"]
				.filter((key) => map.has(key)).map((key) => [key, map.get(key)!]));
		}

		// Sort categories: active provider first, then alphabetical
		return new Map(
			[...map.entries()].sort(([aKey], [bKey]) => {
				const aCur = cur && aKey === cur.provider ? -1 : 0;
				const bCur = cur && bKey === cur.provider ? -1 : 0;
				if (aCur !== bCur) return aCur - bCur;
				return aKey.localeCompare(bKey);
			}),
		);
	}

	// ── filtering ────────────────────────────────────────────────────────

	private searchKey(): string {
		return `${this.byMaker}:${this.categories[this.catIndex] ?? ""}`;
	}

	private applyFilter(): void {
		const catKey = this.categories[this.catIndex] ?? "";
		const source = this.byCategory.get(catKey) ?? [];
		const query = (this.searchTerms.get(this.searchKey()) ?? "").toLowerCase().trim();

		if (!query) {
			this.filteredRows = source;
		} else {
			this.filteredRows = source.filter(
				(m) =>
					m.name.toLowerCase().includes(query) ||
					m.id.toLowerCase().includes(query) ||
					m.provider.toLowerCase().includes(query),
			);
		}
		// Clamp row selection
		this.rowIndex = Math.min(this.rowIndex, Math.max(0, this.filteredRows.length - 1));
	}

	private switchCategory(delta: number): void {
		if (!this.categories.length) return;
		// Save current search term for this category before leaving
		this.searchTerms.set(this.searchKey(), this.searchInput.getValue());

		this.catIndex =
			(this.catIndex + delta + this.categories.length) % this.categories.length;

		// Restore search term for new category
		const saved = this.searchTerms.get(this.searchKey()) ?? "";
		this.searchInput.setValue(saved);

		this.rowIndex = 0;
		this.applyFilter();
	}

	private toggleGrouping(): void {
		const selected = this.filteredRows[this.rowIndex] ?? this.opts.currentModel;
		this.byMaker = !this.byMaker;
		this.byCategory = this.buildCategories();
		this.categories = Array.from(this.byCategory.keys());
		this.catIndex = Math.max(0, this.categories.indexOf(selected ? this.categoryFor(selected) : ""));
		this.searchTerms.set(this.searchKey(), this.searchInput.getValue());
		this.applyFilter();
		this.rowIndex = Math.max(0, this.filteredRows.indexOf(selected!));
	}

	// ── input handling ───────────────────────────────────────────────────

	handleInput(data: string): void {
		if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
			this.toggleGrouping();
			return;
		}
		// ↑ / ↓ — navigate the list with wraparound
		if (matchesKey(data, Key.up)) {
			this.rowIndex =
				this.rowIndex === 0
					? this.filteredRows.length - 1
					: this.rowIndex - 1;
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.rowIndex =
				this.rowIndex === this.filteredRows.length - 1
					? 0
					: this.rowIndex + 1;
			return;
		}

		// ← at start of empty field — switch category left
		if (matchesKey(data, Key.left) && this.searchInput.getValue() === "") {
			this.switchCategory(-1);
			return;
		}
		// → at end of empty field — switch category right
		if (matchesKey(data, Key.right) && this.searchInput.getValue() === "") {
			this.switchCategory(1);
			return;
		}

		// Everything else (including ← / → when field has text) → Input
		const before = this.searchInput.getValue();
		this.searchInput.handleInput(data);
		const after = this.searchInput.getValue();

		if (before !== after) {
			// Update stored term and refilter
			this.searchTerms.set(this.searchKey(), after);
			this.rowIndex = 0;
			this.applyFilter();
		}
	}

	// ── rendering ────────────────────────────────────────────────────────

	render(width: number, theme: any): string[] {
		const lines: string[] = [
			truncateToWidth(theme.fg("muted", "Group: ") +
				theme.fg(this.byMaker ? "muted" : "accent", "providers") +
				theme.fg("muted", " | ") +
				theme.fg(this.byMaker ? "accent" : "muted", "makers"), width),
			theme.fg("dim", truncateToWidth("tab group (providers/makers)", width)),
			"",
		];

		// ── tab bar ──────────────────────────────────────────────────────
		lines.push(this.renderTabs(width, theme));

		// ── search field ─────────────────────────────────────────────────
		lines.push("");
		const prompt = theme.fg("muted", "  Search: ");
		const promptW = visibleWidth("  Search: ");
		const inputLines = this.searchInput.render(width - promptW);
		lines.push(prompt + (inputLines[0] ?? ""));

		lines.push("");

		// ── model list ───────────────────────────────────────────────────
		const MAX_VISIBLE = 10;
		const half = Math.floor(MAX_VISIBLE / 2);
		const rows = this.filteredRows;
		const start = Math.max(0, Math.min(this.rowIndex - half, rows.length - MAX_VISIBLE));
		const visible = rows.slice(start, start + MAX_VISIBLE);

		if (rows.length === 0) {
			const query = this.searchInput.getValue();
			const msg = query
				? `  No models match "${query}"`
				: "  No models in this category";
			lines.push(theme.fg("muted", msg));
		} else {
			const providerWidth = this.byMaker ? Math.max(12, ...visible.map((m) => visibleWidth(`[${m.provider}]`))) : 0;
			const colW = {
				cost: Math.max(0, ...visible.map((m) => visibleWidth(fmtCost(m.cost)))),
				ctx: Math.max(0, ...visible.map((m) => visibleWidth(m.contextWindow ? fmtCtx(m.contextWindow) : ""))),
				thinking: visible.some((m) => m.reasoning) ? "thinking".length : 0,
				vision: visible.some((m) => m.input.includes("image")) ? "vision".length : 0,
			};
			const infoWidth = Object.values(colW).filter(Boolean).reduce((sum, n) => sum + n + 2, -2);
			// Reserve 10 name columns plus the cursor, current-model mark, and gap.
			if (infoWidth + 16 > width) colW.cost = 0;
			for (let i = 0; i < visible.length; i++) {
				const model = visible[i]!;
				const absIdx = start + i;
				const isSelected = absIdx === this.rowIndex;
				const isCurrent =
					this.opts.currentModel?.id === model.id &&
					this.opts.currentModel?.provider === model.provider;
				lines.push(this.renderRow(model, isSelected, isCurrent, width, theme, colW, providerWidth));
			}
			if (rows.length > MAX_VISIBLE) {
				const shown = `${start + 1}–${Math.min(start + MAX_VISIBLE, rows.length)} of ${rows.length}`;
				lines.push(theme.fg("dim", "  " + shown));
			}
		}

		// ── help bar ─────────────────────────────────────────────────────
		lines.push("");
		const help = "↑↓ navigate  ·  ← → category  ·  enter select  ·  esc cancel";
		lines.push(theme.fg("dim", truncateToWidth("  " + help, width)));

		return lines;
	}

	private renderTabs(width: number, theme: any): string {
		const total = this.categories.length;
		if (!total) return "";
		const active = this.catIndex;
		const ARROW_W = 4; // "◀ " + " ▶"
		const SEP_W = 1;   // "│"
		const availForTabs = width - ARROW_W;

		let lo = active;
		let hi = active;
		let used = visibleWidth(` ${providerLabel(this.categories[active]!)} `);

		while (true) {
			let expanded = false;
			if (hi + 1 < total) {
				const w = SEP_W + visibleWidth(` ${providerLabel(this.categories[hi + 1]!)} `);
				if (used + w <= availForTabs) { hi++; used += w; expanded = true; }
			}
			if (lo - 1 >= 0) {
				const w = SEP_W + visibleWidth(` ${providerLabel(this.categories[lo - 1]!)} `);
				if (used + w <= availForTabs) { lo--; used += w; expanded = true; }
			}
			if (!expanded) break;
		}

		const segments: string[] = [];
		for (let i = lo; i <= hi; i++) {
			const label = ` ${providerLabel(this.categories[i]!)} `;
			segments.push(
				i === active
					? theme.fg("accent", theme.bold(label))
					: theme.fg("muted", label),
			);
		}

		const tabPart = segments.join(theme.fg("dim", "│"));
		const leftPart = lo > 0 ? theme.fg("dim", "◀ ") : "  ";
		const rightPart = hi < total - 1 ? theme.fg("dim", " ▶") : "  ";

		return truncateToWidth(leftPart + tabPart + rightPart, width);
	}

	private renderRow(
		model: Model<Api>,
		isSelected: boolean,
		isCurrent: boolean,
		width: number,
		theme: any,
		colW: { cost: number; ctx: number; thinking: number; vision: number },
		providerWidth: number,
	): string {
		const prefix = isSelected ? "▶ " : "  ";
		const ctxStr = model.contextWindow ? fmtCtx(model.contextWindow) : "";
		const costStr = fmtCost(model.cost);
		// Pad blank cells too, so missing values cannot shift the other columns.
		const right = [
			colW.cost ? costStr.padStart(colW.cost) : "",
			ctxStr.padStart(colW.ctx),
			(model.reasoning ? "thinking" : "").padEnd(colW.thinking),
			(model.input.includes("image") ? "vision" : "").padEnd(colW.vision),
		].filter(Boolean).join("  ");

		const curMark = isCurrent ? " ●" : "";
		const nameAvail = width - visibleWidth(prefix) - visibleWidth(right) - visibleWidth(curMark) - 2;
		const label = this.byMaker
			? model.name.replace(new RegExp(`^${this.categoryFor(model)}:\\s*`, "i"), "")
			: model.name;
		const tag = `[${model.provider}]`;
		const name = this.byMaker ? `${tag}${" ".repeat(providerWidth - visibleWidth(tag) + 1)}${label}` : label;
		const nameTrunc = truncateToWidth(name, Math.max(nameAvail, 10));
		const gap = " ".repeat(
			Math.max(0, width - visibleWidth(prefix + nameTrunc + curMark) - visibleWidth(right)),
		);

		if (isSelected) {
			return (
				theme.fg("accent", prefix + nameTrunc + curMark) +
				gap +
				theme.fg("accent", theme.bold(right))
			);
		} else if (isCurrent) {
			return (
				theme.fg("success", prefix + nameTrunc + curMark) +
				gap +
				theme.fg("muted", right)
			);
		} else {
			return (
				theme.fg("text", prefix + nameTrunc) +
				gap +
				theme.fg("dim", right)
			);
		}
	}

	invalidate(): void {
		this.searchInput.invalidate();
	}
}

// ─── extension ──────────────────────────────────────────────────────────────

export default function modelPickerExtension(pi: ExtensionAPI) {
	const rememberLastTab = readSetting("rememberLastTab") !== false;
	const statePath = join(homedir(), ".pi", "agent", "pi-model-picker-state.json");
	async function openPicker(ctx: ExtensionContext) {
		// Same logic as /model: refresh from disk, then only models with auth configured
		ctx.modelRegistry.refresh();
		const allModels = ctx.modelRegistry.getAvailable();

		if (allModels.length === 0) {
			ctx.ui.notify("No models available", "warning");
			return;
		}

		let lastTab: ModelPickerOptions["lastTab"];
		if (rememberLastTab) {
			try {
				const saved = JSON.parse(readFileSync(statePath, "utf-8"));
				if (typeof saved?.byMaker === "boolean" && typeof saved?.category === "string") lastTab = saved;
			} catch { /* No usable saved tab: use the current model. */ }
		}

		const selected = await ctx.ui.custom<Model<Api> | null>((tui, theme, _kb, done) => {
			const close = (model: Model<Api> | null) => {
				if (rememberLastTab) {
					try {
						writeFileSync(statePath, JSON.stringify(picker.getLastTab()), { mode: 0o600 });
					} catch {
						ctx.ui.notify("Could not save the last model tab.", "warning");
					}
				}
				done(model);
			};
			const picker = new ModelPickerComponent({
				allModels,
				currentModel: ctx.model ?? undefined,
				lastTab,
				onSelect: close,
				onCancel: () => close(null),
			});

			// Give the picker focus so the embedded Input gets IME cursor
			picker.focusedState = true;

			return {
				// Implement Focusable so pi propagates focus to the Input's cursor
				focused: true,

				render(width: number): string[] {
					return picker.render(width, theme);
				},
				invalidate() {
					picker.invalidate();
				},
				handleInput(data: string) {
					picker.handleInput(data);
					tui.requestRender();
				},
			};
		});

		if (!selected) return;

		const success = await pi.setModel(selected);
		if (!success) {
			ctx.ui.notify(`No API key for ${selected.provider}/${selected.id}`, "error");
		} else {
			ctx.ui.notify(`Model: ${selected.name}`, "info");
		}
	}

	// /model is a reserved built-in — use /models instead
	pi.registerCommand("models", {
		description: "Select model by provider or maker (Tab switches grouping)",
		handler: async (_args, ctx) => {
			await openPicker(ctx);
		},
	});

	// Keyboard shortcut(s) — configurable via settings.json ("pi-model-picker": { "shortcut": ... })
	const shortcuts = resolveShortcuts();
	const seen = new Set<string>();
	for (const shortcut of shortcuts) {
		const normalized = shortcut.toLowerCase();
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		// User-configured shortcuts come from settings.json as plain strings; pi validates
		// the actual key format at registration time, so an invalid value is a no-op rather
		// than a startup crash.
		pi.registerShortcut(shortcut as KeyId, {
			description: "Open categorized model picker",
			handler: async (ctx) => {
				await openPicker(ctx);
			},
		});
	}
}
