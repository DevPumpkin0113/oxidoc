import { useEffect, useRef, type ComponentProps, type DragEvent } from "react";
import { sameDocumentPath, useWorkspace } from "../workspace/store";
import {
  dragType,
  endFileDrag,
  useTreeDrag,
  type DragSource,
} from "../workspace/treeDrag";
import styles from "../App.module.css";

const FOLDER_HOVER_DELAY_MS = 700;

export default function TreeDropTarget({
  folderPath,
  className = "",
  ...props
}: ComponentProps<"summary"> & { folderPath: string }) {
  const highlighted = useTreeDrag((state) => state.over === folderPath);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelHover() {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
  }
  useEffect(() => {
    if (!highlighted) cancelHover();
  }, [highlighted]);
  useEffect(() => {
    return cancelHover;
  }, [folderPath]);
  function sourceFor(event: DragEvent): DragSource | null {
    const { desktop, busy, project } = useWorkspace.getState();
    const { source } = useTreeDrag.getState();
    if (
      !desktop ||
      busy ||
      !source ||
      project?.path !== source.root ||
      !Array.from(event.dataTransfer.types).includes(dragType)
    )
      return null;
    const parent = source.path.split("/").slice(0, -1).join("/");
    return sameDocumentPath(parent, folderPath) ? null : source;
  }
  return (
    <summary
      {...props}
      className={`${className} ${highlighted ? styles.treeDropTarget : ""}`}
      onDragOver={(event) => {
        const source = sourceFor(event);
        if (!source) {
          cancelHover();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        useTreeDrag.setState({ over: folderPath });
        const details = event.currentTarget.parentElement;
        if (
          hoverTimer.current === null &&
          details instanceof HTMLDetailsElement &&
          !details.open
        ) {
          hoverTimer.current = setTimeout(() => {
            hoverTimer.current = null;
            const drag = useTreeDrag.getState();
            const state = useWorkspace.getState();
            if (
              drag.source === source &&
              drag.over === folderPath &&
              state.desktop &&
              !state.busy &&
              state.project?.path === source.root &&
              details.isConnected &&
              !details.open
            )
              details.open = true;
          }, FOLDER_HOVER_DELAY_MS);
        }
      }}
      onDragLeave={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        cancelHover();
        if (useTreeDrag.getState().over === folderPath)
          useTreeDrag.setState({ over: null });
      }}
      onDrop={(event) => {
        cancelHover();
        const source = sourceFor(event);
        if (!source) return;
        event.preventDefault();
        event.stopPropagation();
        const matches =
          event.dataTransfer.getData(dragType) === JSON.stringify(source);
        endFileDrag();
        if (!matches) return;
        const details = event.currentTarget.parentElement;
        void useWorkspace
          .getState()
          .moveFile(source.path, folderPath)
          .then((moved) => {
            if (
              moved &&
              details instanceof HTMLDetailsElement &&
              details.isConnected
            )
              details.open = true;
          });
      }}
    />
  );
}
