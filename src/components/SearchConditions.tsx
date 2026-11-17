import { t } from "../settings/i18n";
import type { SearchOptions } from "../workspace/searchOptions";
import Icon, { type IconName } from "./Icon";
import styles from "./SearchConditions.module.css";

type ControlProps = Record<`data-${string}`, boolean>;

const toggles: {
  key: "caseSensitive" | "wholeWord" | "regex";
  icon: IconName;
  label: string;
  shortcut: string;
}[] = [
  {
    key: "caseSensitive",
    icon: "caseSensitive",
    label: "대소문자 구분",
    shortcut: "Alt C",
  },
  {
    key: "wholeWord",
    icon: "wholeWord",
    label: "단어 단위",
    shortcut: "Alt W",
  },
  { key: "regex", icon: "regex", label: "정규식 사용", shortcut: "Alt R" },
];

/** Case, whole-word and regex toggles shown inside a search input. */
export function SearchToggles({
  options,
  onChange,
  disabled,
  controlProps,
}: {
  options: SearchOptions;
  onChange: (options: SearchOptions) => void;
  disabled?: boolean;
  controlProps?: ControlProps;
}) {
  return (
    <span className={styles.toggles}>
      {toggles.map((toggle) => (
        <button
          {...controlProps}
          key={toggle.key}
          type="button"
          className={styles.toggle}
          aria-label={t(toggle.label)}
          aria-pressed={options[toggle.key]}
          title={`${t(toggle.label)} (${toggle.shortcut})`}
          disabled={disabled}
          onClick={() =>
            onChange({ ...options, [toggle.key]: !options[toggle.key] })
          }
        >
          <Icon name={toggle.icon} size={14} />
        </button>
      ))}
    </span>
  );
}

/** Include and exclude glob inputs. */
export function FilePatterns({
  options,
  onChange,
  disabled,
  idPrefix,
  controlProps,
}: {
  options: SearchOptions;
  onChange: (options: SearchOptions) => void;
  disabled?: boolean;
  idPrefix: string;
  controlProps?: ControlProps;
}) {
  const fields = [
    {
      key: "include",
      label: "포함할 파일",
      placeholder: "*.md, docs/**",
    },
    {
      key: "exclude",
      label: "제외할 파일",
      placeholder: "drafts, *.txt",
    },
  ] as const;
  return (
    <div className={styles.patterns}>
      {fields.map((field) => (
        <label
          key={field.key}
          className={styles.pattern}
          htmlFor={`${idPrefix}-${field.key}`}
        >
          <span>{t(field.label)}</span>
          <input
            autoComplete="off"
            {...controlProps}
            id={`${idPrefix}-${field.key}`}
            placeholder={field.placeholder}
            spellCheck={false}
            maxLength={2000}
            value={options[field.key]}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...options, [field.key]: event.target.value })
            }
          />
        </label>
      ))}
      <p className={styles.hint}>
        {t(
          "쉼표로 구분. 이름만 쓰면 모든 위치에 적용되고, 폴더는 안의 파일 전체에 적용",
        )}
      </p>
    </div>
  );
}
