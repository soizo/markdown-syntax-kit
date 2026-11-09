import MarkdownSyntaxKit from "main";

export class StyleSheetHandler {
	private _stylesheet: CSSStyleSheet;
	private _plugin?: MarkdownSyntaxKit;
	private _root: DocumentOrShadowRoot;
	private _subHandlers: StyleSheetHandler[] = [];

	constructor(plugin: MarkdownSyntaxKit | undefined, root: DocumentOrShadowRoot, rootStyleSheet?: CSSStyleSheet) {
		const node = root as Document | ShadowRoot;
		const doc = node.instanceOf(Document) ? node : node.ownerDocument;
		const { CSSStyleSheet } = doc.win as Window & { CSSStyleSheet: typeof window.CSSStyleSheet };
		this._stylesheet = new CSSStyleSheet();
		this._plugin = plugin;
		this._root = root;
		this.injectMain();
		if (rootStyleSheet) {
			this.copy(rootStyleSheet);
		}
	}

	public get rulesLen(): number {
		return this._stylesheet.cssRules.length;
	}

	public injectMain(): void {
		this._root.adoptedStyleSheets = [this._stylesheet, ...this._root.adoptedStyleSheets];
	}

	public ejectMain(): void {
		let initStyleSheets = this._root.adoptedStyleSheets.filter(stylesheet => stylesheet != this._stylesheet);
		this._root.adoptedStyleSheets = initStyleSheets;
		this._subHandlers.forEach(handler => handler.destroy());
		this._subHandlers = [];
	}

	public inject(doc: DocumentOrShadowRoot): void {
		if (doc == this._root || this._subHandlers.find(handler => handler._root == this._root)) { return }
		this._subHandlers.push(new StyleSheetHandler(undefined, doc, this._stylesheet));
	}

	public eject(doc: DocumentOrShadowRoot): void {
		if (doc == this._root) { return }
		this._subHandlers.find((handler, index) => {
			if (handler._root == doc) {
				handler.destroy();
				this._subHandlers.splice(index, 1);
				return true;
			}
		});
	}

	public destroy(): void {
		this.ejectMain();
		(this._root as unknown as undefined) = undefined;
		(this._stylesheet as unknown as undefined) = undefined;
		if (this._plugin) {
			(this._plugin.tagManager.colorsHandler as unknown as undefined) = undefined;
		}
	}

	public insert(ruleStr: string, index = this.rulesLen): number {
		this._subHandlers.forEach(handler => handler.insert(ruleStr, index));
		return this._stylesheet.insertRule(ruleStr, index);
	}

	public replace(ruleStr: string, index: number): void {
		this._stylesheet.deleteRule(index);
		this._stylesheet.insertRule(ruleStr, index);
		this._subHandlers.forEach(handler => handler.replace(ruleStr, index));
	}

	public moveSingleRule(index: number, to: 1 | -1): false | undefined {
		if (to !== 1 && to !== -1) { throw Error("") }
		if (index <= 0 && to < 0 || index >= this.rulesLen - 1 && to > 0) { return false }
		let ruleStr = this._stylesheet.cssRules.item(index)!.cssText;
		this._stylesheet.deleteRule(index);
		this.insert(ruleStr, index + to);
		this._subHandlers.forEach(handler => handler.moveSingleRule(index, to));
	}

	public moveRule(oldIndex: number, newIndex: number): void {
		if (oldIndex == newIndex) return;
		if (newIndex > oldIndex) newIndex--;
		let ruleStr = this._stylesheet.cssRules.item(oldIndex)!.cssText;
		this.removeSingle(oldIndex);
		this.insert(ruleStr, newIndex);
		this._subHandlers.forEach(handler => handler.moveRule(oldIndex, newIndex));
	}

	public removeSingle(index: number): void {
		this._stylesheet.deleteRule(index);
		this._subHandlers.forEach(handler => handler.removeSingle(index));
	}

	public remove(from: number, to: number): void {
		let rulesLen = this.rulesLen;
		for (let i = Math.min(to, rulesLen) - 1; i >= from; i--) {
			this._stylesheet.deleteRule(i);
		}
		this._subHandlers.forEach(handler => handler.remove(from, to));
	}

	public removeAll(): void {
		this._stylesheet.replaceSync("");
		this._subHandlers.forEach(handler => handler.removeAll());
	}

	public copy(stylesheet: CSSStyleSheet): void {
		for (let i = 0; i < stylesheet.cssRules.length; i++) {
			let ruleStr = stylesheet.cssRules.item(i)!.cssText;
			this._stylesheet.insertRule(ruleStr, i);
		}
	}
}