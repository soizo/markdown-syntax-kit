import MarkdownSyntaxKit from "main";
import { IconName, Menu, Editor, MarkdownFileInfo, MarkdownView, Platform } from "obsidian";
import { Direction, EditorView } from "@codemirror/view";
import { IndexCache, TagConfig, InlineFormat } from "src/types";
import { Format, TokenLevel, TokenStatus } from "src/enums";
import { getActiveCanvasNodeCoords } from "src/editor-mode/utils/canvas-utils";
import { Formatter } from "src/editor-mode/formatting/formatter";
import { supportTag } from "src/format-configs/format-utils";
import { tagMenuOptionCaches, instancesStore } from "src/editor-mode/cm-extensions";
import { ctxMenuCommands } from "src/editor-mode/formatting/commands";

export function extendEditorCtxMenu(menu: Menu, editor: Editor, ctx: MarkdownFileInfo | MarkdownView) {
	menu.addItem(item => {
		let subMenu = item.setSubmenu(),
			cmView = editor.activeCm || editor.cm,
			activeFormats: Partial<Record<InlineFormat, boolean>> = {},
			commands = ctxMenuCommands;
		subMenu.onload = function () {
			if (Platform.isMobile) { return }
			subMenu.registerDomEvent(subMenu.dom, "mouseover", () => {
				if (subMenu.currentSubmenu && subMenu.currentSubmenu !== subMenu.items[subMenu.selected]?.submenu) {
					subMenu.closeSubmenu();
					// @ts-ignore
					subMenu.openSubmenuSoon(subMenu.items[subMenu.selected]);
				}
			});
		};
		if (!(cmView instanceof EditorView)) {
			throw ReferenceError("EditorView not found");
		}
		let selectionObserver = cmView.state.facet(instancesStore).observer;
		selectionObserver.iterateSelectedRegion(TokenLevel.INLINE, true, (token , _, __, pos) => {
			let type = token.type as InlineFormat;
			if (token.status != TokenStatus.ACTIVE || activeFormats[type]) { return }
			if (pos == "covered" || pos == "covering") {
				activeFormats[type] = true;
			}
		});
		subMenu.addSections(["selection-extended-inline", "selection-extended-block"]);
		item.setTitle("More format...");
		item.setIcon("paintbrush-vertical");
		item.setSection("selection");
		for (let i = 0; i < commands.length; i++) {
			subMenu.addItem(item => {
				let type = commands[i].type as InlineFormat;
				item.setTitle(commands[i].ctxMenuTitle);
				item.setIcon(commands[i].icon);
				item.setSection("selection-extended-inline");
				if (activeFormats[type]) {
					item.setChecked(true);
				}
				if (type == Format.HIGHLIGHT || type == Format.CUSTOM_SPAN) {
					let tagSubMenu = item.setSubmenu();
					TagMenu.bindMenu(tagSubMenu, cmView, type);
				}
				item.onClick(() => {
					commands[i].editorCallback(editor, ctx);
					menu.close();
				});
			});
		}
	});
}

