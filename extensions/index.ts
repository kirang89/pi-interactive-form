/**
 * Interactive Form Tool
 *
 * A custom tool that allows the agent to ask users multiple questions
 * through a tabbed form interface. Supports single/multi-select options
 * and custom text input.
 *
 * Usage by agent:
 * The agent calls the `interactive_form` tool with tabs configuration,
 * and receives back the user's responses as plain text.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";
import { InteractiveForm } from "./form-component";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "interactive_form",
		label: "Interactive Form",
		description: `Ask the user multiple questions through a tabbed form interface. Use this when you need to gather several pieces of information or clarifications from the user at once.

Each tab represents a question with selectable options. Users can navigate between tabs, select options (or type custom answers if allowed), and submit all responses together.

Guidelines:
- Use meaningful tab labels (short, 1-2 words)
- Provide clear questions
- Include helpful option descriptions when useful
- Use "single" selection for mutually exclusive choices
- Use "multiple" selection when user can pick several options
- Set allowCustom: true when predefined options might not cover all cases`,

		parameters: Type.Object({
			title: Type.String({ description: "Form title displayed at the top" }),
			tabs: Type.Array(
				Type.Object({
					id: Type.String({ description: "Unique identifier for this tab" }),
					label: Type.String({ description: "Short label shown in tab header (1-2 words)" }),
					question: Type.String({ description: "The question to ask the user" }),
					options: Type.Array(
						Type.Object({
							value: Type.String({ description: "Value returned when selected" }),
							label: Type.String({ description: "Display label for the option" }),
							description: Type.Optional(Type.String({ description: "Optional description shown below the label" })),
						}),
						{ description: "Available options for this question" }
					),
					selectionType: StringEnum(["single", "multiple"] as const, {
						description: "single = radio buttons (one choice), multiple = checkboxes (many choices)",
					}),
					allowCustom: Type.Boolean({
						description: "If true, adds a 'Type something' option for custom input",
						default: true,
					}),
				}),
				{ description: "Array of tabs/questions to present" }
			),
		}),

		async execute(toolCallId, params, signal, onUpdate, ctx) {
			if (!ctx.hasUI) {
				return {
					content: [{ type: "text", text: "Error: interactive_form requires interactive mode" }],
					details: { error: "no_ui" },
					isError: true,
				};
			}

			// Show the interactive form
			const result = await ctx.ui.custom<FormResult | null>((tui, theme, keybindings, done) => {
				const form = new InteractiveForm(tui, theme, params.title, params.tabs, done, signal);
				return form;
			});

			if (!result || signal?.aborted) {
				return {
					content: [{ type: "text", text: "Form cancelled by user" }],
					details: { cancelled: true },
				};
			}

			// Format responses as plain text
			const lines: string[] = [];
			lines.push(`## Form Responses: ${params.title}`);
			lines.push("");

			for (const tab of params.tabs) {
				const response = result.responses[tab.id];
				lines.push(`### ${tab.label}`);
				lines.push(`**Question:** ${tab.question}`);
				
				if (response) {
					if (response.customText) {
						lines.push(`**Answer:** ${response.customText}`);
					} else if (response.selected.length > 0) {
						const selectedLabels = response.selected
							.map((val) => {
								const opt = tab.options.find((o) => o.value === val);
								return opt ? opt.label : val;
							})
							.join(", ");
						lines.push(`**Answer:** ${selectedLabels}`);
					} else {
						lines.push(`**Answer:** (no selection)`);
					}
				} else {
					lines.push(`**Answer:** (skipped)`);
				}
				lines.push("");
			}

			return {
				content: [{ type: "text", text: lines.join("\n") }],
				details: { responses: result.responses },
			};
		},
	});
}

export interface TabConfig {
	id: string;
	label: string;
	question: string;
	options: Array<{
		value: string;
		label: string;
		description?: string;
	}>;
	selectionType: "single" | "multiple";
	allowCustom: boolean;
}

export interface TabResponse {
	selected: string[];
	customText?: string;
}

export interface FormResult {
	responses: Record<string, TabResponse>;
}
