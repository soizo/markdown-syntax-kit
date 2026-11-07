import { ReadingModeSyntaxExtender } from "src/preview-mode/post-processor/core";
import { configureDelimLookup } from "src/format-configs/format-utils";
import { DEFAULT_SETTINGS } from "src/settings/configs";
import { syntaxFixtures, editorFixtures, fencedDivSample, type SyntaxFixture } from "./syntax-fixtures";
import { EditorParser } from "src/editor-mode/preprocessor/parser";
import { ChangeSet, Text } from "@codemirror/state";
import { TokenStatus } from "src/enums";
import { checkSpoilerStyles } from "./spoiler-styles";
import { checkFencedDivs } from "./fenced-div";
import { checkAutoPairs } from "./auto-pairs";
import type { MarkdownView, WorkspaceLeaf } from "obsidian";

/** Run only against detached fixture DOM. Never edit a vault or install a plugin. */
export function run(styles: string) {
	// This private seam is test-only: use Obsidian's actual Markdown parser but
	// supply our own receiver and source, not the open note's text or renderer.
	const views: MarkdownView[] = app.workspace.getLeavesOfType("markdown")
		.map((leaf: WorkspaceLeaf) => leaf.view as MarkdownView);
	const view = views.find(view => view.editor?.cm && typeof view.previewMode?.renderer?.parseSync == "function");
	const renderer = view?.previewMode?.renderer;
	if (!view || typeof renderer?.parseSync != "function")
		throw Error("Open a Markdown note in Obsidian before running this smoke test.");
	const settings = { ...DEFAULT_SETTINGS };
	configureDelimLookup(settings);
	const extender = new ReadingModeSyntaxExtender(settings);
	const fixtures: SyntaxFixture[] = [
		...syntaxFixtures,
		// Multi-paragraph blocks need Obsidian's real section boundaries.
		{ source: fencedDivSample, selector: ".fenced-div.r1", count: 3 },
		{ source: String.raw`\^w\^`, selector: "sup", count: 0 },
		{ source: String.raw`\^w\^ ^yes^`, selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`\~w\~ ~yes~`, selector: "sub", count: 1, content: "yes" },
		{ source: String.raw`\++w\++ ++yes++`, selector: "ins", count: 1, content: "yes" },
		{ source: String.raw`\||w\|| ||yes||`, selector: ".spoiler", count: 1, content: "yes" },
		{ source: String.raw`\!!w\!! !!yes!!`, selector: ".custom-span", count: 1, content: "yes" },
		{ source: String.raw`\\^w^`, selector: "sup", count: 1, content: "w" },
		{ source: String.raw`\\\^w\^`, selector: "sup", count: 0 },
		{ source: String.raw`^a\^b^`, selector: "sup", count: 1, content: "a^b" },
		{ source: String.raw`\+++w++`, selector: "ins", count: 1, content: "w" },
		{ source: String.raw`+\+w++`, selector: "ins", count: 0 },
		{ source: String.raw`[[note|label]] \^w\^ ^yes^`, selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`[[first]] \^w\^ ^yes^ [[last]]`, selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`[first](https://example.com/first) \^w\^ ^yes^ [last](https://example.com/last)`, selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`<code>\^code\^</code > <img src="image.png"> \^w\^ ^yes^`, selector: "sup", count: 1, content: "yes" },
		{ source: "> [!note]\n> \\^w\\^ ^yes^", selector: "sup", count: 1, content: "yes" },
		{ source: "> [!note] Title\n> \\^w\\^ ^yes^", selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`==highlight== \^w\^ ^yes^`, selector: "sup", count: 1, content: "yes" },
		{ source: String.raw`!!{my-class}^a\^b^!!`, selector: ".custom-span.my-class sup", count: 1, content: "a^b" },
		{ source: "| A | B |\n| --- | --- |\n| \\^w\\^ | ^yes^ |", selector: "sup", count: 1, content: "yes" },
		{ source: "| A | B |\n| --- | --- |\n| \\|\\|w\\|\\| | yes |", selector: ".spoiler", count: 0 },
		{ source: "- \\^w\\^\n- ^yes^", selector: "sup", count: 1, content: "yes" },
		{ source: "😀 \\^w\\^ ^yes^", selector: "sup", count: 1, content: "yes" },
	];
	const render = (source: string): HTMLElement => {
		let sections: { html: string, pos: { start: { line: number }, end: { line: number } } }[] = [];
		renderer.parseSync.call({
			text: source,
			parseFinish: (_: string, parsed: { sections: typeof sections }) => { sections = parsed.sections; }
		});
		const root = document.createElement("div");
		for (const section of sections) {
			const el = document.createElement("div");
			const parsed = new DOMParser().parseFromString(section.html, "text/html");
			el.append(...Array.from(parsed.body.childNodes));
			extender.postProcess(el, {
				containerEl: root,
				getSectionInfo: () => ({ text: source, lineStart: section.pos.start.line, lineEnd: section.pos.end.line }),
			} as never);
			root.append(el);
		}
		return root;
	};
	const checks = fixtures.map(({ source, selector, count, content, text }) => {
		const root = render(source);
		if (source == String.raw`\^w\^` && root.textContent != "^w^")
			throw Error(`Issue #27 must render exactly as plain ^w^, got ${root.textContent}`);
		if (root.querySelector("span:not([class])"))
			throw Error("Escape protection left a temporary span behind.");
		const matches = root.querySelectorAll(selector);
		if (matches.length != count || content !== undefined && matches[0]?.textContent?.trim() != content ||
			text !== undefined && root.textContent?.trim() != text)
			throw Error(`Fixture ${JSON.stringify(source)}: expected ${count} ${selector} (${content ?? text ?? ""}), got ${root.innerHTML}`);
		return source;
	});
	const cm = view.editor.cm;
	const context = cm?.state.values.find(value => value?.context?.parser)?.context;
	if (!context) throw Error("Open a Markdown editor before running native editor checks.");
	const parseNative = (source: string) => {
		// New native state/context, not a transaction on any open note.
		const state = cm.state.constructor.create({ doc: source });
		const normalized = state.doc.toString();
		const isolated = context.constructor.create(context.parser, state, { from: 0, to: normalized.length });
		const tree = isolated.withContext(() => context.parser.parse(normalized));
		return { state, tree };
	};
	const parseEditor = (source: string) => {
		const { state, tree } = parseNative(source);
		const parser = new EditorParser(settings);
		parser.initParse(Text.of(state.doc.toString().split("\n")), tree);
		return { state, tree, parser };
	};
	for (const { source, format, count, validTag } of editorFixtures) {
		const { parser } = parseEditor(source);
		const tokens = [...parser.inlineTokens, ...parser.blockTokens]
			.filter(token => token.type == format && token.status == TokenStatus.ACTIVE);
		if (tokens.length != count || validTag !== undefined && tokens.some(token => token.validTag != validTag))
			throw Error(`Editor fixture ${JSON.stringify(source)}: expected ${count} active tokens, got ${JSON.stringify(tokens)}`);
	}
	// Looking behind line 2 must restore the cursor after visiting line 1.
	// Otherwise the same subscript is parsed twice on each incremental edit.
	let subscriptChecks = 0;
	for (const initial of ["~x~", "before\n\n- ~元~\n\nafter", "~x~ tail"]) {
		for (let from = 0; from <= initial.length; from++) {
			for (const insert of ["", "a", "\n", "~", " "]) {
				const parsed = parseEditor(initial), doc = Text.of(initial.split("\n"));
				const changes = ChangeSet.of({ from, to: Math.min(from + 1, doc.length), insert }, doc.length);
				const next = changes.apply(doc);
				parsed.parser.storeChanges(changes);
				parsed.parser.applyChange(next, parseNative(next.toString()).tree);
				const expected = parseEditor(next.toString()).parser.inlineTokens;
				if (JSON.stringify(parsed.parser.inlineTokens) != JSON.stringify(expected))
					throw Error(`Subscript edit ${JSON.stringify(initial)} at ${from} with ${JSON.stringify(insert)}: incremental tokens differ from a fresh parse`);
				if (initial.includes("元") && from == 7 && insert == "") {
					const factory = cm.docView.decorations.map(set => set.iter().value).find(Boolean)?.constructor;
					if (!factory?.mark) throw Error("Native decoration factory unavailable");
					const marks = parsed.parser.inlineTokens.filter(t => t.status == TokenStatus.ACTIVE)
						.map(t => factory.mark({ class: "cm-sub" }).range(t.from, t.to));
					const state = cm.state.constructor.create({ doc: next.toString(), extensions: [
						cm.constructor.outerDecorations.of(factory.set(marks, true)),
					] });
					const parent = document.createElement("div");
					const editor = new cm.constructor({ state, parent });
					try {
						if (editor.contentDOM.querySelectorAll(".cm-sub").length != 1 ||
							editor.contentDOM.querySelector(".cm-sub .cm-sub"))
							throw Error("Subscript edit produced nested cm-sub decorations");
					} finally { editor.destroy(); parent.replaceChildren(); }
				}
				subscriptChecks++;
			}
		}
	}
	const sharedCursorChecks = ["++x++", "||x||", "^x^", "~x~", "!!{my-class}x!!", "=={red}x==", "::: my-class\nbody"].map(syntax => {
		const initial = `before\n\n${syntax}\n\nafter`;
		const parsed = parseEditor(initial), doc = Text.of(initial.split("\n"));
		const changes = ChangeSet.of({ from: 7, to: 8 }, doc.length);
		const next = changes.apply(doc);
		parsed.parser.storeChanges(changes);
		parsed.parser.applyChange(next, parseNative(next.toString()).tree);
		const fresh = parseEditor(next.toString()).parser;
		const counts = (parser: EditorParser) => ({
			inline: parser.inlineTokens.filter(t => t.status == TokenStatus.ACTIVE).length,
			block: parser.blockTokens.filter(t => t.status == TokenStatus.ACTIVE).length,
		});
		return { syntax, actual: counts(parsed.parser), expected: counts(fresh) };
	});
	if (sharedCursorChecks.some(check => JSON.stringify(check.actual) != JSON.stringify(check.expected)))
		throw Error(`Shared cursor regression: ${JSON.stringify(sharedCursorChecks)}`);
	// Regression for #20: editing after more than 512 custom styles must not
	// throw while resolving the token index.
	const manyStyles = Array.from({ length: 513 }, () => "^w^").join(" ");
	const manyStylesParser = parseEditor(`${manyStyles}\n`).parser;
	const editedSource = `${manyStyles} x\n`;
	const { tree: editedTree } = parseNative(editedSource);
	manyStylesParser.applyChange(Text.of(editedSource.split("\n")), editedTree);
	if (manyStylesParser.inlineTokens.length != 513)
		throw Error(`Editor regression #20: expected 513 tokens after edit, got ${manyStylesParser.inlineTokens.length}`);
	return { passed: true, checks: checks.length, editorChecks: editorFixtures.length + 1, subscriptChecks, sharedCursorChecks,
		autoPairChecks: checkAutoPairs(cm), spoilerChecks: checkSpoilerStyles(styles, render), fencedDivChecks: checkFencedDivs(cm, parseEditor) };
}
