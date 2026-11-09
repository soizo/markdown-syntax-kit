import { SyntaxNode, Tree } from "@lezer/common";
import { SEMANTIC_INTERFERER_RE, SHIFTER_RE, ShifterNodeConfigs, SKIPPED_NODE_RE } from "src/editor-mode/preprocessor/parser-configs";
import { LineCtx } from "src/enums";

interface NodeSpec {
	node: SyntaxNode,
	type: string
}

export function disableEscape(): void {
	SKIPPED_NODE_RE.compile("table|code|formatting|html|math|tag|url|barelink|atom|comment|string|meta|frontmatter|hr(?!\\w)");
}

export function reenableEscape(): void {
	SKIPPED_NODE_RE.compile("table|code|formatting|escape|html|math|tag|url|barelink|atom|comment|string|meta|frontmatter|hr(?!\\w)");
}

export function findNode(tree: Tree, from: number, to: number, matcher: (node: SyntaxNode) => boolean): SyntaxNode | null {
	let node: SyntaxNode | null = null;
	tree.iterate({
		from, to, enter(nodeRef) {
			if (matcher(nodeRef.node)) {
				node = nodeRef.node;
				return false;
			}
		}
	});
	return node;
}

export function findShifterAt(tree: Tree, offset: number): NodeSpec | null {
	let node: SyntaxNode | null = null,
		type: string | null = null;
	tree.iterate({
		from: offset, to: offset,
		enter(nodeRef) {
			if (nodeRef.name == "Document") { return }
			let match = SHIFTER_RE.exec(nodeRef.name);
			if (match) {
				node = nodeRef.node;
				type = match[0] == "internal-link" ? "link" : match[0];
				return false;
			}
		},
	});
	if (node && type) return { node, type };
	return null;
}

export function getContextFromNode(node: SyntaxNode): LineCtx {
	let nodeName = node.name,
		context = LineCtx.NONE;
	if (node.name == "Document") { return context }
	if (!node.name.startsWith("HyperMD")) {
		if (node.parent!.name == "Document") { return context }
		node = node.parent!;
	}
	// 8 is the length of "HyperMD-" string
	if (nodeName.startsWith("hr", 8)) {
		context = LineCtx.HR_LINE;
	} else if (nodeName.startsWith("header", 8)) {
		context = LineCtx.HEADING;
	} else if (nodeName.startsWith("quote", 8)) {
		context = LineCtx.BLOCKQUOTE;
	} else if (nodeName.startsWith("codeblock", 8)) {
		context = LineCtx.CODEBLOCK;
	} else if (nodeName.startsWith("list", 8)) {
		if (nodeName.includes("nobullet")) {
			context = LineCtx.LIST;
		} else {
			context = LineCtx.LIST_HEAD;
		}
	} else if (nodeName.startsWith("footnote", 8)) {
		if (node.firstChild?.name.includes("footnote")) {
			context = LineCtx.FOOTNOTE_HEAD;
		} else {
			context = LineCtx.FOOTNOTE;
		}
	} else if (nodeName.startsWith("table", 8)) {
		if (nodeName.includes("table-row-1")) {
			context = LineCtx.TABLE_DELIM;
		} else {
			context = LineCtx.TABLE;
		}
	}
	return context;
}

export function getShifterStart(spec: NodeSpec): number | null {
	let node: SyntaxNode | null = spec.node,
		type = spec.type;
	if (node = ShifterNodeConfigs[type]?.getOpen(node)) {
		return node.from;
	}
	return null;
}

export function hasInterferer(tree: Tree, from: number, to: number): boolean {
	let matcher = (node: SyntaxNode) => {
		let match = SEMANTIC_INTERFERER_RE.exec(node.name);
		if (match) {
			if (
				(match[0] == "math-begin" || match[0] == "math-end") &&
				node.to - node.from < 2
			) { return false }
			return true;
		}
		return false;
	};
	return !!findNode(tree, from, to, matcher);
}