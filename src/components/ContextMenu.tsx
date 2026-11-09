import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import Icon from "./Icon";
import { t } from "../settings/i18n";
import styles from "../App.module.css";
import { canExecuteCommand, executeCommand } from "../workspace/commands";
export type { Action as MenuAction, MenuItem } from "../workspace/commands";
import type { MenuItem } from "../workspace/commands";
export default function ContextMenu({
  x,
  y,
  items,
  onClose,
  returnFocus,
  title,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  returnFocus?: HTMLElement | null;
  title?: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 6, top: 6 });
  const visible = items.filter(
    (item, index) =>
      item.type !== "separator" ||
      (items.slice(0, index).some((before) => before.type !== "separator") &&
        items[index + 1] &&
        items[index + 1].type !== "separator"),
  );
  useLayoutEffect(() => {
    function place() {
      const rect = menu.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        left: Math.max(6, Math.min(x, window.innerWidth - rect.width - 6)),
        top: Math.max(6, Math.min(y, window.innerHeight - rect.height - 6)),
      });
    }
    place();
    window.addEventListener("resize", place);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(place);
    if (menu.current) observer?.observe(menu.current);
    return () => {
      window.removeEventListener("resize", place);
      observer?.disconnect();
    };
  }, [x, y]);
  useEffect(() => {
    const previous =
      returnFocus ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    const first = menu.current?.querySelector<HTMLButtonElement>(
      "button:not(:disabled)",
    );
    (first ?? menu.current)?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [returnFocus]);
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.isComposing) return;
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const buttons = Array.from(
      menu.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      ) ?? [],
    );
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : index < 0
            ? event.key === "ArrowUp"
              ? buttons.length - 1
              : 0
            : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length;
    buttons[next].focus();
    buttons[next].scrollIntoView?.({ block: "nearest" });
  });
  useEffect(() => {
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, []);
  return (
    <div
      className={styles.menuBackdrop}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={menu}
        role="menu"
        aria-label={t("컨텍스트 메뉴")}
        tabIndex={-1}
        className={styles.contextMenu}
        style={position}
      >
        {title ? <div className={styles.contextMenuTitle}>{title}</div> : null}
        {visible.map((item) =>
          item.type === "separator" ? (
            <div
              key={item.id}
              role="separator"
              className={styles.menuSeparator}
            />
          ) : (
            <button
              key={item.id ?? item.label}
              type="button"
              role={
                typeof item.checked === "boolean"
                  ? "menuitemcheckbox"
                  : "menuitem"
              }
              aria-checked={item.checked}
              aria-keyshortcuts={item.shortcut
                ?.replace(/Ctrl/g, "Control")
                .replace(/\s/g, "")}
              disabled={!canExecuteCommand(item)}
              className={item.danger ? styles.menuDanger : undefined}
              onClick={() => {
                if (!canExecuteCommand(item)) return;
                onClose();
                void executeCommand(item);
              }}
            >
              <span className={styles.menuIcon}>
                {item.checked ? (
                  <Icon name="check" size={15} />
                ) : item.icon ? (
                  <Icon name={item.icon} size={15} />
                ) : null}
              </span>
              <span className={styles.menuLabel}>{item.label}</span>
              {item.shortcut ? (
                <kbd className={styles.menuShortcut} aria-hidden="true">
                  {item.shortcut}
                </kbd>
              ) : null}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
