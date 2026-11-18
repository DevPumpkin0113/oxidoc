import { beforeEach, expect, it, vi } from "vitest";
import {
  workspaceApi,
  type LaunchApi,
  type LaunchTarget,
  type Project,
} from "../workspace/api";
import { useWorkspace } from "../workspace/store";
import { resolveAction } from "./dialogs";
import { startWorkspace } from "./launch";
import { useUi } from "./uiStore";

const notes: Project = { name: "Notes", path: "C:/notes" };
const work: Project = { name: "Work", path: "C:/work" };
const downloads: Project = { name: "Downloads", path: "C:/downloads" };

function setup(requests: LaunchTarget[], registered = [notes, work]) {
  let projects = registered;
  let notify = () => {};
  const api = {
    take: vi.fn(async () => requests.shift() ?? null),
    register: vi.fn(async () => {
      projects = [...projects, downloads];
      return downloads;
    }),
    listen: vi.fn(async (onRequest: () => void) => {
      notify = onRequest;
      return () => {};
    }),
  } satisfies LaunchApi;
  vi.spyOn(workspaceApi, "projects").mockImplementation(async () => projects);
  const initialize = vi.fn(async (_desktop: boolean, start?: string) =>
    useWorkspace.setState({
      initialized: true,
      projects,
      project: projects.find((project) => project.path === start) ?? notes,
    }),
  );
  const activate = vi.fn(async (project: Project) => {
    useWorkspace.setState({ project });
    return true;
  });
  const open = vi.fn(async ({ path }: { path: string }) =>
    useWorkspace.setState({ activeId: path }),
  );
  useWorkspace.setState({
    initialize,
    activate,
    open,
    expand: vi.fn(async () => {}),
  });
  return {
    api,
    initialize,
    activate,
    open,
    request: (target: LaunchTarget) => {
      requests.push(target);
      notify();
    },
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  useWorkspace.setState(useWorkspace.getInitialState(), true);
  useUi.setState({ actionRequest: null, revealTarget: null });
});

it("시작 시 연 파일의 프로젝트로 바로 시작하고 파일을 열어 탐색기에 표시", async () => {
  const { api, initialize, activate, open } = setup([
    { kind: "project", root: work.path, path: "docs/a.md", name: "a.md" },
  ]);
  startWorkspace(true, api);
  await vi.waitFor(() =>
    expect(useUi.getState().revealTarget).toBe("docs/a.md"),
  );
  expect(initialize).toHaveBeenCalledWith(true, work.path);
  expect(activate).not.toHaveBeenCalled();
  expect(open).toHaveBeenCalledWith({
    name: "a.md",
    path: "docs/a.md",
    isDirectory: false,
  });
});

it("실행 중에 넘어온 파일은 그 프로젝트로 전환해 연다", async () => {
  const { api, activate, open, request } = setup([]);
  startWorkspace(true, api);
  await vi.waitFor(() => expect(api.listen).toHaveBeenCalled());
  await vi.waitFor(() => expect(useWorkspace.getState().project).toBe(notes));
  request({ kind: "project", root: work.path, path: "b.md", name: "b.md" });
  await vi.waitFor(() => expect(open).toHaveBeenCalled());
  expect(activate).toHaveBeenCalledWith(work);
  expect(useWorkspace.getState().activeId).toBe("b.md");
});

it("프로젝트 밖 파일은 폴더 등록을 물어보고, 수락하면 등록 후 열고 취소하면 아무것도 안 함", async () => {
  const outside: LaunchTarget = {
    kind: "outside",
    folder: "C:\\downloads",
    name: "readme.md",
  };
  const { api, activate, open, request } = setup([outside]);
  startWorkspace(true, api);
  await vi.waitFor(() =>
    expect(useUi.getState().actionRequest?.body).toContain("C:\\downloads"),
  );
  resolveAction(null);
  await vi.waitFor(() => expect(api.take).toHaveBeenCalledTimes(2));
  expect(api.register).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();

  request(outside);
  await vi.waitFor(() => expect(useUi.getState().actionRequest).not.toBeNull());
  resolveAction("yes");
  await vi.waitFor(() => expect(open).toHaveBeenCalled());
  expect(api.register).toHaveBeenCalledTimes(1);
  expect(useWorkspace.getState().projects).toContain(downloads);
  expect(activate).toHaveBeenCalledWith(downloads);
  expect(open).toHaveBeenCalledWith({
    name: "readme.md",
    path: "readme.md",
    isDirectory: false,
  });
});

it("확인할 수 없는 시작 요청도 작업 공간은 정상 시작하고 오류만 표시", async () => {
  const { api, initialize } = setup([]);
  api.take.mockRejectedValueOnce("열려는 파일을 찾을 수 없습니다.");
  startWorkspace(true, api);
  await vi.waitFor(() =>
    expect(useWorkspace.getState().error).toContain(
      "열려는 파일을 찾을 수 없습니다.",
    ),
  );
  expect(initialize).toHaveBeenCalledWith(true, undefined);
});
