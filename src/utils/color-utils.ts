import MarkdownSyntaxKit from "main";
import { StyleSheetHandler } from "src/stylesheet";
import { ColorConfig } from "src/types";

export const PREDEFINED_COLOR_TAGS = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"] as const;

export function getDefaultColorConfigs() {
	let configs: ColorConfig[] = [];
	for (let i = 0; i < PREDEFINED_COLOR_TAGS.length; i++) {
		let tag = PREDEFINED_COLOR_TAGS[i],
			name = tag[0].toUpperCase() + tag.slice(1),
			color = takeBuiltinColor(tag) ?? "#ffffff";
		configs.push({ tag, name, color, showInMenu: true });
	}
	return configs;
}

export function convertColorConfigToCSSRule(config: ColorConfig) {
	let selector = `.cm-custom-highlight-${config.tag}, .markdown-rendered mark.custom-highlight-${config.tag}, .msk-menu-item.msk-highlight-${config.tag}>.menu-item-title`,
		prop = "background-color",
		color = config.color;
	return `${selector}{${prop}:color(from ${color} srgb r g b/var(--hl-opacity));}`
}

export function createColorConfig(tag: string, color: string, name: string, showInMenu = true): ColorConfig {
	return { tag, color, name, showInMenu }
}


export function takeBuiltinColor(color: string) {
	return document.body.computedStyleMap().get(`--color-${color}`)?.toString();
}

export function buildColorsStyleSheet(plugin: MarkdownSyntaxKit): StyleSheetHandler {
	let colorsHandler = new StyleSheetHandler(plugin),
		configs = plugin.settings.colorConfigs;
	for (let i = 0; i < configs.length; i++) {
		let ruleStr = convertColorConfigToCSSRule(configs[i]);
		colorsHandler.insert(ruleStr);
	}
	return colorsHandler;
}