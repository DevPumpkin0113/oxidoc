import { t } from "../settings/i18n";
import { useEffect, useRef, useState } from "react";
import styles from "../App.module.css";
export interface ActionRequest {
  title: string;
  body?: string;
  initial?: string;
  input?: boolean;
  allowEmpty?: boolean;
  label?: string;
  resolve: (value: string | null) => void;
}
export default function ActionDialog({
  request,
  onResolve,
}: {
  request: ActionRequest;
  onResolve: (value: string | null) => void;
}) {
  const [value, setValue] = useState(request.initial ?? "");
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    form.current
      ?.querySelector<HTMLElement>(request.input ? "input" : "button")
      ?.focus();
  }, [request.input]);
  return (
    <div className={styles.modalBackdrop}>
      <form
        ref={form}
        className={styles.confirmDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-title"
        onSubmit={(event) => {
          event.preventDefault();
          onResolve(request.input ? value : "yes");
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onResolve(null);
          }
          if (event.key === "Tab") {
            const controls =
              form.current?.querySelectorAll<HTMLElement>("input,button");
            if (!controls) return;
            const first = controls[0],
              last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <h2 id="action-title">{request.title}</h2>
        {request.body ? <p>{request.body}</p> : null}
        {request.input ? (
          <input
            className={styles.dialogInput}
            aria-label={request.title}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
        ) : null}
        <div className={styles.dialogActions}>
          <button type="button" onClick={() => onResolve(null)}>
            {t("취소")}
          </button>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={request.input && !request.allowEmpty && !value.trim()}
          >
            {request.label ?? t("확인")}
          </button>
        </div>
      </form>
    </div>
  );
}
