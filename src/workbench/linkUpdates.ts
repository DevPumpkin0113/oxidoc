import { workspaceApi, type ReplaceResult } from "../workspace/api";
import {
  planLinkUpdates,
  type LinkUpdate,
  type PathMove,
} from "../workspace/linkUpdates";
import { sameDocumentPath } from "../workspace/model";
import { useWorkspace } from "../workspace/store";
import { useUi } from "./uiStore";

/** A pending move whose links need the user's choice. */
export interface LinkUpdateRequest {
  move: PathMove;
  updates: LinkUpdate[];
  /** Some Markdown files were not read (project or size limits). */
  incomplete: boolean;
  perform: () => Promise<boolean>;
  resolve: (moved: boolean) => void;
}

/** Limits of one `apply_replace` call. */
const MAX_BATCH_FILES = 100;
const MAX_BATCH_BYTES = 20 * 1024 * 1024;
const utf8 = new TextEncoder();

/**
 * Runs a move or rename. When links in Markdown files would break, it first
 * asks whether to update them; otherwise it just moves.
 */
export async function moveWithLinks(
  move: PathMove,
  perform: () => Promise<boolean>,
): Promise<boolean> {
  const { desktop, project } = useWorkspace.getState();
  const advanced = workspaceApi.advanced;
  // A case-only rename keeps links working (paths compare without case).
  if (!desktop || !project || !advanced || sameDocumentPath(move.from, move.to))
    return perform();
  let texts: Awaited<ReturnType<typeof advanced.markdownTexts>>;
  let updates: LinkUpdate[];
  try {
    texts = await advanced.markdownTexts(project.path);
    if (useWorkspace.getState().project?.path !== project.path) return false;
    updates = planLinkUpdates(texts.files, move);
  } catch (error) {
    // Links are a convenience; the move the user asked for still happens.
    const moved = await perform();
    if (moved)
      useWorkspace.setState({
        error: `링크를 확인하지 못해 이동만 했습니다: ${String(error)}`,
      });
    return moved;
  }
  if (!updates.length) return perform();
  return new Promise((resolve) =>
    useUi.setState({
      linkUpdate: {
        move,
        updates,
        incomplete: texts.truncated || texts.skipped > 0,
        perform,
        resolve,
      },
    }),
  );
}

/** Writes link updates in batches that fit the replace command's limits. */
export async function applyLinkUpdates(updates: LinkUpdate[]) {
  const results: ReplaceResult[] = [];
  let batch: LinkUpdate[] = [];
  let bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    results.push(
      ...(await useWorkspace.getState().applyReplacements(
        batch.map(({ path, before, after, count }) => ({
          path,
          before,
          after,
          count,
        })),
      )),
    );
    batch = [];
    bytes = 0;
  };
  for (const update of updates) {
    const size =
      utf8.encode(update.before).length + utf8.encode(update.after).length;
    if (batch.length >= MAX_BATCH_FILES || bytes + size > MAX_BATCH_BYTES)
      await flush();
    batch.push(update);
    bytes += size;
  }
  await flush();
  return results;
}
