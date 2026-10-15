import languages from "../languages.json";

const LABEL_BY_CODE = Object.fromEntries(languages.map((l) => [l.code, l.label]));

/** "en" -> "English"; unknown codes are returned as-is. */
export function languageLabel(code) {
  return LABEL_BY_CODE[code] ?? code ?? "";
}
