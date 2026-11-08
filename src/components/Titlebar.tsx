import { t } from "../settings/i18n";
import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import Icon from "./Icon";
import styles from "../App.module.css";

export default function Titlebar() {
  const desktop = isTauri();
  const [maximized, setMaximized] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!desktop) return;
    const appWindow = getCurrentWindow();
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const update = () => {
      void appWindow
        .isMaximized()
        .then((value) => {
          if (!disposed) setMaximized(value);
        })
        .catch(() => {
          if (!disposed) setError(t("창 상태 확인 실패"));
        });
    };
    update();
    void appWindow
      .onResized(update)
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        if (!disposed) setError(t("창 상태 변경 감지 실패"));
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [desktop]);

  async function control(action: "minimize" | "toggleMaximize" | "close") {
    if (!desktop) return;
    try {
      setError("");
      await getCurrentWindow()[action]();
    } catch {
      setError(t("창 제어 실패 · 다시 시도해 주세요"));
    }
  }

  return (
    <>
      <header className={styles.titlebar}>
        <div className={styles.dragRegion} data-tauri-drag-region />
        <div className={styles.windowControls}>
          <button
            aria-label={t("최소화")}
            title={desktop ? t("최소화") : t("데스크톱 앱에서 사용")}
            disabled={!desktop}
            onClick={() => void control("minimize")}
          >
            <Icon name="minus" size={14} />
          </button>
          <button
            aria-label={maximized ? t("창 크기 복원") : t("최대화")}
            title={
              desktop
                ? maximized
                  ? t("창 크기 복원")
                  : t("최대화")
                : t("데스크톱 앱에서 사용")
            }
            disabled={!desktop}
            onClick={() => void control("toggleMaximize")}
          >
            <Icon name={maximized ? "restore" : "maximize"} size={13} />
          </button>
          <button
            className={styles.windowClose}
            aria-label={t("창 닫기")}
            title={desktop ? t("창 닫기") : t("데스크톱 앱에서 사용")}
            disabled={!desktop}
            onClick={() => void control("close")}
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      </header>
      {error ? (
        <div className={styles.windowError} role="alert">
          {error}
          <button aria-label={t("오류 알림 닫기")} onClick={() => setError("")}>
            <Icon name="close" size={14} />
          </button>
        </div>
      ) : null}
    </>
  );
}
