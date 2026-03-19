/**
 * Interactive Form TUI Component
 *
 * A tabbed form interface for gathering multiple user inputs.
 * Features:
 * - Tab navigation with arrow keys or Tab
 * - Single/multiple selection per tab
 * - Custom text input option
 * - Summary view before submit
 */

import {
	type Component,
	Container,
	Text,
	matchesKey,
	Key,
	truncateToWidth,
	visibleWidth,
	wrapTextWithAnsi,
	Input,
	type Focusable,
} from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";
import type { TabConfig, TabResponse, FormResult } from "./index";
import type { TUI } from "@mariozechner/pi-tui";

export class InteractiveForm implements Component, Focusable {
	private tui: TUI;
	private theme: Theme;
	private title: string;
	private tabs: TabConfig[];
	private done: (result: FormResult | null) => void;
	private signal?: AbortSignal;

	// State
	private currentTabIndex = 0;
	private responses: Record<string, TabResponse> = {};
	private optionCursor: Record<string, number> = {}; // cursor position per tab
	private customInputMode: Record<string, boolean> = {}; // whether typing custom text
	private customInputs: Record<string, Input> = {}; // Input components for custom text

	// Cache
	private cachedWidth?: number;
	private cachedLines?: string[];

	// Focusable
	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		// Propagate focus to active custom input if in custom mode
		const tabId = this.tabs[this.currentTabIndex]?.id;
		if (tabId && this.customInputMode[tabId] && this.customInputs[tabId]) {
			this.customInputs[tabId].focused = value;
		}
	}

	constructor(
		tui: TUI,
		theme: Theme,
		title: string,
		tabs: TabConfig[],
		done: (result: FormResult | null) => void,
		signal?: AbortSignal
	) {
		this.tui = tui;
		this.theme = theme;
		this.title = title;
		this.tabs = tabs;
		this.done = done;
		this.signal = signal;

		// Initialize state for each tab
		for (const tab of tabs) {
			this.responses[tab.id] = { selected: [] };
			this.optionCursor[tab.id] = 0;
			this.customInputMode[tab.id] = false;
			this.customInputs[tab.id] = new Input(theme, 1, 0, "Type your answer...");
		}

		// Handle abort signal
		if (signal) {
			signal.addEventListener("abort", () => {
				this.done(null);
			});
		}
	}

	handleInput(data: string): void {
		const isSubmitTab = this.currentTabIndex === this.tabs.length; // Virtual submit tab
		const currentTab = this.tabs[this.currentTabIndex]; // undefined on submit tab

		// Global navigation - always available
		if (matchesKey(data, Key.escape)) {
			this.done(null);
			return;
		}

		// Submit tab handling
		if (isSubmitTab) {
			if (matchesKey(data, Key.enter)) {
				this.done({ responses: this.responses });
				return;
			}
			// Tab navigation back
			if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
				this.currentTabIndex = Math.max(this.currentTabIndex - 1, 0);
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}

		if (!currentTab) return;

		const tabId = currentTab.id;
		const isCustomMode = this.customInputMode[tabId];

		// Handle custom input mode
		if (isCustomMode) {
			if (matchesKey(data, Key.escape)) {
				// Exit custom input mode
				this.customInputMode[tabId] = false;
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.enter)) {
				// Confirm custom input and exit mode
				const inputText = this.customInputs[tabId].getText().trim();
				if (inputText) {
					this.responses[tabId] = {
						selected: [],
						customText: inputText,
					};
				}
				this.customInputMode[tabId] = false;
				this.invalidate();
				this.tui.requestRender();
				return;
			}
			// Pass to input component
			this.customInputs[tabId].handleInput?.(data);
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		// Tab navigation
		if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
			this.currentTabIndex = Math.min(this.currentTabIndex + 1, this.tabs.length);
			this.invalidate();
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.shift("tab")) || matchesKey(data, Key.left)) {
			this.currentTabIndex = Math.max(this.currentTabIndex - 1, 0);
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		// Option navigation
		const optionCount = currentTab.options.length + (currentTab.allowCustom ? 1 : 0);
		const cursor = this.optionCursor[tabId] ?? 0;

		if (matchesKey(data, Key.up)) {
			this.optionCursor[tabId] = Math.max(0, cursor - 1);
			this.invalidate();
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.down)) {
			this.optionCursor[tabId] = Math.min(optionCount - 1, cursor + 1);
			this.invalidate();
			this.tui.requestRender();
			return;
		}

		// Selection
		if (matchesKey(data, Key.enter) || matchesKey(data, Key.space)) {
			const isCustomOption = currentTab.allowCustom && cursor === currentTab.options.length;

			if (isCustomOption) {
				// Enter custom input mode
				this.customInputMode[tabId] = true;
				this.customInputs[tabId].focused = this._focused;
				this.invalidate();
				this.tui.requestRender();
				return;
			}

			// Toggle option selection
			const option = currentTab.options[cursor];
			if (!option) return;

			const response = this.responses[tabId];
			if (currentTab.selectionType === "single") {
				// Single selection - replace
				response.selected = [option.value];
				response.customText = undefined;
			} else {
				// Multiple selection - toggle
				const idx = response.selected.indexOf(option.value);
				if (idx >= 0) {
					response.selected.splice(idx, 1);
				} else {
					response.selected.push(option.value);
				}
				response.customText = undefined;
			}

			this.invalidate();
			this.tui.requestRender();
			return;
		}

		// Number keys for quick selection (1-9)
		const numKey = parseInt(data, 10);
		if (!isNaN(numKey) && numKey >= 1 && numKey <= optionCount) {
			const optionIndex = numKey - 1;
			const isCustomOption = currentTab.allowCustom && optionIndex === currentTab.options.length;

			if (isCustomOption) {
				this.customInputMode[tabId] = true;
				this.customInputs[tabId].focused = this._focused;
			} else {
				const option = currentTab.options[optionIndex];
				if (option) {
					const response = this.responses[tabId];
					if (currentTab.selectionType === "single") {
						response.selected = [option.value];
						response.customText = undefined;
					} else {
						const idx = response.selected.indexOf(option.value);
						if (idx >= 0) {
							response.selected.splice(idx, 1);
						} else {
							response.selected.push(option.value);
						}
						response.customText = undefined;
					}
				}
			}

			this.optionCursor[tabId] = optionIndex;
			this.invalidate();
			this.tui.requestRender();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const t = this.theme;

		// Top border
		lines.push(t.fg("border", "─".repeat(width)));

		// Tab header
		const tabHeader = this.renderTabHeader(width);
		lines.push(tabHeader);

		// Separator
		lines.push(t.fg("border", "─".repeat(width)));

		// Content area
		const isSubmitTab = this.currentTabIndex === this.tabs.length;

		if (isSubmitTab) {
			// Summary view
			lines.push("");
			lines.push(t.fg("accent", t.bold("  Summary - Review your responses:")));
			lines.push("");

			for (const tab of this.tabs) {
				const response = this.responses[tab.id];
				let answer = "(no selection)";

				if (response?.customText) {
					answer = response.customText;
				} else if (response?.selected.length > 0) {
					answer = response.selected
						.map((val) => {
							const opt = tab.options.find((o) => o.value === val);
							return opt ? opt.label : val;
						})
						.join(", ");
				}

				lines.push(truncateToWidth(`  ${t.fg("muted", tab.label + ":")} ${answer}`, width));
			}

			lines.push("");
			lines.push(t.fg("success", "  Press Enter to submit"));
		} else {
			// Question view
			const currentTab = this.tabs[this.currentTabIndex];
			if (currentTab) {
				lines.push("");
				const wrappedQuestion = wrapTextWithAnsi(`  ${t.fg("accent", t.bold(currentTab.question))}`, width);
				for (const wl of wrappedQuestion) {
					lines.push(wl);
				}
				lines.push("");

				const response = this.responses[currentTab.id];
				const cursor = this.optionCursor[currentTab.id] ?? 0;
				const isCustomMode = this.customInputMode[currentTab.id];

				// Render options
				currentTab.options.forEach((opt, idx) => {
					const isSelected = response?.selected.includes(opt.value);
					const isCursor = idx === cursor && !isCustomMode;
					const prefix = isCursor ? t.fg("accent", "› ") : "  ";

					let checkbox: string;
					if (currentTab.selectionType === "single") {
						checkbox = isSelected ? t.fg("success", "(•)") : t.fg("muted", "( )");
					} else {
						checkbox = isSelected ? t.fg("success", "[✓]") : t.fg("muted", "[ ]");
					}

					const num = t.fg("dim", `${idx + 1}.`);
					const label = isCursor ? t.fg("accent", opt.label) : opt.label;

					lines.push(truncateToWidth(`${prefix}${num} ${checkbox} ${label}`, width));

					if (opt.description) {
						const descIndent = "       ";
						lines.push(truncateToWidth(`${descIndent}${t.fg("muted", opt.description)}`, width));
					}
				});

				// Custom input option
				if (currentTab.allowCustom) {
					const customIdx = currentTab.options.length;
					const isCursor = customIdx === cursor && !isCustomMode;
					const hasCustom = !!response?.customText;
					const prefix = isCursor ? t.fg("accent", "› ") : "  ";

					let checkbox: string;
					if (currentTab.selectionType === "single") {
						checkbox = hasCustom ? t.fg("success", "(•)") : t.fg("muted", "( )");
					} else {
						checkbox = hasCustom ? t.fg("success", "[✓]") : t.fg("muted", "[ ]");
					}

					const num = t.fg("dim", `${customIdx + 1}.`);
					const label = isCursor ? t.fg("accent", "Type something") : "Type something";

					lines.push(truncateToWidth(`${prefix}${num} ${checkbox} ${label}`, width));

					if (isCustomMode) {
						// Show input field
						lines.push("");
						const inputLines = this.customInputs[currentTab.id].render(width - 4);
						for (const line of inputLines) {
							lines.push("    " + line);
						}
						lines.push(truncateToWidth(`    ${t.fg("dim", "Enter to confirm • Esc to cancel")}`, width));
					} else if (hasCustom) {
						lines.push(truncateToWidth(`       ${t.fg("muted", `"${response.customText}"`)}`, width));
					}
				}
			}
		}

		// Bottom padding
		lines.push("");

		// Help line
		lines.push(t.fg("dim", "  ←→/Tab: navigate tabs • ↑↓: select option • Enter/Space: toggle • Esc: cancel"));

		// Bottom border
		lines.push(t.fg("border", "─".repeat(width)));

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	private renderTabHeader(width: number): string {
		const t = this.theme;
		const parts: string[] = [];

		// Back arrow
		parts.push(this.currentTabIndex > 0 ? t.fg("muted", "← ") : "  ");

		// Tabs
		const allTabs = [...this.tabs.map((tab) => tab.label), "Submit"];

		for (let i = 0; i < allTabs.length; i++) {
			const label = allTabs[i];
			const isActive = i === this.currentTabIndex;
			const hasResponse = i < this.tabs.length && this.hasResponse(this.tabs[i].id);

			let tabStr: string;
			if (isActive) {
				// Active tab - highlighted background
				tabStr = t.bg("selectedBg", t.fg("accent", ` ${label} `));
			} else if (i === this.tabs.length) {
				// Submit tab
				tabStr = ` ${t.fg("success", "✓")} ${label} `;
			} else if (hasResponse) {
				// Completed tab
				tabStr = ` ${t.fg("success", "✓")} ${t.fg("muted", label)} `;
			} else {
				// Incomplete tab
				tabStr = ` ${t.fg("dim", "○")} ${t.fg("muted", label)} `;
			}

			parts.push(tabStr);

			if (i < allTabs.length - 1) {
				parts.push(t.fg("border", "│"));
			}
		}

		// Forward arrow
		parts.push(this.currentTabIndex < this.tabs.length ? t.fg("muted", " →") : "  ");

		return parts.join("");
	}

	private hasResponse(tabId: string): boolean {
		const response = this.responses[tabId];
		return !!(response && (response.selected.length > 0 || response.customText));
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}
