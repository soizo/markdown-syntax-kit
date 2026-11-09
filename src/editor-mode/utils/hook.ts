import { Language, LanguageState } from "@codemirror/language";
import { StateEffectType, StateField } from "@codemirror/state";

export function hookLangState(): {
	langStateField: StateField<LanguageState>,
	langStateFxType: StateEffectType<LanguageState>
} {
	let langStateField = Object.getOwnPropertyDescriptor(Language, "state")?.value as unknown,
		langStateFxType = Object.getOwnPropertyDescriptor(Language, "setState")?.value as unknown;
	if (!(langStateField instanceof StateField && langStateFxType instanceof StateEffectType)) {
		throw TypeError();
	}

	return {
		langStateField: langStateField as StateField<LanguageState>,
		langStateFxType: langStateFxType as StateEffectType<LanguageState>,
	};
}