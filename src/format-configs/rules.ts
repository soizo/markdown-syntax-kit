import { Format } from "src/enums";
import { BlockFormat, InlineFormat, BlockFormatRule, InlineFormatRule } from "src/types";

export const BlockRules: Record<BlockFormat, BlockFormatRule> = {
	[Format.FENCED_DIV]: {
		char: ":",
		length: 3,
		exactLen: false,
		class: "fenced-div"
	}
}

export const InlineRules: Record<InlineFormat, InlineFormatRule> = {
	[Format.INSERTION]: {
		char: "+",
		length: 2,
		exactLen: true,
		allowSpace: true,
		mustBeClosed: true,
		class: "ins",
		getEl: () => createEl("ins"),
		builtin: false
	},
	[Format.SPOILER]: {
		char: "|",
		length: 2,
		exactLen: true,
		allowSpace: true,
		mustBeClosed: true,
		class: "spoiler",
		getEl: () => {
			let spoilerEl = createSpan();
			spoilerEl.addClass("spoiler");
			spoilerEl.addEventListener("click", (evt) => {
				let spoilerEl = evt.currentTarget as Element,
					isHidden = !spoilerEl.hasClass("spoiler-revealed");
				spoilerEl.toggleClass("spoiler-revealed", isHidden);
			});
			return spoilerEl;
		},
		builtin: false
	},
	[Format.SUPERSCRIPT]: {
		char: "^",
		length: 1,
		exactLen: true,
		allowSpace: false,
		mustBeClosed: true,
		class: "sup",
		getEl: () => createEl("sup"),
		builtin: false
	},
	[Format.SUBSCRIPT]: {
		char: "~",
		length: 1,
		exactLen: true,
		allowSpace: false,
		mustBeClosed: true,
		class: "sub",
		getEl: () => createEl("sub"),
		builtin: false
	},
	[Format.HIGHLIGHT]: {
		char: "=",
		length: 2,
		exactLen: false,
		allowSpace: true,
		mustBeClosed: false,
		class: "custom-highlight",
		getEl: () => createEl("mark"),
		builtin: true
	},
	[Format.CUSTOM_SPAN]: {
		char: "!",
		length: 2,
		exactLen: true,
		allowSpace: true,
		mustBeClosed: true,
		class: "custom-span",
		getEl() {
			let el = createSpan();
			el.classList.add(InlineRules[Format.CUSTOM_SPAN].class);
			return el;
		},
		builtin: false
	}
}

const inlineFormats = Object.keys(InlineRules).map(Number) as InlineFormat[];
const blockFormats = Object.keys(BlockRules).map(Number) as BlockFormat[];

export const Formats = {
	ALL: [...inlineFormats, ...blockFormats],
	ALL_BLOCK: blockFormats,
	ALL_INLINE: inlineFormats,
	SPACE_RESTRICTED_INLINE: inlineFormats.filter(type => !InlineRules[type].allowSpace),
	SPACE_ALLOWED_INLINE: inlineFormats.filter(type => InlineRules[type].allowSpace),
	NON_BUILTIN_INLINE: inlineFormats.filter(type => !InlineRules[type].builtin),
};
