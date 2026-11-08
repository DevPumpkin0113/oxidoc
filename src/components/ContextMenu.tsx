import { useEffect, useRef } from "react";
import styles from "../App.module.css";
export interface MenuItem {
  label: string;
  run: () => void;
  disabled?: boolean;
}
export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menu.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
  }, []);
  return (
    <div
      className={styles.menuBackdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const buttons = Array.from(
            menu.current?.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ) ?? [],
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
          ]?.focus();
        }
      }}
    >
      <div
        ref={menu}
        role="menu"
        className={styles.contextMenu}
        style={{
          left: Math.max(6, Math.min(x, window.innerWidth - 210)),
          top: Math.max(
            6,
            Math.min(y, window.innerHeight - items.length * 32 - 12),
          ),
        }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
