import { useState } from "react";
import { t } from "../settings/i18n";
import Icon from "./Icon";
import styles from "./NumberStepper.module.css";

/**
 * `[−] 13 px [+]` integer input. Buttons and arrow keys step by one within
 * the range; typed values apply as soon as they are valid, and an invalid
 * entry is marked and restored when focus leaves.
 */
export default function NumberStepper({
  id,
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  // Text being typed; `null` shows the stored value.
  const [draft, setDraft] = useState<string | null>(null);
  const valid = (number: number) =>
    Number.isInteger(number) && number >= min && number <= max;
  const invalid = draft !== null && !valid(Number(draft));
  const change = (next: number) => {
    setDraft(null);
    if (valid(next) && next !== value) onChange(next);
  };
  return (
    <div className={styles.stepper} data-invalid={invalid || undefined}>
      <button
        type="button"
        aria-label={t("{0} 줄이기", label)}
        title={t("{0} 줄이기", label)}
        disabled={value <= min}
        onClick={() => change(value - 1)}
      >
        <Icon name="minus" size={14} />
      </button>
      <label className={styles.field}>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          autoComplete="off"
          min={min}
          max={max}
          step={1}
          aria-invalid={invalid}
          value={draft ?? String(value)}
          onChange={(event) => {
            const text = event.target.value;
            if (valid(Number(text)) && text.trim()) change(Number(text));
            else setDraft(text);
          }}
          onBlur={() => setDraft(null)}
          onKeyDown={(event) => {
            // Stepped here rather than natively so a half-typed draft steps
            // from the stored value and the bounds behave like the buttons.
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              change(
                Math.min(
                  max,
                  Math.max(min, value + (event.key === "ArrowUp" ? 1 : -1)),
                ),
              );
              return;
            }
            if (event.key === "Enter" || event.key === "Escape") {
              if (event.key === "Escape" && draft !== null)
                event.stopPropagation();
              setDraft(null);
            }
          }}
          // Wheel steps only while hovered and focused; keep page scrolling.
          onWheel={(event) => event.currentTarget.blur()}
        />
        {unit ? <span aria-hidden="true">{unit}</span> : null}
      </label>
      <button
        type="button"
        aria-label={t("{0} 늘리기", label)}
        title={t("{0} 늘리기", label)}
        disabled={value >= max}
        onClick={() => change(value + 1)}
      >
        <Icon name="add" size={14} />
      </button>
    </div>
  );
}
