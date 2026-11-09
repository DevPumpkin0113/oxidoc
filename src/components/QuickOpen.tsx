import { useEffect, useState } from "react";
import CommandPalette from "./CommandPalette";
import { workspaceApi, type Entry } from "../workspace/api";
import { sameDocumentPath, useWorkspace } from "../workspace/store";
import { t } from "../settings/i18n";

export default function QuickOpen({
  root,
  suspended,
  onClose,
}: {
  root: string;
  suspended: boolean;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<Entry[]>([]);
  const [status, setStatus] = useState(t("파일 목록 불러오는 중…"));
  useEffect(() => {
    let cancelled = false;
    const state = useWorkspace.getState();
    const task = state.desktop
      ? workspaceApi.advanced!.index(root)
      : Promise.resolve({
          entries: Object.values(state.tree)
            .flat()
            .filter((entry) => !entry.isDirectory),
          truncated: false,
          skipped: 0,
        });
    void task
      .then((result) => {
        if (cancelled) return;
        setFiles(result.entries);
        setStatus(
          result.truncated || result.skipped
            ? t("일부 파일 제외 · {0}개 파일", String(result.entries.length))
            : t("↑ ↓ 선택 · Enter 실행 · Esc 닫기"),
        );
      })
      .catch((error) => {
        if (!cancelled) setStatus(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [root]);
  return (
    <CommandPalette
      title={t("빠른 파일 열기")}
      inputLabel={t("파일명 또는 경로 검색")}
      placeholder={t("파일명 또는 경로 검색")}
      footer={status}
      suspended={suspended}
      onClose={onClose}
      commands={files.map((entry) => ({
        id: entry.path,
        label: entry.name,
        detail: entry.path,
        enabled: () => useWorkspace.getState().project?.path === root,
        run: async () => {
          await useWorkspace.getState().open(entry);
          const state = useWorkspace.getState();
          if (
            state.project?.path === root &&
            state.activeId &&
            sameDocumentPath(state.activeId, entry.path)
          )
            onClose();
          else setStatus(state.error || t("문서를 열 수 없습니다."));
        },
      }))}
    />
  );
}
