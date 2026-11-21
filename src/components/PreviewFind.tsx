import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../settings/i18n";
import { findTextRanges, MAX_TEXT_MATCHES } from "../workspace/textSearch";
import Icon from "./Icon";
import styles from "./PreviewFind.module.css";

const MATCH_HIGHLIGHT = "oxidoc-find";
const CURRENT_HIGHLIGHT = "oxidoc-find-current";

/** CSS Custom Highlight API, missing in jsdom and older engines. */
const highlights = () =>
  typeof CSS !== "undefined" &&
  "highlights" in CSS &&
  typeof Highlight !== "undefined"
    ? CSS.highlights
    : null;

/**
 * Find bar over the rendered preview: highlights matches without touching the
 * DOM React owns, and scrolls the current match into view. Matches are found
 * again whenever the preview's DOM changes (typing in split view, images).
 */
export default function PreviewFind({
  container,
  focusToken,
  onClose,
}: {
  container: React.RefObject<HTMLElement | null>;
  focusToken: number;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  /** `reveal` changes only on user actions, which scroll to the match. */
  const [result, setResult] = useState<{
    ranges: Range[];
    index: number;
    reveal: number;
  }>({ ranges: [], index: 0, reveal: 0 });
  const input = useRef<HTMLInputElement>(null);
  const queryRef = useRef(query);

  useLayoutEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, [focusToken]);

  /** Finds `next` again; a user search starts at the first match and reveals it. */
  function search(next: string, user: boolean) {
    queryRef.current = next;
    const root = container.current;
    const ranges = root && next ? findTextRanges(root, next) : [];
    setResult((current) => ({
      ranges,
      index: user ? 0 : Math.min(current.index, Math.max(0, ranges.length - 1)),
      reveal: user ? current.reveal + 1 : current.reveal,
    }));
  }

  // The preview re-renders blocks as the document changes; search again then.
  useEffect(() => {
    const root = container.current;
    if (!root || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      if (queryRef.current) search(queryRef.current, false);
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
    // `search` only reads refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  const { ranges, index, reveal } = result;
  const current = ranges[index];
  useEffect(() => {
    const registry = highlights();
    if (registry) {
      registry.set(MATCH_HIGHLIGHT, new Highlight(...ranges));
      registry.set(
        CURRENT_HIGHLIGHT,
        current ? new Highlight(current) : new Highlight(),
      );
    }
    return () => {
      registry?.delete(MATCH_HIGHLIGHT);
      registry?.delete(CURRENT_HIGHLIGHT);
    };
  }, [ranges, current]);

  // Scroll only for a new user action, not when edits re-run the search.
  const revealed = useRef(0);
  useEffect(() => {
    const root = container.current;
    if (reveal === revealed.current || !current || !root) return;
    revealed.current = reveal;
    // jsdom has no layout; skip scrolling there.
    if (typeof current.getBoundingClientRect !== "function") return;
    const box = current.getBoundingClientRect();
    const view = root.getBoundingClientRect();
    if (box.top < view.top + 40 || box.bottom > view.bottom - 20)
      root.scrollBy?.({ top: box.top - view.top - root.clientHeight / 3 });
  }, [reveal, current, container]);

  const move = (step: number) =>
    setResult((value) =>
      value.ranges.length
        ? {
            ...value,
            index:
              (value.index + step + value.ranges.length) % value.ranges.length,
            reveal: value.reveal + 1,
          }
        : value,
    );

  const status = !query
    ? ""
    : ranges.length
      ? `${index + 1}/${ranges.length}${ranges.length >= MAX_TEXT_MATCHES ? "+" : ""}`
      : t("결과 없음");

  return (
    <div
      className={styles.find}
      role="search"
      aria-label={t("미리보기에서 찾기")}
    >
      <input
        ref={input}
        value={query}
        placeholder={t("찾기")}
        aria-label={t("찾을 내용")}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value);
          search(event.target.value, true);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Enter") {
            event.preventDefault();
            move(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
      />
      <span className={styles.status} aria-live="polite">
        {status}
      </span>
      <button
        type="button"
        aria-label={t("이전 결과")}
        title={`${t("이전 결과")} (Shift Enter)`}
        disabled={!ranges.length}
        onClick={() => move(-1)}
      >
        <Icon name="up" size={14} />
      </button>
      <button
        type="button"
        aria-label={t("다음 결과")}
        title={`${t("다음 결과")} (Enter)`}
        disabled={!ranges.length}
        onClick={() => move(1)}
      >
        <Icon name="downArrow" size={14} />
      </button>
      <button
        type="button"
        aria-label={t("찾기 닫기")}
        title={`${t("찾기 닫기")} (Esc)`}
        onClick={onClose}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
