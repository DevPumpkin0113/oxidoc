import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import styles from "./Dropdown.module.css";

export interface DropdownOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** Gap between the button and the list, and from the window edges. */
const GAP = 3;
const EDGE = 8;
const MAX_LIST_HEIGHT = 280;
const TYPEAHEAD_RESET_MS = 600;

/**
 * Select-only combobox in the app's style (WAI-ARIA combobox pattern): focus
 * stays on the button, the list opens below or above depending on space, and
 * arrows, Home/End, Enter/Space, Esc, Tab and type-ahead work as in a native
 * select. The list is portalled so scroll containers do not clip it.
 */
export default function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className = "",
}: {
  /** Accessible name; the visible text is the selected option. */
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({});
  const typed = useRef({ text: "", at: 0 });
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  const enabled = (index: number) =>
    index >= 0 && index < options.length && !options[index].disabled;
  /** Next enabled index from `from` in `step` direction, or `from` if none. */
  const step = (from: number, direction: 1 | -1) => {
    for (
      let index = from + direction;
      index >= 0 && index < options.length;
      index += direction
    )
      if (enabled(index)) return index;
    return from;
  };
  const first = () => step(-1, 1);
  const last = () => step(options.length, -1);

  function show(index = selectedIndex) {
    if (disabled) return;
    setActive(enabled(index) ? index : first());
    setOpen(true);
  }
  function close() {
    setOpen(false);
  }
  function choose(index: number) {
    if (!enabled(index)) return;
    close();
    if (options[index].value !== value) onChange(options[index].value);
  }

  // Place the list under the button, or above it when there is more room.
  useLayoutEffect(() => {
    if (!open || !button.current || !list.current) return;
    const anchor = button.current.getBoundingClientRect();
    const height = Math.min(list.current.scrollHeight, MAX_LIST_HEIGHT);
    const below = window.innerHeight - anchor.bottom - GAP - EDGE;
    const above = anchor.top - GAP - EDGE;
    const upward = height > below && above > below;
    const maxHeight = Math.max(
      0,
      Math.min(MAX_LIST_HEIGHT, upward ? above : below),
    );
    const width = Math.max(anchor.width, list.current.offsetWidth);
    setPosition({
      top: upward
        ? anchor.top - GAP - Math.min(height, maxHeight)
        : anchor.bottom + GAP,
      left: Math.max(
        EDGE,
        Math.min(anchor.left, window.innerWidth - width - EDGE),
      ),
      minWidth: anchor.width,
      maxHeight,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
  }, [open, active]);

  // Outside clicks, window resizes and outer scrolling close the list.
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !list.current?.contains(target))
        close();
    };
    const scroll = (event: Event) => {
      if (!list.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [open]);

  function typeahead(key: string) {
    const now = Date.now();
    const text =
      now - typed.current.at > TYPEAHEAD_RESET_MS
        ? key
        : typed.current.text + key;
    typed.current = { text, at: now };
    const start = open ? active : selectedIndex;
    const order = options.map(
      (_, offset) => (start + 1 + offset) % options.length,
    );
    // A repeated single letter cycles; a longer prefix keeps the current match.
    if (text.length > 1 && enabled(start)) order.unshift(start);
    const match = order.find(
      (index) =>
        enabled(index) &&
        options[index].label
          .toLocaleLowerCase()
          .startsWith(text.toLocaleLowerCase()),
    );
    if (match === undefined) return;
    if (open) setActive(match);
    else choose(match);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.nativeEvent.isComposing) return;
    const handled = () => event.preventDefault();
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        handled();
        show();
      } else if (event.key === "Home") {
        handled();
        show(first());
      } else if (event.key === "End") {
        handled();
        show(last());
      } else if (
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        handled();
        typeahead(event.key);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        handled();
        setActive((index) => step(index, 1));
        break;
      case "ArrowUp":
        handled();
        if (event.altKey) choose(active);
        else setActive((index) => step(index, -1));
        break;
      case "Home":
        handled();
        setActive(first());
        break;
      case "End":
        handled();
        setActive(last());
        break;
      case "Enter":
      case " ":
        handled();
        choose(active);
        break;
      case "Escape":
        handled();
        event.stopPropagation();
        close();
        break;
      case "Tab":
        close();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          handled();
          typeahead(event.key);
        }
    }
  }

  const listId = `${id}-list`;
  return (
    <>
      <button
        ref={button}
        type="button"
        role="combobox"
        className={`${styles.button} ${className}`}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && active >= 0 ? `${id}-${active}` : undefined
        }
        title={selected ? `${label}: ${selected.label}` : label}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onKeyDown}
        onBlur={close}
      >
        <span className={styles.value}>{selected?.label ?? ""}</span>
        <Icon name="down" size={14} />
      </button>
      {open
        ? createPortal(
            <ul
              ref={list}
              id={listId}
              role="listbox"
              aria-label={label}
              className={styles.list}
              style={position}
              // Keep focus (and the open list) on the button while clicking.
              onMouseDown={(event) => event.preventDefault()}
            >
              {options.map((option, index) => (
                <li
                  key={option.value}
                  id={`${id}-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-disabled={option.disabled || undefined}
                  data-active={index === active}
                  className={styles.option}
                  onPointerMove={() => {
                    if (enabled(index)) setActive(index);
                  }}
                  onClick={() => choose(index)}
                >
                  <span className={styles.check}>
                    {index === selectedIndex ? (
                      <Icon name="check" size={13} />
                    ) : null}
                  </span>
                  <span className={styles.label}>{option.label}</span>
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
