import { useEffect, useId, useRef, useState } from "react";
import { t } from "../settings/i18n";
import {
  loadSystemFonts,
  pickable,
  replaceSegment,
  segmentAt,
  suggestFonts,
  type FontFamily,
} from "../settings/fonts";
import { MAX_FONT_FAMILY_LENGTH, normalizeFontFamily } from "../settings/store";
import styles from "./FontFamilyInput.module.css";

type Fonts =
  | { state: "loading" }
  | { state: "ready"; families: FontFamily[] }
  | { state: "failed" };

/**
 * Comma-separated font list with suggestions from the installed fonts
 * (editable combobox). Typing filters by the entry at the caret, choosing
 * replaces that entry, and the list applies on Enter, a choice or blur so
 * half-typed names never reach the editor.
 */
export default function FontFamilyInput({
  id,
  value,
  invalid,
  onCommit,
  onValidity,
}: {
  id: string;
  value: string;
  invalid: boolean;
  onCommit: (value: string) => void;
  onValidity: (valid: boolean) => void;
}) {
  const listId = `${useId()}-fonts`;
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [text, setText] = useState(value);
  const [caret, setCaret] = useState(value.length);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [fonts, setFonts] = useState<Fonts>({ state: "loading" });
  const [desktop, setDesktop] = useState(true);
  // Until the user types, every font is listed rather than only the ones
  // matching the name already in the field.
  const [filtering, setFiltering] = useState(false);
  const suggestions =
    fonts.state === "ready"
      ? suggestFonts(
          fonts.families,
          filtering ? segmentAt(text, caret).query : "",
        )
      : [];
  const expanded = open && desktop;

  useEffect(() => {
    let alive = true;
    loadSystemFonts().then(
      (families) => {
        if (!alive) return;
        if (!families.length) setDesktop(false);
        setFonts({ state: "ready", families: pickable(families) });
      },
      () => alive && setFonts({ state: "failed" }),
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const option = list.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    const container = list.current;
    if (!option || !container) return;
    if (option.offsetTop < container.scrollTop)
      container.scrollTop = option.offsetTop;
    else if (
      option.offsetTop + option.offsetHeight >
      container.scrollTop + container.clientHeight
    )
      container.scrollTop =
        option.offsetTop + option.offsetHeight - container.clientHeight;
  }, [active]);

  function commit(next = text) {
    const family = normalizeFontFamily(next);
    onValidity(family !== null);
    if (family !== null && family !== value) onCommit(family);
  }
  function edit(next: string, nextCaret: number) {
    setText(next);
    setCaret(nextCaret);
    setActive(-1);
    setOpen(true);
    setFiltering(true);
    onValidity(true);
  }
  function choose(family: FontFamily) {
    const next = replaceSegment(text, caret, family.name);
    setText(next.text);
    setCaret(next.caret);
    setOpen(false);
    setActive(-1);
    setFiltering(false);
    commit(next.text);
    requestAnimationFrame(() =>
      input.current?.setSelectionRange(next.caret, next.caret),
    );
  }

  return (
    <div className={styles.wrapper}>
      <input
        ref={input}
        id={id}
        className={styles.input}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        maxLength={MAX_FONT_FAMILY_LENGTH}
        placeholder="Cascadia Code, Consolas"
        aria-autocomplete="list"
        aria-invalid={invalid}
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={
          expanded && active >= 0 ? `${listId}-${active}` : undefined
        }
        value={text}
        onFocus={() => {
          setFiltering(false);
          setOpen(true);
        }}
        onClick={(event) => {
          setCaret(event.currentTarget.selectionStart ?? text.length);
          setOpen(true);
        }}
        onChange={(event) =>
          edit(
            event.target.value,
            event.target.selectionStart ?? event.target.value.length,
          )
        }
        onKeyUp={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight")
            setCaret(event.currentTarget.selectionStart ?? text.length);
        }}
        onBlur={() => {
          setOpen(false);
          commit();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!expanded) setOpen(true);
            const last = suggestions.length - 1;
            setActive((index) =>
              event.key === "ArrowDown"
                ? Math.min(last, index + 1)
                : Math.max(-1, index - 1),
            );
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (expanded && suggestions[active]) choose(suggestions[active]);
            else {
              setOpen(false);
              commit();
            }
          } else if (event.key === "Escape") {
            if (expanded) {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
            } else {
              setText(value);
              onValidity(true);
            }
          }
        }}
      />
      {expanded ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label={t("설치된 글꼴")}
          className={styles.list}
          onMouseDown={(event) => event.preventDefault()}
        >
          {fonts.state === "loading" ? (
            <li className={styles.status} role="presentation">
              {t("설치된 글꼴을 불러오는 중…")}
            </li>
          ) : fonts.state === "failed" ? (
            <li className={styles.status} role="presentation">
              {t(
                "설치된 글꼴을 불러오지 못했습니다. 이름을 직접 입력할 수 있습니다.",
              )}
            </li>
          ) : !suggestions.length ? (
            <li className={styles.status} role="presentation">
              {t("맞는 글꼴이 없습니다.")}
            </li>
          ) : (
            suggestions.map((family, index) => (
              <li
                key={family.name}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={index === active}
                className={styles.option}
                onPointerMove={() => setActive(index)}
                onClick={() => choose(family)}
              >
                <span
                  className={styles.name}
                  style={{ fontFamily: `'${family.name}'` }}
                >
                  {family.name}
                </span>
                {family.aliases.length ? (
                  <small>{family.aliases.join(", ")}</small>
                ) : null}
                {family.monospace ? (
                  <span className={styles.badge}>{t("고정폭")}</span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
