import { isTauri } from "@tauri-apps/api/core";
import { t } from "../settings/i18n";
import { useUpdater } from "../settings/updater";
import styles from "./AppUpdate.module.css";

export default function AppUpdate({
  onInstall,
}: {
  onInstall: () => Promise<void>;
}) {
  const { phase, version, notes, error, downloaded, total, check, download } =
    useUpdater();
  const disabled = !isTauri();
  const message = {
    idle: "GitHub Releases에서 최신 정식 버전을 확인합니다.",
    checking: "업데이트 확인 중…",
    current: "최신 버전입니다.",
    available: "새 버전을 사용할 수 있습니다.",
    downloading: "업데이트 다운로드 및 검증 중…",
    ready: "다운로드와 서명 검증이 완료되었습니다.",
    installing: "업데이트 설치 준비 중…",
    error:
      "업데이트를 확인하거나 다운로드하지 못했습니다. 네트워크와 릴리즈 배포 상태를 확인해 주세요.",
  }[phase];
  return (
    <div className={styles.update}>
      <p role="status">
        {disabled
          ? t("업데이트는 데스크톱 앱에서 사용할 수 있습니다.")
          : t(message)}
      </p>
      {version ? <strong>{t("새 버전: {0}", version)}</strong> : null}
      {phase === "downloading" ? (
        <div>
          <progress
            aria-label={t("다운로드 진행률")}
            max={total || undefined}
            value={total ? Math.min(downloaded, total) : undefined}
          />
          <span>
            {total
              ? `${Math.min(100, Math.round((downloaded / total) * 100))}%`
              : t("{0} MB 다운로드", (downloaded / 1048576).toFixed(1))}
          </span>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      {notes ? (
        <details>
          <summary>{t("릴리즈 내용")}</summary>
          <pre>{notes}</pre>
        </details>
      ) : null}
      <div className={styles.actions}>
        <button
          disabled={
            disabled ||
            ["checking", "downloading", "ready", "installing"].includes(phase)
          }
          onClick={() => void check()}
        >
          {t("업데이트 확인")}
        </button>
        {["available", "error"].includes(phase) && version ? (
          <button disabled={disabled} onClick={() => void download()}>
            {t("업데이트 다운로드")}
          </button>
        ) : null}
        {phase === "ready" || phase === "installing" ? (
          <button
            disabled={disabled || phase === "installing"}
            onClick={() => void onInstall()}
          >
            {t("설치 및 재시작")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
