import { translateError, t } from "../settings/i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  effectiveLanguage,
  MAX_FONT_FAMILY_LENGTH,
  normalizeFontFamily,
  useSettings,
  type Settings,
} from "../settings/store";
import { themes } from "../settings/themes";
import styles from "./SettingsPanel.module.css";
import AppUpdate from "./AppUpdate";
import Icon from "./Icon";

/** One searchable setting: its row and the text a search matches. */
interface SettingItem {
  id: string;
  /** Label, description and extra words (e.g. theme names) for search. */
  text: string[];
  render: () => ReactNode;
}
interface SettingSection {
  id: string;
  title: string;
  items: SettingItem[];
}

/** A section counts as current once its top passes this far into the view. */
const ACTIVE_SECTION_OFFSET = 80;

function Row({
  label,
  description,
  htmlFor,
  children,
}: {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.settingRow}>
      <div>
        {htmlFor ? (
          <label htmlFor={htmlFor}>{label}</label>
        ) : (
          <strong>{label}</strong>
        )}
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

const matches = (item: SettingItem, query: string) =>
  item.text.some((text) =>
    text.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

export default function SettingsPanel({
  onInstallUpdate,
}: {
  onInstallUpdate: () => Promise<void>;
}) {
  const state = useSettings();
  const { settings, update, reset, error, version, initialized } = state;
  const [confirmReset, setConfirmReset] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("general");
  const panel = useRef<HTMLElement>(null);
  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    void update({ [key]: value });
  }
  const fontSize = (
    key: "uiFontSize" | "editorFontSize" | "previewFontSize",
    label: string,
    min: number,
    max: number,
  ): SettingItem => ({
    id: key,
    text: [label, t("글꼴 크기")],
    render: () => (
      <Row
        label={label}
        description={`${min}–${max} px`}
        htmlFor={`setting-${key}`}
      >
        <div className={styles.fontControl}>
          <input
            id={`setting-${key}`}
            type="range"
            min={min}
            max={max}
            step={1}
            value={settings[key]}
            onChange={(e) => set(key, Number(e.target.value))}
          />
          <output htmlFor={`setting-${key}`}>{settings[key]} px</output>
        </div>
      </Row>
    ),
  });
  const themeItem = (kind: "light" | "dark"): SettingItem => {
    const key = kind === "light" ? "lightTheme" : "darkTheme";
    const label = kind === "light" ? t("라이트 테마") : t("다크 테마");
    const options = themes.filter((theme) => theme.kind === kind);
    return {
      id: key,
      text: [label, t("테마"), ...options.map((theme) => theme.name)],
      render: () => (
        <div className={styles.themeGroup}>
          <h3>{label}</h3>
          <div className={styles.themeGrid}>
            {options.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className={styles.themeCard}
                aria-label={theme.name}
                aria-pressed={settings[key] === theme.id}
                onClick={() => set(key, theme.id)}
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
      ),
    };
  };

  const sections: SettingSection[] = [
    {
      id: "general",
      title: t("일반"),
      items: [
        {
          id: "language",
          text: [t("표시 언어"), "language", "한국어", "English"],
          render: () => (
            <Row
              label={t("표시 언어")}
              htmlFor="setting-language"
              description={t(
                "시스템 언어에 맞춰 한국어 또는 영어 자동 선택 · 지금 {0}",
                effectiveLanguage(state) === "ko" ? t("한국어") : "English",
              )}
            >
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
            </Row>
          ),
        },
      ],
    },
    {
      id: "appearance",
      title: t("모양"),
      items: [
        {
          id: "mode",
          text: [t("색상 모드"), t("라이트"), t("다크"), t("테마")],
          render: () => (
            <Row
              label={t("색상 모드")}
              htmlFor="setting-mode"
              description={t("시스템 모드 변경 시 라이트·다크 테마 자동 전환")}
            >
              <select
                id="setting-mode"
                value={settings.mode}
                onChange={(e) =>
                  set("mode", e.target.value as Settings["mode"])
                }
              >
                <option value="system">{t("시스템")}</option>
                <option value="light">{t("라이트")}</option>
                <option value="dark">{t("다크")}</option>
              </select>
            </Row>
          ),
        },
        themeItem("light"),
        themeItem("dark"),
        fontSize("uiFontSize", t("인터페이스 글꼴 크기"), 11, 20),
      ],
    },
    {
      id: "editor",
      title: t("편집기"),
      items: [
        {
          id: "editorFontFamily",
          text: [t("글꼴"), "font"],
          render: () => (
            <EditorFontInput
              key={settings.editorFontFamily}
              value={settings.editorFontFamily}
              onCommit={(value) => set("editorFontFamily", value)}
            />
          ),
        },
        fontSize("editorFontSize", t("편집기 글꼴 크기"), 10, 32),
        {
          id: "editorWordWrap",
          text: [t("자동 줄 바꿈"), "word wrap"],
          render: () => (
            <Row
              label={t("자동 줄 바꿈")}
              htmlFor="setting-editorWordWrap"
              description={t("편집기 폭에 맞춰 긴 줄을 접어서 표시")}
            >
              <input
                id="setting-editorWordWrap"
                type="checkbox"
                role="switch"
                className={styles.switch}
                checked={settings.editorWordWrap}
                onChange={(e) => set("editorWordWrap", e.target.checked)}
              />
            </Row>
          ),
        },
      ],
    },
    {
      id: "preview",
      title: t("미리보기"),
      items: [fontSize("previewFontSize", t("미리보기 글꼴 크기"), 12, 32)],
    },
    {
      id: "about",
      title: t("정보"),
      items: [
        {
          id: "version",
          text: [t("현재 버전"), t("업데이트"), "Oxidoc", version],
          render: () => (
            <>
              <Row label="Oxidoc" description={t("현재 버전")}>
                <span className={styles.versionBadge}>v{version}</span>
              </Row>
              <AppUpdate onInstall={onInstallUpdate} />
            </>
          ),
        },
        {
          id: "reset",
          text: [t("기본값으로 초기화"), "reset"],
          render: () => (
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
                  <button onClick={() => setConfirmReset(false)}>
                    {t("취소")}
                  </button>
                </>
              ) : (
                <button
                  disabled={!initialized}
                  onClick={() => setConfirmReset(true)}
                >
                  {t("기본값으로 초기화")}
                </button>
              )}
            </div>
          ),
        },
      ],
    },
  ];
  const searching = query.trim();
  const visible = sections
    .map((section) => ({
      ...section,
      items: searching
        ? section.items.filter(
            (item) =>
              matches(item, searching) ||
              section.title
                .toLocaleLowerCase()
                .includes(searching.toLocaleLowerCase()),
          )
        : section.items,
    }))
    .filter((section) => section.items.length);
  const visibleIds = visible.map((section) => section.id).join(" ");

  // The current section is the last one whose top has scrolled into view.
  useEffect(() => {
    const viewport = panel.current?.closest<HTMLElement>("#settings-panel");
    if (!viewport) return;
    const update = () => {
      const top = viewport.getBoundingClientRect().top + ACTIVE_SECTION_OFFSET;
      const headings = [
        ...viewport.querySelectorAll<HTMLElement>("[data-settings-section]"),
      ];
      const atEnd =
        viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2;
      const passed = headings.filter(
        (section) => section.getBoundingClientRect().top <= top,
      );
      const current = atEnd
        ? headings[headings.length - 1]
        : (passed[passed.length - 1] ?? headings[0]);
      if (current) setActive(current.dataset.settingsSection!);
    };
    update();
    viewport.addEventListener("scroll", update, { passive: true });
    return () => viewport.removeEventListener("scroll", update);
  }, [visibleIds]);

  function goTo(id: string) {
    setActive(id);
    const section = panel.current?.querySelector<HTMLElement>(
      `[data-settings-section="${id}"]`,
    );
    section?.scrollIntoView?.({ block: "start" });
    section?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }

  return (
    <section
      ref={panel}
      className={styles.settingsPanel}
      aria-label={t("설정")}
    >
      <div className={styles.settingsHeading}>
        <div>
          <p>OXIDOC</p>
          <h1>{t("설정")}</h1>
          <p>{t("변경 즉시 적용·자동 저장")}</p>
        </div>
        <div className={styles.search}>
          <Icon name="search" size={14} />
          <input
            type="search"
            autoComplete="off"
            aria-label={t("설정 검색")}
            placeholder={t("설정 검색")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && query) {
                e.preventDefault();
                e.stopPropagation();
                setQuery("");
              }
            }}
          />
        </div>
      </div>
      {error ? (
        <p className={styles.settingsError} role="alert">
          {translateError(error)}
        </p>
      ) : null}
      <div className={styles.layout}>
        <nav className={styles.sectionNav} aria-label={t("설정 섹션")}>
          {sections.map((section) => {
            const shown = visible.some((item) => item.id === section.id);
            return (
              <button
                key={section.id}
                type="button"
                aria-current={
                  shown && active === section.id ? "true" : undefined
                }
                disabled={!shown}
                onClick={() => goTo(section.id)}
              >
                {section.title}
              </button>
            );
          })}
        </nav>
        <div className={styles.sections}>
          {visible.map((section) => (
            <fieldset
              key={section.id}
              disabled={!initialized && section.id !== "about"}
              data-settings-section={section.id}
              aria-labelledby={`settings-section-${section.id}`}
            >
              <h2 id={`settings-section-${section.id}`} tabIndex={-1}>
                {section.title}
              </h2>
              {section.items.map((item) => (
                <div key={item.id}>{item.render()}</div>
              ))}
            </fieldset>
          ))}
          {!visible.length ? (
            <p className={styles.noResults} role="status">
              {t("'{0}'에 맞는 설정이 없습니다.", searching)}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Font names apply on Enter or blur, so half-typed names never reach the editor. */
function EditorFontInput({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [invalid, setInvalid] = useState(false);
  function commit(input: HTMLInputElement) {
    const family = normalizeFontFamily(input.value);
    setInvalid(family === null);
    if (family !== null && family !== value) onCommit(family);
  }
  return (
    <div className={styles.settingRow}>
      <div>
        <label htmlFor="setting-editorFontFamily">{t("글꼴")}</label>
        <p>
          {invalid
            ? t("글꼴 이름에는 문자·숫자·공백과 , ' \" . _ - 만 쓸 수 있음")
            : t("설치된 글꼴 이름을 쉼표로 구분해 입력, 비우면 기본 글꼴")}
        </p>
      </div>
      <input
        autoComplete="off"
        id="setting-editorFontFamily"
        className={styles.textInput}
        type="text"
        spellCheck={false}
        maxLength={MAX_FONT_FAMILY_LENGTH}
        placeholder="Cascadia Code, Consolas"
        defaultValue={value}
        aria-invalid={invalid}
        onBlur={(e) => commit(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(e.currentTarget);
          else if (e.key === "Escape") {
            e.currentTarget.value = value;
            setInvalid(false);
          }
        }}
      />
    </div>
  );
}
