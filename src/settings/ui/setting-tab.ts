import MarkdownSyntaxKit from 'main'
import Sortable, { SortableEvent } from 'sortablejs';
import { App, IconName, PluginSettingTab, Setting } from 'obsidian';
import { Field, MarkdownViewMode, DisplayBehaviour, Format } from 'src/enums';
import { COLOR_SETTINGS_SPEC, DIV_TAG_SETTINGS_SPEC, SPAN_TAG_SETTINGS_SPEC, settingTabConfigs } from 'src/settings/ui/ui-configs';
import { DropdownFieldDesc, MultiToggleFieldDesc, PluginSettings, SettingGroup, SettingItem, SettingRoot, SliderFieldDesc, TagConfig, TagSettingsSpec, ToggleFieldDesc } from 'src/types';

function _insertButton(setting: Setting, text: string, cta: boolean, onClick: (evt: MouseEvent) => unknown): Setting {
	setting.addButton(btn => {
		btn.setButtonText(text);
		btn.onClick(onClick);
		if (cta) { btn.setCta() }
	});
	return setting;
}

function _collapseElsBelow(rootEl: HTMLElement): void {
	for (let el = rootEl.nextElementSibling; el?.hasClass("is-collapsible"); el = el.nextElementSibling) {
		if (el.hasClass("collapsed")) {
			el.removeClass("collapsed");
		} else {
			el.addClass("collapsed");
		}
	}
}

export class ExtendedSettingTab extends PluginSettingTab {
	public readonly plugin: MarkdownSyntaxKit;
	public readonly tagSettingItems: Record<Format.HIGHLIGHT | Format.CUSTOM_SPAN | Format.FENCED_DIV, Setting[]> = {
		[Format.HIGHLIGHT]: [],
		[Format.CUSTOM_SPAN]: [],
		[Format.FENCED_DIV]: []
	};
	public readonly collapsedGroups: Record<string, boolean> = {
		"syntax-switch": true,
		"formatting": true,
		"tag-display": true,
		"custom-highlight": true,
		"custom-span": true,
		"fenced-div": true,
		"others": true
	};

	private refreshInternal = false;
	private deeplyRefreshInternal = false;
	private isHidden = true;

	constructor(app: App, plugin: MarkdownSyntaxKit) {
		super(app, plugin);
		this.plugin = plugin;
	}

	public saveSettings(spec?: { internal?: boolean, deep?: boolean }) {
		this.plugin.saveSettings();
		if (spec?.internal) {
			this.refreshInternal = true;
			if (spec?.deep) this.deeplyRefreshInternal = true;
		}
	}

	public display(): void {
		let { containerEl } = this,
			{ settings } = this.plugin;
		let settingsUIConfig = settingTabConfigs(settings);
		this.drawFromConfig(settingsUIConfig, containerEl);
		this.isHidden = false;
	}

	public hide(): void {
		if (this.refreshInternal) {
			this.plugin.refreshMarkdownView(this.deeplyRefreshInternal);
		}
		this.refreshInternal = this.deeplyRefreshInternal = false;
		this.emptyTagSettingItems();
		this.isHidden = true;
		this.containerEl.empty();
		super.hide();
	}

	public emptyTagSettingItems(): void {
		for (let type of [Format.HIGHLIGHT, Format.CUSTOM_SPAN, Format.FENCED_DIV] as const) {
			this.tagSettingItems[type].splice(0);
		}
	}

	public removeSetting(setting: Setting): void {
		setting.clear();
		setting.settingEl.remove();
	}

	public drawFromConfig(config: SettingRoot<PluginSettings>, containerEl: HTMLElement): void {
		for (let group of config) {
			let isCollapsing = this.collapsedGroups[group.id];
			if (group.heading) { this.drawHeading(group, containerEl) }
			for (let item of group.items) {
				this.drawSettingItem(item, containerEl, group.collapsible, isCollapsing);
				if (item.preservedForTagSettings == Format.HIGHLIGHT) {
					this.drawTagSettings(containerEl, COLOR_SETTINGS_SPEC, group.collapsible, isCollapsing);
				} else if (item.preservedForTagSettings == Format.CUSTOM_SPAN) {
					this.drawTagSettings(containerEl, SPAN_TAG_SETTINGS_SPEC, group.collapsible, isCollapsing);
				} else if (item.preservedForTagSettings == Format.FENCED_DIV) {
					this.drawTagSettings(containerEl, DIV_TAG_SETTINGS_SPEC, group.collapsible, isCollapsing);
				}
			}
		}
	}

