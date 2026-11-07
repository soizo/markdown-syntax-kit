import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { handleExtendedInput, deleteExtendedPair } from "../src/editor-mode/formatting/auto-pairs";
import { configureDelimLookup } from "../src/format-configs/format-utils";
import { DEFAULT_SETTINGS } from "../src/settings/configs";
import { MarkdownViewMode } from "../src/enums";

export function checkAutoPairs(cm: { state: EditorState & { constructor: typeof EditorState }, constructor: typeof EditorView }): number {
	let checks = 0;
	const run = (doc: string, anchor: number, head: number, inputs: string[], expected: string, expectedAnchor: number, expectedHead = expectedAnchor) => {
		const state = cm.state.constructor.create({ doc, selection: { anchor, head }, extensions: [
			cm.constructor.inputHandler.of(handleExtendedInput),
		] });
		const parent = document.createElement("div");
		const editor = new cm.constructor({ state, parent });
		try {
			for (const input of inputs) {
				const { from, to } = editor.state.selection.main;
				const handled = editor.state.facet(cm.constructor.inputHandler).some(handler => handler(editor, from, to, input, () => editor.state.update(editor.state.replaceSelection(input))));
				if (!handled) editor.dispatch(editor.state.replaceSelection(input));
			}
			const actual = editor.state.selection.main;
			if (editor.state.doc.toString() != expected || actual.anchor != expectedAnchor || actual.head != expectedHead)
				throw Error(`Auto pairs ${JSON.stringify({ doc, anchor, head, inputs })}: got ${JSON.stringify({ doc: editor.state.doc.toString(), anchor: actual.anchor, head: actual.head })}`);
			checks++;
		} finally { editor.destroy(); parent.replaceChildren(); }
	};
	for (const delimiter of ["++", "||", "^", "~", "==", "!!"]) {
		const wrapped = delimiter + "f萨" + delimiter;
		run(wrapped, 0, wrapped.length, [delimiter[0]], "f萨", 0, 2);
		run(wrapped, wrapped.length, 0, [delimiter[0]], "f萨", 2, 0);
		run(wrapped, 0, wrapped.length, [delimiter], "f萨", 0, 2);
		run("文字", 0, 2, [delimiter], delimiter + "文字" + delimiter, delimiter.length, delimiter.length + 2);
		run("文字", 2, 0, [delimiter], delimiter + "文字" + delimiter, delimiter.length + 2, delimiter.length);
		run("", 0, 0, [...delimiter], delimiter + delimiter, delimiter.length);
		run("", 0, 0, [...delimiter, "文", ...delimiter], delimiter + "文" + delimiter, delimiter.length * 2 + 1);
	}
	run("文字", 0, 2, ["+", "+"], "++文字++", 2, 4);
	run("\\", 1, 1, ["+", "+"], "\\++", 3);
	run("\\\\", 2, 2, ["+", "+"], "\\\\++++", 4);
	run("word", 0, 0, ["+", "+"], "++word", 2);
	run("two words", 0, 9, ["^"], "^", 1);
	run("two\nlines", 0, 9, ["++"], "++", 2);
	configureDelimLookup({ ...DEFAULT_SETTINGS, insertion: MarkdownViewMode.NONE });
	try { run("", 0, 0, ["+", "+"], "++", 2); }
	finally { configureDelimLookup({ ...DEFAULT_SETTINGS }); }
	const deletion = (doc: string, cursor: number, enabled: boolean, expected: string | null, forward = false, head = cursor) => {
		const state = cm.state.constructor.create({ doc, selection: { anchor: cursor, head } });
		const parent = document.createElement("div");
		const editor = new cm.constructor({ state, parent });
		try {
			const handled = deleteExtendedPair(editor, { autoDeleteCustomSpan: enabled }, forward);
			if (handled != (expected !== null) || editor.state.doc.toString() != (expected ?? doc))
				throw Error(`Pair deletion ${JSON.stringify({ doc, cursor, enabled, forward })}: unexpected result`);
			if (handled && editor.state.selection.main.from != cursor - (doc.length - expected!.length) / 2)
				throw Error("Pair deletion left cursor at the wrong position");
			checks++;
		} finally { editor.destroy(); parent.replaceChildren(); }
	};
	for (const delimiter of ["++", "||", "^", "~", "=="]) {
		for (const forward of [false, true]) {
			deletion(delimiter + delimiter, delimiter.length, false, "", forward);
			deletion("a " + delimiter + delimiter + " b", 2 + delimiter.length, false, "a  b", forward);
			deletion(delimiter + "x" + delimiter, delimiter.length + 1, false, null, forward);
			deletion("\\" + delimiter + delimiter, 1 + delimiter.length, false, null, forward);
		}
	}
	deletion("!!!!", 2, DEFAULT_SETTINGS.autoDeleteCustomSpan, null);
	deletion("!!!!", 2, true, "");
	deletion("!!!!", 2, true, "", true);
	deletion("!!x!!", 3, true, null);
	deletion("++++", 1, false, null);
	deletion("~~~~", 2, false, null);
	deletion("++++++", 2, false, null);
	deletion("++++", 1, false, null, false, 3);
	deletion("", 0, false, null);
	configureDelimLookup({ ...DEFAULT_SETTINGS, insertion: MarkdownViewMode.NONE });
	try { deletion("++++", 2, true, null); }
	finally { configureDelimLookup({ ...DEFAULT_SETTINGS }); }

	return checks;
}
