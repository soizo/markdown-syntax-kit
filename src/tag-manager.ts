import MarkdownSyntaxKit from "main";
import { ColorConfig, TagConfig, TagSupportFormat } from "src/types";
import { Format } from "src/enums";
import { DEFAULT_SETTINGS } from "src/settings/configs";
import { StyleSheetHandler } from "src/stylesheet";
import { buildColorsStyleSheet, convertColorConfigToCSSRule } from "src/utils/color-utils";
import { debounce } from "obsidian";

type TagHandlerRecord<T extends TagConfig = TagConfig> =
	& Record<"move", ((config: T, oldIndex: number, newIndex: number) => unknown)[]>
	& Record<"add", ((config: T, index: number) => unknown)[]>
	& Record<"remove", ((config: T, index: number) => unknown)[]>
	& Record<"reset", ((newConfigs: T[]) => unknown)[]>;

type ColorTagHandlerRecord = TagHandlerRecord<ColorConfig>;

export class TagManager {
	private readonly _plugin: MarkdownSyntaxKit;
	private readonly _defaultConfigs = {
		get [Format.HIGHLIGHT]() { return DEFAULT_SETTINGS.colorConfigs },
		get [Format.CUSTOM_SPAN]() { return DEFAULT_SETTINGS.predefinedSpanTag },
		get [Format.FENCED_DIV]() { return DEFAULT_SETTINGS.predefinedDivTag }
	} as const;
	private _handlers = {
		[Format.HIGHLIGHT]: { move: [], add: [], remove: [], reset: [] } as TagHandlerRecord,
		[Format.CUSTOM_SPAN]: { move: [], add: [], remove: [], reset: [] } as TagHandlerRecord,
		[Format.FENCED_DIV]: { move: [], add: [], remove: [], reset: [] } as ColorTagHandlerRecord
	}
	
	public readonly colorsHandler: StyleSheetHandler;
	public readonly configsMap: Record<Format.CUSTOM_SPAN | Format.FENCED_DIV, TagConfig[]> & Record<Format.HIGHLIGHT, ColorConfig[]>;

	constructor(plugin: MarkdownSyntaxKit) {
		let { settings } = plugin;
		this._plugin = plugin;
		this.configsMap = {
			[Format.HIGHLIGHT]: settings.colorConfigs,
			[Format.CUSTOM_SPAN]: settings.predefinedSpanTag,
			[Format.FENCED_DIV]: settings.predefinedDivTag
		}
		this.colorsHandler = buildColorsStyleSheet(plugin);

		this.registerHandler(Format.HIGHLIGHT, "move", (_, oldIndex, newIndex) => {
			this.colorsHandler.moveRule(oldIndex, newIndex);
		});

		this.registerHandler(Format.HIGHLIGHT, "add", (config: ColorConfig) => {
			let rule = convertColorConfigToCSSRule(config);
			this.colorsHandler.insert(rule);
		});

		this.registerHandler(Format.HIGHLIGHT, "remove", (_, index) => {
			this.colorsHandler.removeSingle(index);
		});

		this.registerHandler(Format.HIGHLIGHT, "reset", (defaultConfigs: ColorConfig[]) => {
			this.colorsHandler.removeAll();
			defaultConfigs.forEach(config => {
				let rule = convertColorConfigToCSSRule(config);
				this.colorsHandler.insert(rule);
			});
		});
	}

	public reset(format: TagSupportFormat): void {
		let defaultConfigs = this._defaultConfigs[format];
		this.configsMap[format].splice(0);
		(this.configsMap[format] as Array<TagConfig>).push(...defaultConfigs);
		this._fireHandlers(format, "reset", this.configsMap[format]);
	}
	
	public move(format: TagSupportFormat, oldIndex: number, newIndex: number): void {
		if (newIndex == oldIndex) return;
		let configs = this.configsMap[format],
			movedConfig = configs.splice(oldIndex, 1)[0];
		configs.splice(newIndex, 0, movedConfig);
		this._fireHandlers(format, "move", movedConfig, oldIndex, newIndex);
	}

	public remove(format: TagSupportFormat, index: number) {
		let configs = this.configsMap[format];
		this._fireHandlers(format, "remove", configs.splice(index, 1)[0], index);
	}

	public add<T extends TagSupportFormat>(format: T, config?: T extends Format.HIGHLIGHT ? ColorConfig : TagConfig) {
		let configs = this.configsMap[format] as Array<TagConfig>,
			newLength = configs.length + 1;

		if (!config) {
			let isHighlight = format == Format.HIGHLIGHT;
			config = {
				name: `${isHighlight ? "Color" : "Tag"} ${newLength}`,
				tag: `${isHighlight ? "color" : "tag"}-${newLength}`,
				showInMenu: true
			} as TagConfig & ColorConfig;
			if (isHighlight) (config as ColorConfig).color = "#ffd000";
		}

		configs.push(config);
		this._fireHandlers(format, "add", config, configs.length - 1);
	}

	public registerHandler<T extends TagConfig, K extends keyof TagHandlerRecord<T>>(
		format: TagSupportFormat,
		on: K,
		handler: TagHandlerRecord<T>[K][number]
	): void {
		// @ts-ignore
		this._handlers[format][on].push(handler);
	}

	private _fireHandlers<T extends TagConfig, K extends keyof TagHandlerRecord<T>>(
		format: TagSupportFormat,
		on: K,
		...args: Parameters<TagHandlerRecord<T>[K][number]>
	) {
		this._handlers[format][on].forEach(handler => {
			let arg0 = args[0] as T & T[],
				arg1 = args[1],
				arg2 = args[2];
			(handler as (arg0: T & T[], arg1?: number, arg2?: number) => unknown)(arg0, arg1, arg2);
		});
		this._requestSave();
	}

	private _requestSave = debounce(() => { void this._plugin.saveSettings(); }, 200);
}