	public drawHeading(group: SettingGroup<PluginSettings>, containerEl: HTMLElement): void {
		if (!group.heading) { return }
		let heading = new Setting(containerEl)
			.setHeading()
			.setName(group.heading);
		if (group.desc) {
			heading.setDesc(group.desc);
		}
		if (group.collapsible) {
			heading.addExtraButton(btn => {
				let btnEl = btn.extraSettingsEl;
				btn
					.setIcon("chevron-down")
					.onClick(() => {
						let btnEl = btn.extraSettingsEl;
						_collapseElsBelow(heading.settingEl);
						if (btnEl.hasClass("collapsing")) {
							btn.setTooltip("Collapse", { placement: "bottom" });
							btnEl.removeClass("collapsing");
							delete this.collapsedGroups[group.id];
						} else {
							btn.setTooltip("Expand", { placement: "bottom" });
							btnEl.addClass("collapsing");
							this.collapsedGroups[group.id] = true;
						}
					});
				btnEl.addClass("collapse-button", "msk-button");
				if (this.collapsedGroups[group.id]) {
					btnEl.addClass("collapsing");
					btn.setTooltip("Expand", { placement: "bottom" });
				} else {
					btn.setTooltip("Collapse", { placement: "bottom" });
				}
			});
			heading.controlEl.addClass("collapse-control");
		}
	}

	public drawSettingItem(item: SettingItem<PluginSettings>, containerEl: HTMLElement, collapsible?: boolean, isCollapsing?: boolean): void {
		let setting = new Setting(containerEl).setName(item.name);
		if (item.desc) {
			setting.setDesc(item.desc);
		}
		if (collapsible) {
			setting.setClass("is-collapsible");
			if (isCollapsing) {
				setting.setClass("collapsed");
			}
		}
		if (item.fields) {
			for (let field of item.fields) {
				if (field.type == Field.TOGGLE) { this._setToggleField(field, setting) }
				else if (field.type == Field.DROPDOWN) { this._setDropdownField(field, setting) }
				else if (field.type == Field.MULTI_TOGGLE) { this._setMultiToggleField(field, setting) }
				else if (field.type == Field.SLIDER) { this._setSliderField(field, setting) }
			}
		}
	}

	public drawTagSettings(containerEl: HTMLElement, spec: TagSettingsSpec, collapsible?: boolean, isCollapsing?: boolean): void {
		let groupEl = containerEl.createDiv({ cls: ["setting-item", "setting-group", "msk-setting-group"] }),
			tagManager = this.plugin.tagManager,
			configs = tagManager.configsMap[spec.type],
			controlSetting = new Setting(containerEl);

		configs.forEach(config => {
			this._setTagItem(spec, config, configs, groupEl);
		});

		_insertButton(controlSetting, spec.addBtnPlaceholder, false, () => {
			tagManager.add(spec.type);
			this._setTagItem(spec, configs.at(-1)!, configs, groupEl)
				.controlEl.querySelector<HTMLElement>(".msk-field-tag")
				?.focus();
		});

		_insertButton(controlSetting, "Reset to default", true, () => {
			this.tagSettingItems[spec.type].forEach(setting => {
				this.removeSetting(setting);
			});
			this.tagSettingItems[spec.type].splice(0);
			tagManager.reset(spec.type);
			configs.forEach(config => {
				this._setTagItem(spec, config, configs, groupEl);
			});
			spec.onResetted?.(this);
		});

		if (collapsible) {
			controlSetting.setClass("is-collapsible");
			groupEl.addClass("is-collapsible");
			if (isCollapsing) {
				controlSetting.setClass("collapsed");
				groupEl.addClass("collapsed");
			}
		}

		this._makeDragable(groupEl, evt => {
			let { oldIndex, newIndex } = evt;
			if (oldIndex === undefined || newIndex === undefined || oldIndex == newIndex) return;
			tagManager.move(spec.type, oldIndex, newIndex);
			spec.onMoved?.(this, oldIndex, newIndex);
		});
	}

