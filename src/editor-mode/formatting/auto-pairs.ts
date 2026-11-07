import { EditorSelection } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { EditorView, keymap } from "@codemirror/view";
import { Format } from "src/enums";
import type { PluginSettings } from "src/types";
import { InlineRules } from "src/format-configs/rules";
import { EditorDelimLookup } from "src/editor-mode/preprocessor/parser-configs";
import { isEscaped } from "src/utils/escape-utils";

/** Shared by the installed input handler and native Obsidian editor checks. */
export function handleExtendedInput(view: EditorView, from: number, to: number, text: string): boolean {
	if (view.composing || view.state.readOnly || !text || !/^[+|^~=!]+$/.test(text)) return false;
	const type = EditorDelimLookup[text[0]];
	if (type === undefined || [...text].some(char => char != text[0])) return false;
	const rule = InlineRules[type];
	if (text.length > rule.length) return false;
	const state = view.state;
	// Only handle ordinary selection replacement, never an IME replacement range.
	if (from != state.selection.main.from || to != state.selection.main.to) return false;
	const plans = state.selection.ranges.map(range => {
		const line = state.doc.lineAt(range.from);
		const prefix = state.doc.sliceString(line.from, range.from);
		if (isEscaped(prefix, prefix.length)) return null;
		for (let node = syntaxTree(state).resolveInner(range.from, -1); node; node = node.parent!) {
			if (/code|math|comment|frontmatter|html|url|link/i.test(node.name)) return null;
		}
		if (!range.empty) {
			const selected = state.doc.sliceString(range.from, range.to);
			if (selected.includes("\n") || !rule.allowSpace && /\s/.test(selected)) return null;
			const delimiter = rule.char.repeat(rule.length);
			if (selected.length >= delimiter.length * 2 && selected.startsWith(delimiter) && selected.endsWith(delimiter) &&
				!isEscaped(selected, selected.length - delimiter.length) &&
				(!rule.exactLen || selected[delimiter.length] != rule.char && selected[selected.length - delimiter.length - 1] != rule.char)) {
				const content = selected.slice(delimiter.length, -delimiter.length);
				return { range, from: range.from, to: range.to, insert: content,
					anchor: range.anchor <= range.head ? range.from : range.from + content.length,
					head: range.anchor <= range.head ? range.from + content.length : range.from };
			}
			return { range, from: range.from, to: range.to, insert: text + selected + text,
				anchor: range.anchor + text.length, head: range.head + text.length };
		}
		const next = state.doc.sliceString(range.from, range.from + text.length);
		if (next == text) {
			return { range, from: range.from, to: range.to, insert: "", anchor: range.from + text.length, head: range.from + text.length };
		}
		const delimiter = rule.char.repeat(rule.length);
		const missing = rule.length - text.length;
		if (prefix.slice(prefix.length - missing) != delimiter.slice(0, missing)) return null;
		const opening = range.from - missing;
		if (isEscaped(prefix, prefix.length - missing) || state.doc.sliceString(opening - 1, opening) == rule.char) return null;
		// Do not pair inside words or in front of existing prose.
		const following = state.doc.sliceString(range.from, range.from + 1);
		if (following && !/[\s)\]}.,;:!?，。；：！？]/.test(following)) return null;
		return { range, from: range.from, to: range.to, insert: text + delimiter,
			anchor: range.from + text.length, head: range.from + text.length };
	});
	if (plans.some(plan => !plan)) return false;
	view.dispatch(state.changeByRange(range => {
		const plan = plans.find(plan => plan!.range === range)!;
		return {
			changes: { from: plan.from, to: plan.to, insert: plan.insert },
			range: EditorSelection.range(plan.anchor, plan.head),
		};
	}), { userEvent: "input.type", scrollIntoView: true });
	return true;
}

export const extendedAutoPairs = EditorView.inputHandler.of(handleExtendedInput);

/** Delete only empty, exact delimiter pairs; leave content and selections alone. */
export function deleteExtendedPair(view: EditorView, settings: Pick<PluginSettings, "autoDeleteCustomSpan">, forward = false): boolean {
	if (view.composing || view.state.readOnly) return false;
	const state = view.state;
	const plans = state.selection.ranges.map(range => {
		if (!range.empty) return null;
		const position = range.from;
		const char = state.doc.sliceString(position - 1, position);
		const type = EditorDelimLookup[char];
		if (type === undefined || type == Format.CUSTOM_SPAN && !settings.autoDeleteCustomSpan) return null;
		const rule = InlineRules[type], delimiter = char.repeat(rule.length);
		const from = position - rule.length, to = position + rule.length;
		if (from < 0 || to > state.doc.length || state.doc.sliceString(from, position) != delimiter ||
			state.doc.sliceString(position, to) != delimiter) return null;
		const prefix = state.doc.sliceString(state.doc.lineAt(from).from, from);
		if (isEscaped(prefix, prefix.length) || state.doc.sliceString(from - 1, from) == char ||
			state.doc.sliceString(to, to + 1) == char) return null;
		for (let node = syntaxTree(state).resolveInner(position, -1); node; node = node.parent!) {
			if (/code|math|comment|frontmatter|html|url|link/i.test(node.name)) return null;
		}
		return { range, from, to };
	});
	// Let the normal editor command handle every cursor if any cursor is ineligible.
	if (plans.some(plan => !plan)) return false;
	view.dispatch(state.changeByRange(range => {
		const plan = plans.find(plan => plan!.range === range)!;
		return { changes: { from: plan.from, to: plan.to }, range: EditorSelection.cursor(plan.from) };
	}), { userEvent: forward ? "delete.forward" : "delete.backward", scrollIntoView: true });
	return true;
}

export const extendedPairDeletion = (settings: PluginSettings) => keymap.of([
	{ key: "Backspace", run: view => deleteExtendedPair(view, settings) },
	{ key: "Delete", run: view => deleteExtendedPair(view, settings, true) },
]);
