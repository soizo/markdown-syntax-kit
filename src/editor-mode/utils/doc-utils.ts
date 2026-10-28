import { Line, Text, TextLeaf, TextNode } from "@codemirror/state";
import { PlainRange } from "src/types";

// TODO: utilize TextCursor to all functions

type LineAddress = { parent: TextNode | TextLeaf, index: number }[];

function _isTextLeaf(doc: Text): doc is TextLeaf {
	return "text" in doc && doc.text instanceof Array;
}

function _isTextNode(doc: Text): doc is TextNode {
	return doc.children !== null;
}

export class ILine extends Line {
	public readonly from: number;
	public readonly to: number;
	public readonly number: number;
	public readonly text: string;

	constructor(from: number, to: number, number: number, text: string) {
		super();
		this.from = from;
		this.to = to;
		this.number = number;
		this.text = text;
	}
}

export class TextCursor {
	public address: LineAddress;
	public curLine: Line;

	private constructor() {}

	public get doc(): Text {
		return this.address[0].parent;
	}

	public next(): boolean {
		for (let deep = this.address.length - 1; deep >= 0; deep--) {
			let { parent, index } = this.address[deep],
				branches = _isTextLeaf(parent) ? parent.text : parent.children;
			if (index + 1 < branches.length) {
				this.address[deep].index = ++index;
				if (this.address.splice(deep + 1).length) while (_isTextNode(parent)) {
					parent = parent.children[index] as TextNode | TextLeaf;
					index = 0;
					this.address.push({ parent, index });
				}
				if (!_isTextLeaf(parent)) throw TypeError("TextLeaf not found!");
				let length = parent.text[index].length,
					from = this.curLine.to + 1;
				this.curLine = new ILine(
					from,
					from + length,
					this.curLine.number + 1,
					parent.text[index]
				);
				return true;
			}
		}
		return false;
	}

	public prev(): boolean {
		for (let deep = this.address.length - 1; deep >= 0; deep--) {
			if (this.address[deep].index > 0) {
				this.address[deep].index--;
				let { parent, index } = this.address[deep];
				if (this.address.splice(deep + 1).length && _isTextNode(parent)) while (true) {
					let isTextLeaf: boolean;
					parent = (parent as TextNode).children[index] as TextNode | TextLeaf;
					if (_isTextLeaf(parent)) {
						isTextLeaf = true;
						index = parent.text.length - 1;
					} else {
						isTextLeaf = false;
						index = parent.children.length - 1;
					}
					this.address.push({ parent, index });
					if (isTextLeaf) break;
				}
				if (!_isTextLeaf(parent)) throw TypeError("TextLeaf not found!");
				let length = parent.text[index].length,
					to = this.curLine.from - 1;
				this.curLine = new ILine(
					to - length,
					to,
					this.curLine.number - 1,
					parent.text[index]
				);
				return true;
			}
		}
		return false;
	}

	public goto(offset: number): TextCursor {
		if (offset < this.curLine.from) while (offset < this.curLine.from && this.prev());
		else if (offset > this.curLine.to) while (offset > this.curLine.to && this.next());
		return this;
	}

	public gotoLine(linePos: number): TextCursor {
		if (linePos < this.curLine.number) while (this.curLine.number != linePos && this.prev());
		else if (linePos > this.curLine.number) while (this.curLine.number != linePos && this.next());
		return this;
	}

	public gotoLast(): TextCursor {
		this.address.splice(1);
		let { parent, index } = this.address[0],
			root = parent;
		while (_isTextNode(parent)) {
			index = parent.children.length - 1;
			if (root !== parent) this.address.push({ parent, index });
			else this.address[0].index = index;
			parent = parent.children[index] as TextNode | TextLeaf;
		}
		index = parent.text.length - 1;
		if (root !== parent) this.address[0].index = index;
		else this.address.push({ parent, index });
		let lineStr = parent.text[index];
		this.curLine = {
			from: root.length - lineStr.length,
			to: root.length,
			text: lineStr,
			number: root.lines,
			length: lineStr.length
		};
		return this;
	}

	// Peeking at a boundary line must restore the cursor too.
	public getPrevLine(): Line | null {
		if (!this.prev()) return null;
		let prevLine = this.curLine;
		this.next();
		return prevLine;
	}

	public getNextLine(): Line | null {
		if (!this.next()) return null;
		let nextLine = this.curLine;
		this.prev();
		return nextLine;
	}

	public static atOffset(doc: Text, offset: number): TextCursor {
		let { address, line: curLine } = getLineAddressAt(doc, offset),
			cursor = new TextCursor();
		cursor.address = address;
		cursor.curLine = curLine;
		return cursor;
	}
}

