import { t } from "../settings/i18n";
import { useWorkspace, type Layout } from "../workspace/store";
import type { DocumentSummary } from "../workspace/selectors";
import { editorAction, setView, toggleOutline } from "../workbench/actions";
import { showContext } from "../workbench/dialogs";
import { runAppCommand } from "../workbench/paletteCommands";
import { outlineTrigger } from "../workbench/uiStore";
import type { MenuItem } from "./ContextMenu";
import Icon, { type IconName } from "./Icon";
import styles from "./DocumentToolbar.module.css";

/** Label with its shortcut, the same way for every toolbar tooltip. */
const tip = (label: string, shortcut?: string) =>
  shortcut ? `${t(label)} (${shortcut})` : t(label);

const toggleSync = () => {
  const { layout, setLayout } = useWorkspace.getState();
  setLayout({ sync: !layout.sync });
};

function ToolButton({
  icon,
  label,
  shortcut,
  secondary,
  ...props
}: {
  icon: IconName;
  label: string;
  shortcut?: string;
  /** Moves into the "more" menu when the toolbar is narrow. */
  secondary?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: React.Ref<HTMLButtonElement>;
  }) {
  return (
    <button
      type="button"
      className={`${styles.toolButton} ${secondary ? styles.secondary : ""}`}
      aria-label={t(label)}
      title={tip(label, shortcut)}
      {...props}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

const Divider = ({ secondary }: { secondary?: boolean }) => (
  <span
    className={`${styles.divider} ${secondary ? styles.secondary : ""}`}
    aria-hidden="true"
  />
);

export default function DocumentToolbar({
  document,
}: {
  document: DocumentSummary;
}) {
  const projectName = useWorkspace((state) => state.project?.name);
  const busy = useWorkspace((state) => state.busy);
  const desktop = useWorkspace((state) => state.desktop);
  const view = useWorkspace((state) => state.layout.view);
  const outline = useWorkspace((state) => state.layout.outline);
  const sync = useWorkspace((state) => state.layout.sync);
  const views: { id: Layout["view"]; label: string; icon: IconName }[] = [
    { id: "edit", label: t("편집"), icon: "code" },
    { id: "split", label: t("분할 보기"), icon: "split" },
    { id: "preview", label: t("미리보기"), icon: "preview" },
  ];

  // Buttons hidden on a narrow toolbar, offered from the "more" menu instead.
  function showMore(event: React.MouseEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const items: MenuItem[] = [
      {
        label: t("실행 취소"),
        icon: "undo",
        shortcut: "Ctrl+Z",
        disabled: busy,
        run: () => editorAction("undo"),
      },
      {
        label: t("다시 실행"),
        icon: "redo",
        shortcut: "Ctrl+Y",
        disabled: busy,
        run: () => editorAction("redo"),
      },
      { type: "separator", id: "more-view" },
      {
        label: t("문서 개요"),
        icon: "outline",
        checked: outline,
        run: toggleOutline,
      },
      {
        label: t("스크롤 동기화"),
        icon: "sync",
        checked: sync,
        allowBusy: true,
        run: toggleSync,
      },
      { type: "separator", id: "more-save" },
      {
        label: t("다른 이름으로 저장"),
        icon: "saveAs",
        shortcut: "Ctrl+Shift+S",
        requiresDesktop: true,
        disabled: busy || !desktop,
        run: () => runAppCommand("save-as"),
      },
    ];
    showContext(t("더 보기"), items, box.left, box.bottom, event.currentTarget);
  }

  return (
    <div className={styles.documentToolbar}>
      <div className={styles.breadcrumb}>
        <Icon name="book" size={13} />
        <span>{projectName ?? t("작업 공간")}</span>
        <Icon name="chevron" size={11} />
        {document.folder ? (
          <>
            <span>{document.folder}</span>
            <Icon name="chevron" size={11} />
          </>
        ) : null}
        <strong>{document.name}</strong>
      </div>
      <div className={styles.documentTools}>
        <ToolButton
          icon="search"
          label="문서 내 찾기"
          shortcut="Ctrl F"
          onClick={() => runAppCommand("find")}
        />
        <ToolButton
          icon="findReplace"
          label="문서 내 바꾸기"
          shortcut="Ctrl H"
          onClick={() => runAppCommand("replace")}
        />
        <Divider secondary />
        <ToolButton
          icon="undo"
          label="실행 취소"
          shortcut="Ctrl Z"
          secondary
          disabled={busy}
          onClick={() => editorAction("undo")}
        />
        <ToolButton
          icon="redo"
          label="다시 실행"
          shortcut="Ctrl Y"
          secondary
          disabled={busy}
          onClick={() => editorAction("redo")}
        />
        <Divider secondary />
        <ToolButton
          icon="outline"
          label="문서 개요"
          secondary
          ref={outlineTrigger}
          aria-pressed={outline}
          aria-expanded={outline}
          aria-controls="document-outline"
          onClick={toggleOutline}
        />
        <ToolButton
          icon="sync"
          label="스크롤 동기화"
          secondary
          aria-pressed={sync}
          onClick={toggleSync}
        />
        <Divider />
        <ToolButton
          icon="saveAs"
          label="다른 이름으로 저장"
          shortcut="Ctrl Shift S"
          secondary
          disabled={busy || !desktop}
          onClick={() => runAppCommand("save-as")}
        />
        <button
          type="button"
          className={styles.saveButton}
          aria-label={t("저장")}
          disabled={busy || !desktop || !document.dirty}
          onClick={() => runAppCommand("save")}
          title={tip("저장", "Ctrl S")}
        >
          <Icon name="save" size={15} />
          <span className={styles.saveLabel}>{t("저장")}</span>
        </button>
        <button
          type="button"
          className={`${styles.toolButton} ${styles.moreButton}`}
          aria-label={t("더 보기")}
          aria-haspopup="menu"
          title={t("더 보기")}
          onClick={showMore}
        >
          <Icon name="ellipsis" size={15} />
        </button>
        <div
          className={styles.viewSwitch}
          role="group"
          aria-label={t("문서 보기 방식")}
        >
          {views.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? styles.activeView : ""}
              aria-label={item.label}
              title={item.label}
              aria-pressed={view === item.id}
              onClick={() => setView(item.id)}
            >
              <Icon name={item.icon} size={15} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