	private _setTagItem(spec: TagSettingsSpec, config: TagConfig, configs: TagConfig[], groupEl: HTMLElement): Setting {
		config.tag = config.tag.replaceAll(spec.tagFilter, "");

		let tagSetting = new Setting(groupEl)
			.setClass("msk-setting-item")
			.setClass("msk-tag-config")
			.addExtraButton(btn => {
				btn.extraSettingsEl.addClasses(["msk-button", "msk-button-drag-handle"]);
				btn.setIcon("grip-vertical");
				btn.setTooltip("Hold and drag to move", { placement: "left" });
			})
			.addText(text => {
				text.setPlaceholder(spec.nameFieldPlaceholder);
				text.setValue(config.name);
				text.inputEl.addClasses(["msk-field", "msk-field-name"]);
				text.onChange(name => {
					config.name = name;
					this.saveSettings();
				});
			})
			.addExtraButton(btn => {
				let btnEl = btn.extraSettingsEl;
				btnEl.addClasses(["msk-button", "msk-button-delete"]);
				btn.setIcon("trash");
				btn.setTooltip("Delete");
				btn.onClick(() => {
					let index = configs.findIndex(target => target == config);
					this.plugin.tagManager.remove(spec.type, index);
					this.tagSettingItems[spec.type].splice(index, 1);
					this.removeSetting(tagSetting);
					this.saveSettings();
					spec.onDelete?.(this, index);
				});
			})
			.addExtraButton(btn => {
				btn.extraSettingsEl.addClasses(["msk-button", "msk-button-toggle-show-hide"]);
				btn.setIcon(config.showInMenu ? "eye" : "eye-off");
				btn.setTooltip("Show/hide menu item");
				btn.onClick(() => {
					config.showInMenu = !config.showInMenu;
					btn.setIcon(config.showInMenu ? "eye" : "eye-off");
					this.saveSettings();
				});
			})
			.addText(text => {
				text.setPlaceholder(spec.tagFieldPlaceholder);
				text.inputEl.addClasses(["msk-field", "msk-field-tag"]);
				text.setValue(config.tag);
				text.onChange(tag => {
					let index = configs.findIndex(target => target == config);
					config.tag = tag.replaceAll(spec.tagFilter, "");
					text.setValue(config.tag);
					this.saveSettings();
					spec.onTagChange?.(this, config, index);
				});
			});

		spec.onAdd?.(this, tagSetting, config);
		this.tagSettingItems[spec.type].push(tagSetting);
		return tagSetting;
	}

	private _setToggleField(field: ToggleFieldDesc<PluginSettings>, setting: Setting): void {
		setting.addToggle(toggle => {
			let { record, key } = field;
			toggle.setValue(record[key]);
			toggle.onChange(val => {
				record[key] = val;
				this.saveSettings(field.update);
				if (field.callback) {
					field.callback(toggle, this.plugin);
				}
			});
		});
	}

	private _setDropdownField(field: DropdownFieldDesc<PluginSettings>, setting: Setting): void {
		setting.addDropdown(dropdown => {
			let { record, key } = field;
			dropdown.addOptions(field.spec.options);
			dropdown.setValue(record[key].toString());
			dropdown.onChange(val => {
				(record[key] as MarkdownViewMode | DisplayBehaviour) = parseInt(val);
				this.saveSettings(field.update);
				if (field.callback) {
					field.callback(dropdown, this.plugin);
				}
			});
		});
	}

	private _setMultiToggleField(field: MultiToggleFieldDesc<PluginSettings>, setting: Setting): void {
		let { record, key } = field,
			value = record[key],
			options = field.spec.options as Record<typeof value, { icon: IconName, tooltip?: string }>,
			optionMap: string[] = (() => {
				let optionMap = [];
				for (let opt in options) { optionMap.push(opt) };
				return optionMap;
			})(),
			index = optionMap.findIndex(val => val === value.toString());
		setting.addExtraButton(btn => {
			let { icon, tooltip } = options[value];
			btn.setIcon(icon);
			btn.setTooltip(tooltip ?? "");
			btn.onClick(() => {
				if (index + 1 >= optionMap.length) { index = 0 }
				else { index++ }
				let changedVal = parseInt(optionMap[index]) as typeof value,
					{ icon, tooltip } = options[changedVal];
				btn.setIcon(icon);
				btn.setTooltip(tooltip ?? "");
				(record[key] as MarkdownViewMode | DisplayBehaviour) = changedVal;
				this.saveSettings(field.update);
				if (field.callback) {
					field.callback(btn, this.plugin);
				}
			});
		});
	}

	private _setSliderField(field: SliderFieldDesc<PluginSettings>, setting: Setting) {
		setting.addSlider(slider => {
			let { record, key, spec } = field;
			slider.setInstant(false);
			slider.setDynamicTooltip();
			slider.setLimits(spec.min, spec.max, spec.step);
			slider.setValue(record[key]);
			slider.onChange(val => {
				(record[key] as number) = val;
				this.saveSettings(field.update);
				if (field.callback) {
					field.callback(slider, this.plugin);
				}
			});
		});
	}

	private _makeDragable(groupEl: HTMLElement, onMoved: (evt: SortableEvent) => unknown): void {
		Sortable.create(groupEl, {
			handle: ".msk-button-drag-handle",
			animation: 100,
			easing: "cubic-bezier(0.2, 0, 0, 1)",
			forceFallback: true,
			fallbackOnBody: true,
			fallbackClass: "msk-setting-item-dragged",
			fallbackTolerance: 4,
			onEnd: onMoved,
		});
	}
}