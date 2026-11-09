import { t } from "../settings/i18n";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import styles from "../App.module.css";
import {
  canExecuteCommand,
  executeCommand,
  type Command,
} from "../workspace/commands";
export type PaletteCommand = Command;
export default function CommandPalette({
  commands,
  onClose,
  suspended = false,
}: {
  commands: PaletteCommand[];
  onClose: () => void;
  suspended?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const handleEscape = useEffectEvent((event: KeyboardEvent) => {
    if (suspended || event.key !== "Escape" || event.isComposing) return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  });
  useEffect(() => {
    window.addEventListener("keydown", handleEscape, true);
    return () => window.removeEventListener("keydown", handleEscape, true);
  }, []);
  const filtered = useMemo(
    () =>
      commands.filter((command) =>
        `${command.label} ${command.detail ?? ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      ),
    [commands, query],
  );
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    container.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [index]);
  return (
    <div
      className={styles.modalBackdrop}
      inert={suspended}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={container}
        className={styles.commandPalette}
        role="dialog"
        aria-modal="true"
        aria-label={t("명령 팔레트")}
        onKeyDown={(event) => {
          if (event.key === "Tab") {
            event.preventDefault();
            if (document.activeElement === input.current)
              closeButton.current?.focus();
            else if (document.activeElement === closeButton.current)
              input.current?.focus();
            else (event.shiftKey ? closeButton : input).current?.focus();
            return;
          }
          if (event.target !== input.current || event.nativeEvent.isComposing)
            return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((value) =>
              filtered.length
                ? (value +
                    (event.key === "ArrowDown" ? 1 : -1) +
                    filtered.length) %
                  filtered.length
                : 0,
            );
          }
          if (event.key === "Enter") {
            event.preventDefault();
            if (filtered[index]) void executeCommand(filtered[index]);
          }
        }}
      >
        <div className={styles.paletteHeader}>
          <input
            ref={input}
            role="combobox"
            aria-label={t("명령 또는 프로젝트 검색")}
            aria-expanded="true"
            aria-controls="palette-options"
            aria-activedescendant={
              filtered[index] ? `palette-${filtered[index].id}` : undefined
            }
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            placeholder={t("명령, 문서 또는 프로젝트 검색…")}
          />
          <button
            ref={closeButton}
            type="button"
            className={styles.paletteClose}
            aria-label={t("명령 팔레트 닫기")}
            title={`${t("명령 팔레트 닫기")} (Esc)`}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        <div id="palette-options" role="listbox">
          {filtered.map((command, i) => (
            <div
              key={command.id}
              id={`palette-${command.id}`}
              role="option"
              aria-selected={index === i}
              aria-disabled={!canExecuteCommand(command)}
              data-index={i}
              className={index === i ? styles.selectedCommand : ""}
              onMouseEnter={() => setIndex(i)}
              onClick={() => void executeCommand(command)}
            >
              <span>{command.label}</span>
              <small>{command.detail}</small>
            </div>
          ))}
          {!filtered.length ? <p>{t("일치하는 명령이 없습니다.")}</p> : null}
        </div>
        <footer>{t("↑ ↓ 선택 · Enter 실행 · Esc 닫기")}</footer>
      </div>
    </div>
  );
}
