import { translateError, t } from "../settings/i18n";
import { useState } from "react";
import {
  effectiveLanguage,
  useSettings,
  type Settings,
} from "../settings/store";
import { themes } from "../settings/themes";
import styles from "../App.module.css";
import AppUpdate from "./AppUpdate";
export default function SettingsPanel({
  onInstallUpdate,
}: {
  onInstallUpdate: () => Promise<void>;
}) {
  const state = useSettings();
  const { settings, update, reset, error, version, initialized } = state;
  const [confirmReset, setConfirmReset] = useState(false);
  const sizes: {
    key: "uiFontSize" | "editorFontSize" | "previewFontSize";
    label: string;
    min: number;
    max: number;
  }[] = [
    { key: "uiFontSize", label: t("인터페이스"), min: 11, max: 20 },
    { key: "editorFontSize", label: t("편집기"), min: 10, max: 32 },
    { key: "previewFontSize", label: t("미리보기"), min: 12, max: 32 },
  ];
  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    void update({ [key]: value });
  }
  return (
    <section className={styles.settingsPanel} aria-label={t("설정")}>
      <div className={styles.settingsHeading}>
        <div>
          <p>OXIDOC</p>
          <h1>{t("설정")}</h1>
          <p>{t("나에게 맞는 작업 공간")}</p>
        </div>
      </div>
      {error ? (
        <p className={styles.settingsError} role="alert">
          {translateError(error)}
        </p>
      ) : null}
      <fieldset disabled={!initialized}>
        <legend>{t("일반")}</legend>
        <div className={styles.settingRow}>
          <div>
            <label htmlFor="setting-language">{t("표시 언어")}</label>
            <p>{t("시스템 언어에 맞춰 한국어 또는 영어 자동 선택")}</p>
          </div>
          <select
            id="setting-language"
            value={settings.language}
            onChange={(e) =>
              set("language", e.target.value as Settings["language"])
            }
          >
            <option value="system">{t("시스템")}</option>
            <option value="ko">{t("한국어")}</option>
            <option value="en">English</option>
          </select>
        </div>
        <p className={styles.settingsHint}>
          {effectiveLanguage(state) === "ko"
            ? t("현재 언어: 한국어")
            : t("현재 언어: 영어")}
        </p>
      </fieldset>
      <fieldset disabled={!initialized}>
        <legend>{t("테마")}</legend>
        <div className={styles.settingRow}>
          <div>
            <label htmlFor="setting-mode">{t("색상 모드")}</label>
            <p>{t("시스템 모드 변경 시 라이트·다크 테마 자동 전환")}</p>
          </div>
          <select
            id="setting-mode"
            value={settings.mode}
            onChange={(e) => set("mode", e.target.value as Settings["mode"])}
          >
            <option value="system">{t("시스템")}</option>
            <option value="light">{t("라이트")}</option>
            <option value="dark">{t("다크")}</option>
          </select>
        </div>
        {(["light", "dark"] as const).map((kind) => (
          <div className={styles.themeGroup} key={kind}>
            <h3>{kind === "light" ? t("라이트 테마") : t("다크 테마")}</h3>
            <div className={styles.themeGrid}>
              {themes
                .filter((theme) => theme.kind === kind)
                .map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className={styles.themeCard}
                    aria-label={theme.name}
                    aria-pressed={
                      settings[
                        kind === "light" ? "lightTheme" : "darkTheme"
                      ] === theme.id
                    }
                    onClick={() =>
                      set(
                        kind === "light" ? "lightTheme" : "darkTheme",
                        theme.id,
                      )
                    }
                  >
                    <span
                      className={styles.themeSample}
                      style={{
                        background: theme.background,
                        color: theme.text,
                        borderColor: theme.border,
                      }}
                      aria-hidden="true"
                    >
                      <span
                        style={{
                          background: theme.surface,
                          borderColor: theme.border,
                        }}
                      />
                      <span>
                        <b style={{ color: theme.accent }}># Markdown</b>
                        <i style={{ background: theme.muted }} />
                        <i style={{ background: theme.accent }} />
                      </span>
                    </span>
                    <span>{theme.name}</span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </fieldset>
      <fieldset disabled={!initialized}>
        <legend>{t("글꼴 크기")}</legend>
        {sizes.map((size) => (
          <div className={styles.settingRow} key={size.key}>
            <div>
              <label htmlFor={`setting-${size.key}`}>{size.label}</label>
              <p>
                {size.min}–{size.max} px
              </p>
            </div>
            <div className={styles.fontControl}>
              <input
                id={`setting-${size.key}`}
                type="range"
                min={size.min}
                max={size.max}
                step={1}
                value={settings[size.key]}
                onChange={(e) => set(size.key, Number(e.target.value))}
              />
              <output htmlFor={`setting-${size.key}`}>
                {settings[size.key]} px
              </output>
            </div>
          </div>
        ))}
        <p className={styles.settingsHint}>{t("변경 즉시 적용·자동 저장")}</p>
      </fieldset>
      <fieldset>
        <legend>{t("앱 정보 및 업데이트")}</legend>
        <div className={styles.settingRow}>
          <div>
            <strong>Oxidoc</strong>
            <p>{t("현재 버전")}</p>
          </div>
          <span className={styles.versionBadge}>v{version}</span>
        </div>
        <AppUpdate onInstall={onInstallUpdate} />
      </fieldset>
      <div className={styles.settingsReset}>
        {confirmReset ? (
          <>
            <span>{t("모든 설정을 기본값으로 되돌릴까요?")}</span>
            <button
              onClick={() => {
                void reset();
                setConfirmReset(false);
              }}
            >
              {t("초기화 확인")}
            </button>
            <button onClick={() => setConfirmReset(false)}>{t("취소")}</button>
          </>
        ) : (
          <button disabled={!initialized} onClick={() => setConfirmReset(true)}>
            {t("기본값으로 초기화")}
          </button>
        )}
      </div>
    </section>
  );
}
