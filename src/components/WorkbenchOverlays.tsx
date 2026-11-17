import { useWorkspace } from "../workspace/store";
import { resolveAction, resolveConfirmation } from "../workbench/dialogs";
import { useUi } from "../workbench/uiStore";
import ActionDialog from "./ActionDialog";
import CommandPalette from "./CommandPalette";
import ContextMenu from "./ContextMenu";
import LinkUpdateDialog from "./LinkUpdateDialog";
import ProjectReplace from "./ProjectReplace";
import QuickOpen from "./QuickOpen";
import UnsavedDialog from "./UnsavedDialog";

/** Dialogs, palettes and menus rendered above the workbench. */
export default function WorkbenchOverlays() {
  const root = useWorkspace((state) => state.project?.path);
  const ui = useUi();
  const suspended = Boolean(ui.menu);
  return (
    <>
      {ui.actionRequest ? (
        <ActionDialog request={ui.actionRequest} onResolve={resolveAction} />
      ) : null}
      {ui.palette ? (
        <CommandPalette
          suspended={suspended}
          commands={ui.paletteCommands}
          onClose={() => useUi.setState({ palette: false })}
        />
      ) : null}
      {ui.quickOpen && root ? (
        <QuickOpen
          key={root}
          root={root}
          suspended={suspended}
          onClose={() => useUi.setState({ quickOpen: false })}
        />
      ) : null}
      {ui.replaceOpen && root ? (
        <ProjectReplace
          key={root}
          root={root}
          suspended={suspended}
          onClose={() => useUi.setState({ replaceOpen: false })}
        />
      ) : null}
      {ui.linkUpdate ? (
        <LinkUpdateDialog
          request={ui.linkUpdate}
          onClose={() => useUi.setState({ linkUpdate: null })}
        />
      ) : null}
      {ui.menu ? (
        <ContextMenu
          {...ui.menu}
          onClose={() => useUi.setState({ menu: null })}
        />
      ) : null}
      {ui.confirmation ? (
        <UnsavedDialog
          names={ui.confirmation.names}
          onChoose={resolveConfirmation}
        />
      ) : null}
    </>
  );
}