export class TagMenu extends Menu {
	mainPlugin: MarkdownSyntaxKit;
	itemIndexCache: IndexCache = { number: 0 };
	view: EditorView;
	type: Format;
	formatter: Formatter;
	CLS_PREFIX = "msk-menu-item";
	ICON: string;
	constructor(view: EditorView, type: Format) {
		super();
		this.constructMenu(view, type);
	}
	constructMenu(view: EditorView, type: Format) {
		let internalInstances = view.state.facet(instancesStore);
		this.view = view;
		this.type = type;
		this.formatter = internalInstances.formatter;
		this.mainPlugin = internalInstances.mainPlugin;
		this.bindIndexCache();
		this.setClassPrefix();
		this.setIcon();
		this.addConfigs(this.getConfigs());
		this.addDefaultItem();
		this.addRemoveItem();
		this.dom.addClass("msk-menu", "msk-tag-menu");
		if (type == Format.HIGHLIGHT) {
			this.dom.addClass("msk-color-menu");
		}
	}
	setClassPrefix() {
		if (this.type == Format.HIGHLIGHT) {
			this.CLS_PREFIX += " msk-highlight-";
		} else if (this.type == Format.CUSTOM_SPAN) {
			this.CLS_PREFIX += " msk-span-";
		} else if (this.type == Format.FENCED_DIV) {
			this.CLS_PREFIX += " msk-div-";
		}
	}
	setIcon() {
		if (this.type == Format.HIGHLIGHT) {
			this.ICON = "palette";
		} else {
			this.ICON = "shapes";
		}
	}
	bindIndexCache() {
		let lastOption = this.view.state.facet(tagMenuOptionCaches);
		switch (this.type) {
			case Format.HIGHLIGHT:
				this.itemIndexCache = lastOption.colorMenuItem;
				break;
			case Format.CUSTOM_SPAN:
				this.itemIndexCache = lastOption.spanTagMenuItem;
				break;
			case Format.FENCED_DIV:
				this.itemIndexCache = lastOption.divTagMenuItem;
				break;
			default:
				this.itemIndexCache = { number: 0 };
		}
	}
	getConfigs() {
		let configs: TagConfig[] = [],
			{ settings } = this.mainPlugin;
		if (this.type == Format.HIGHLIGHT) {
			configs = settings.colorConfigs;
		} else if (this.type == Format.CUSTOM_SPAN) {
			configs = settings.predefinedSpanTag;
		} else if (this.type == Format.FENCED_DIV) {
			configs = settings.predefinedDivTag;
		}
		return configs;
	}
	addConfigs(configs: TagConfig[]) {
		let { settings } = this.mainPlugin;
		configs.forEach(({ name, tag, showInMenu }) => {
			if (!showInMenu) { return }
			this.addConfigItem(name, this.ICON, this.CLS_PREFIX + tag, () => { this.format(tag) });
		});
		if (this.type == Format.HIGHLIGHT && settings.showAccentColor) {
			this.addConfigItem("Accent", this.ICON, this.CLS_PREFIX + "accent", () => { this.format("accent") });
		}
	}
	addConfigItem(name: string, icon: IconName, cls: string, callback: (evt: MouseEvent | KeyboardEvent) => unknown) {
		this.addItem(item => {
			item.setTitle(name);
			item.setIcon(icon);
			item.dom.addClass(...cls.split(" "));
			item.onClick(evt => {
				let index = this.items.findIndex(i => i == item);
				this.itemIndexCache.number = index;
				callback(evt);
			});
		});
	}
	addDefaultItem() {
		let { settings } = this.mainPlugin;
		if (
			this.type == Format.HIGHLIGHT && settings.showDefaultColor ||
			this.type == Format.CUSTOM_SPAN && settings.showDefaultSpanTag
		) {
			this.addConfigItem("Default", this.ICON, this.CLS_PREFIX + "default", () => { this.format("") });
		}
	}
	addRemoveItem() {
		let { settings } = this.mainPlugin;
		if (
			this.type == Format.HIGHLIGHT && settings.showRemoveColor ||
			this.type == Format.CUSTOM_SPAN && settings.showRemoveSpanTag
		) {
			this.addConfigItem("Remove", "eraser", "msk-menu-item msk-remove", () => { this.removeFormatting() });
		}
	}
	format(tag: string) {
		this.formatter.startFormat(this.view, this.type, tag);
	}
	removeFormatting() {
		this.formatter.startFormat(this.view, this.type, undefined, true);
	}
	showMenu() {
		this.checkItemIndexCache();
		this.view.requestMeasure({
			read: (view) => {
				let app = this.mainPlugin.app,
					canvasNodeCoords = getActiveCanvasNodeCoords(app),
					charOffset = view.state.selection.ranges.at(-1)!.to,
					charCoords = view.coordsForChar(charOffset);
				if (!charCoords) {
					let contentDOMCoords = view.contentDOM.getBoundingClientRect(),
						firstBlock = view.lineBlockAt(charOffset),
						isRTL = view.textDirection == Direction.RTL;
					charCoords = {
						top: contentDOMCoords.top,
						bottom: contentDOMCoords.top + firstBlock.height,
						left: isRTL ? contentDOMCoords.right : contentDOMCoords.left,
						right: isRTL ? contentDOMCoords.left : contentDOMCoords.right
					};
				}
				return { charCoords, canvasNodeCoords };
			},
			write: (measure) => {
				let { charCoords, canvasNodeCoords } = measure;
				if (charCoords) {
					let menuCoords = { x: charCoords.left, y: charCoords.bottom };
					if (canvasNodeCoords) {
						menuCoords.x += canvasNodeCoords.x;
						menuCoords.y += canvasNodeCoords.y;
					}
					this.showAtPosition(menuCoords);
					this.select(this.itemIndexCache.number);
				}
			}
		});
	}
	checkItemIndexCache() {
		if (this.itemIndexCache.number >= this.items.length) {
			this.itemIndexCache.number = this.items.length - 1;
		}
	}
	static bindMenu(other: Menu, ...args: ConstructorParameters<typeof TagMenu>) {
		let methodNames = ["addConfigItem", "addConfigs", "bindIndexCache", "checkItemIndexCache", "constructMenu", "format", "removeFormatting", "showMenu", "setClassPrefix", "setIcon", "addDefaultItem", "addRemoveItem", "getConfigs"] as const;
		for (let methodName of methodNames) {
			Object.defineProperty(other, methodName, {
				value: this.prototype[methodName].bind(other)
			});
		}
		Object.defineProperty(other, "CLS_PREFIX", {
			value: "msk-menu-item",
			configurable: true,
			writable: true
		});
		const boundMenu = other as TagMenu;
		boundMenu.constructMenu(...args);
		return boundMenu;
	}
	static create(...args: ConstructorParameters<typeof TagMenu>) {
		let [view, type] = args;
		if (!supportTag(type)) { throw new TypeError("This format type doesn't support custom tag.") }
		return new this(view, type);
	}
}