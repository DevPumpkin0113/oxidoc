import koreanSource from "monaco-editor/nls/lang/ko.js?raw";
import { effectiveLanguage, useSettings } from "./store";
// Monaco 0.57 ships its official language bundle as a global assignment.
// Parse only the JSON array, without evaluating the bundle as JavaScript.
const koreanMessages: string[] = JSON.parse(
  koreanSource.slice(
    koreanSource.indexOf("=[") + 1,
    koreanSource.lastIndexOf("];") + 1,
  ),
);
export function setMonacoLanguage(language: "ko" | "en") {
  const globals = globalThis as typeof globalThis & {
    _VSCODE_NLS_MESSAGES?: string[];
    _VSCODE_NLS_LANGUAGE?: string;
  };
  globals._VSCODE_NLS_MESSAGES = language === "ko" ? koreanMessages : undefined;
  globals._VSCODE_NLS_LANGUAGE = language;
}
setMonacoLanguage(effectiveLanguage(useSettings.getState()));

// Monaco caches the find-widget labels at module initialization. Its public
// API has no runtime locale setter, so adapt only that widget's own controls.
// Never inspect or translate the editor model, user input or rendered lines.
const labels: [string, number][] = [
  ["Find / Replace", 1018],
  ["Find", 1019],
  ["Previous Match", 1021],
  ["Next Match", 1022],
  ["Find in Selection", 1023],
  ["Close", 1024],
  ["Replace", 1025],
  ["Replace All", 1028],
  ["Toggle Replace", 1029],
  ["No results", 1032],
  ["Match Case", 2],
  ["Match Whole Word", 3],
  ["Use Regular Expression", 4],
  ["Preserve Case", 6],
];
function countPattern(template: string) {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    "^" +
      escaped
        .replace("\\{0\\}", "(?<first>\\d+)")
        .replace("\\{1\\}", "(?<second>\\d+)") +
      "$",
  );
}
const countPatterns = {
  ko: countPattern("{0} of {1}"),
  en: countPattern(koreanMessages[1031]),
};
function labelFor(text: string, language: "ko" | "en") {
  for (const [english, index] of labels) {
    const korean = koreanMessages[index];
    const source = language === "ko" ? english : korean;
    const target = language === "ko" ? korean : english;
    if (
      text === source ||
      text.startsWith(source + "(") ||
      text.startsWith(source + " (")
    )
      return target + text.slice(source.length);
  }
  const count = countPatterns[language].exec(text);
  if (count?.groups)
    return (language === "ko" ? koreanMessages[1031] : "{0} of {1}")
      .replace("{0}", count.groups.first)
      .replace("{1}", count.groups.second);
  return text;
}
export function localizeFindWidget(root: HTMLElement, language: "ko" | "en") {
  let frame = 0;
  function apply() {
    const widget = root.querySelector(".find-widget");
    if (!widget) return;
    for (const control of [
      widget,
      ...widget.querySelectorAll("[aria-label],[title],[placeholder]"),
    ]) {
      for (const attribute of ["aria-label", "title", "placeholder"]) {
        const original = control.getAttribute(attribute);
        if (!original) continue;
        const translated = labelFor(original, language);
        if (translated !== original)
          control.setAttribute(attribute, translated);
      }
    }
    const count = widget.querySelector(".matchesCount");
    if (count?.textContent) {
      const translated = labelFor(count.textContent, language);
      if (translated !== count.textContent) count.textContent = translated;
    }
  }
  const observer = new MutationObserver(() => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(apply);
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["aria-label", "title", "placeholder"],
  });
  apply();
  return () => {
    observer.disconnect();
    cancelAnimationFrame(frame);
  };
}
