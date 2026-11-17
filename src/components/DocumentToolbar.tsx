import { t } from "../settings/i18n";
import { useWorkspace, type Layout } from "../workspace/store";
import type { DocumentSummary } from "../workspace/selectors";
import { editorAction, setView, toggleOutline } from "../workbench/actions";
import { runAppCommand } from "../workbench/paletteCommands";
import { outlineTrigger } from "../workbench/uiStore";
import Icon, { type IconName } from "./Icon";
import styles from "./DocumentToolbar.module.css";

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
        <button
          className={styles.toolButton}
          aria-label={t("문서 내 찾기")}
          title={t("찾기 (Ctrl F)")}
          onClick={() => runAppCommand("find")}
        >
          <Icon name="search" size={14} />
        </button>
        <button
          className={styles.toolButton}
          aria-label={t("바꾸기")}
          title={t("바꾸기 (Ctrl H)")}
          onClick={() => runAppCommand("replace")}
        >
          <Icon name="code" size={14} />
        </button>
        <button
          className={styles.toolButton}
          aria-label={t("실행 취소")}
          title={t("실행 취소 (Ctrl Z)")}
          disabled={busy}
          onClick={() => editorAction("undo")}
        >
          <Icon name="undo" size={14} />
        </button>
        <button
          className={styles.toolButton}
          aria-label={t("다시 실행")}
          title={t("다시 실행 (Ctrl Y)")}
          disabled={busy}
          onClick={() => editorAction("redo")}
        >
          <Icon name="undo" size={14} style={{ transform: "scaleX(-1)" }} />
        </button>
        <button
          className={styles.toolButton}
          aria-label={t("문서 개요")}
          title={t("문서 개요")}
          ref={outlineTrigger}
          aria-pressed={outline}
          aria-expanded={outline}
          aria-controls="document-outline"
          onClick={toggleOutline}
        >
          <Icon name="outline" size={14} />
        </button>
        <button
          className={styles.toolButton}
          aria-label={t("스크롤 동기화")}
          title={t("스크롤 동기화")}
          aria-pressed={sync}
          onClick={() => useWorkspace.getState().setLayout({ sync: !sync })}
        >
          <Icon name="sync" size={14} />
        </button>
        <button
          className={styles.toolButton}
          disabled={busy || !desktop}
          aria-label={t("다른 이름으로 저장")}
          title={t("다른 이름으로 저장 (Ctrl Shift S)")}
          onClick={() => runAppCommand("save-as")}
        >
          <Icon name="save" size={14} />
        </button>
        <button
          className={styles.saveButton}
          disabled={busy || !desktop || !document.dirty}
          onClick={() => runAppCommand("save")}
          title={t("저장 (Ctrl S)")}
        >
          <Icon name="save" size={15} />
          <span>{t("저장")}</span>
        </button>
        <div className={styles.viewSwitch} aria-label={t("문서 보기 방식")}>
          {views.map((item) => (
            <button
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