export function getNextLine(doc: Text, offsetOrLine: number | Line): Line | null {
	let line = offsetOrLine instanceof Line ? offsetOrLine : doc.lineAt(offsetOrLine);
	if (line.number >= doc.lines) { return null }
	return doc.line(line.number + 1);
}

export function getBlockEndAt(doc: Text, offsetOrLine: number | Line, blankLineAsEnd = true): Line {
	let line = offsetOrLine instanceof Line ? offsetOrLine : doc.lineAt(offsetOrLine);
	while (line.number < doc.lines) {
		line = doc.line(line.number + 1);
		if (isBlankLine(line)) {
			if (!blankLineAsEnd) { line = doc.line(line.number - 1) }
			break;
		}
	}
	return line;
}

export function getBlocks(doc: Text, range: PlainRange, lookBehind = false, lookAhead = false): { start: number, end: number }[] {
	let blocks: { start: number, end: number }[] = [],
		line = doc.lineAt(range.from),
		initLine = line,
		curBlock: { start: number, end: number } | undefined;
	if (!isBlankLine(line) && lookBehind) {
		let blockStart = getBlockStartAt(doc, line);
		curBlock = { start: blockStart.number, end: line.number + 1 };
		blocks.push(curBlock);
	}
	for (; range.to >= line.from; line = doc.line(line.number + 1)) {
		if (isBlankLine(line)) { curBlock = undefined }
		else if (curBlock) { curBlock.end++ }
		else {
			curBlock = { start: line.number, end: line.number + 1 };
			blocks.push(curBlock);
		}
		if (line.number >= doc.lines) { break }
	}
	if (curBlock && lookAhead) {
		curBlock.end = getBlockEndAt(doc, line, false).number + 1;
	}
	if (!blocks.length) {
		blocks.push({ start: initLine.number, end: initLine.number + 1 });
	}
	return blocks;
}

export function getBlockStartAt(doc: Text, offsetOrLine: number | Line): Line {
	let curLine = offsetOrLine instanceof Line ? offsetOrLine : doc.lineAt(offsetOrLine),
		prevLine = curLine.number > 1 ? doc.line(curLine.number - 1) : null;
	if (isBlankLine(curLine)) { return curLine }
	while (prevLine) {
		if (isBlankLine(prevLine)) { break }
		curLine = prevLine;
		prevLine = curLine.number > 1 ? doc.line(curLine.number - 1) : null;
	}
	return curLine;
}

export function getPrevLine(doc: Text, offsetOrLineNum: number | Line): Line | null {
	let lineNum: number;
	if (offsetOrLineNum instanceof Line) {
		lineNum = offsetOrLineNum.number;
	} else {
		lineNum = doc.lineAt(offsetOrLineNum).number;
	}
	if (lineNum <= 1) { return null }
	return doc.line(lineNum - 1);
}

export function isBlankLine(line: Line): boolean {
	return !line.text.trimEnd();
}

export function isBlockEnd(doc: Text, line: Line): boolean {
	let nextLine = getNextLine(doc, line);
	return !nextLine || isBlankLine(nextLine);
}

export function isBlockStart(doc: Text, line: Line): boolean {
	let prevLine = getPrevLine(doc, line);
	return !prevLine || isBlankLine(prevLine);
}

export function sliceStrFromLine(line: Line, from: number, to: number): string {
	from -= line.from;
	to -= line.from;
	return line.text.slice(from, to);
}

export function getLineAddressAt(doc: Text, offset: number): { address: LineAddress, line: Line } {
	let parent = doc,
		address: LineAddress = [],
		lineNum = 0,
		lineStr = "",
		passedLen = 0;

	if (offset < 0 || offset > parent.length) throw RangeError();

	while (_isTextNode(parent)) {
		let branches = parent.children;
		for (let i = 0; i < branches.length; i++) {
			let curBranch = branches[i];
			if (offset >= passedLen && offset <= passedLen + curBranch.length) {
				address.push({ parent, index: i });
				parent = curBranch;
				break;
			}
			passedLen += curBranch.length + 1;
			lineNum += curBranch.lines;
		}
	}

	if (!_isTextLeaf(parent)) throw TypeError();

	for (let i = 0; i < parent.text.length; i++) {
		let curLineStr = parent.text[i];
		lineNum++;
		if (offset >= passedLen && offset <= passedLen + curLineStr.length) {
			address.push({ parent, index: i });
			lineStr = curLineStr;
			break;
		}
		passedLen += curLineStr.length + 1;
	}

	let line = new ILine(
		passedLen,
		passedLen + lineStr.length,
		lineNum,
		lineStr
	);
	return { address, line };
}