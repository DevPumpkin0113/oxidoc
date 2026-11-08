import { t } from "../settings/i18n";
import { useEffect, useRef } from "react";
import styles from "../App.module.css";
export type UnsavedChoice = "save" | "discard" | "cancel";
export default function UnsavedDialog({
  names,
  onChoose,
}: {
  names: string[];
  onChoose: (choice: UnsavedChoice) => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);
  return (
    <div className={styles.modalBackdrop}>
      <div
        ref={dialog}
        className={styles.confirmDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-describedby="unsaved-description"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onChoose("cancel");
          }
          if (event.key === "Tab") {
            const buttons = dialog.current?.querySelectorAll("button");
            if (!buttons) return;
            const first = buttons[0],
              last = buttons[buttons.length - 1];
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
        <h2 id="unsaved-title">{t("변경 내용을 저장할까요?")}</h2>
        <p id="unsaved-description">
          {names.join(", ")}
          <br />
          {t("저장하지 않은 변경 내용이 있습니다.")}
        </p>
        <div className={styles.dialogActions}>
          <button onClick={() => onChoose("cancel")}>{t("취소")}</button>
          <button onClick={() => onChoose("discard")}>{t("저장 안 함")}</button>
          <button
            className={styles.primaryButton}
            onClick={() => onChoose("save")}
          >
            {t("저장")}
          </button>
        </div>
      </div>
    </div>
  );
}
