import { beforeEach, expect, it, vi } from "vitest";
import {
  launchApi,
  type LaunchApi,
  type LaunchTarget,
  type Project,
} from "../workspace/api";
import { EXTERNAL_PROJECT, useWorkspace } from "../workspace/store";
import { followLink, registerExternalFolder } from "./actions";
import { startWorkspace } from "./launch";
import { useUi } from "./uiStore";

const notes: Project = { name: "Notes", path: "C:/notes" };
const work: Project = { name: "Work", path: "C:/work" };

function setup(requests: LaunchTarget[]) {
  const projects = [notes, work];
  let notify = () => {};
  const api = {
    take: vi.fn(async () => requests.shift() ?? null),
    register: vi.fn(),
    link: vi.fn(),
    listen: vi.fn(async (onRequest: () => void) => {
      notify = onRequest;
      return () => {};
    }),
  } satisfies LaunchApi;
  const initialize = vi.fn(async (_desktop: boolean, start?: Project) =>
    useWorkspace.setState({
      initialized: true,
      projects,
      project:
        start?.kind === "external"
          ? start
          : (projects.find((project) => project.path === start?.path) ?? notes),
    }),
  );
  const refresh = vi.fn(async () => {});
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
    refresh,
  });
  return {
    api,
    initialize,
    refresh,
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
  expect(initialize).toHaveBeenCalledWith(
    true,
    expect.objectContaining({ path: work.path }),
  );
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

it("프로젝트 밖 파일은 묻지 않고 External로 열고, 다른 폴더 파일도 같은 External에 추가", async () => {
  const outside = (path: string): LaunchTarget => ({
    kind: "external",
    path,
    name: path.split("/").pop()!,
  });
  const { api, activate, open, refresh, request } = setup([
    outside("C:/downloads/readme.md"),
  ]);
  startWorkspace(true, api);
  await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  expect(useUi.getState().actionRequest).toBeNull();
  expect(useWorkspace.getState().project).toEqual(EXTERNAL_PROJECT);
  expect(activate).not.toHaveBeenCalled();
  expect(open).toHaveBeenLastCalledWith({
    name: "readme.md",
    path: "C:/downloads/readme.md",
    isDirectory: false,
  });

  request(outside("D:/other/notes.md"));
  await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(2));
  expect(activate).not.toHaveBeenCalled();
  expect(refresh).toHaveBeenCalled();
  expect(useWorkspace.getState().activeId).toBe("D:/other/notes.md");
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

it("External 폴더를 등록하면 그 폴더의 탭만 상대 경로로 이어서 프로젝트로 전환", async () => {
  const folder = "C:/downloads";
  const registered: Project = { name: "downloads", path: "//?/C:/downloads" };
  const register = vi
    .spyOn(launchApi, "register")
    .mockResolvedValue(registered);
  const activate = vi.fn(async () => true);
  const document = (id: string) => ({
    id,
    name: id.split("/").pop()!,
    folder: id.split("/").slice(0, -1).join("/"),
    content: "",
    savedContent: "",
  });
  useWorkspace.setState({
    desktop: true,
    project: EXTERNAL_PROJECT,
    documents: [
      document("C:/downloads/a.md"),
      document("D:/other/b.md"),
      document("C:/downloads/sub/c.md"),
    ],
    activeId: "D:/other/b.md",
    activate,
  });
  await registerExternalFolder(folder);
  expect(register).toHaveBeenCalledWith(folder);
  expect(activate).toHaveBeenCalledWith(registered);
  expect(useWorkspace.getState().sessions[registered.path]).toMatchObject({
    paths: ["a.md", "sub/c.md"],
    activeId: "a.md",
  });
  expect(useWorkspace.getState().projects).toContain(registered);
});

it("External 문서의 링크는 대상 파일을 External에 추가한 뒤 연다", async () => {
  const link = vi.spyOn(launchApi, "link").mockResolvedValue({
    kind: "external",
    path: "C:/Downloads/Notes.md",
    name: "Notes.md",
  });
  const { open, refresh } = setup([]);
  useWorkspace.setState({ desktop: true, project: EXTERNAL_PROJECT });
  await followLink(
    { kind: "local", path: "C:/downloads/notes.md", hash: "" },
    "C:/downloads/readme.md",
  );
  expect(link).toHaveBeenCalledWith(
    "C:/downloads/readme.md",
    "C:/downloads/notes.md",
  );
  expect(refresh).toHaveBeenCalled();
  expect(open).toHaveBeenCalledWith({
    path: "C:/Downloads/Notes.md",
    name: "Notes.md",
    isDirectory: false,
  });

  link.mockRejectedValueOnce("파일을 찾을 수 없습니다: missing.md");
  await followLink(
    { kind: "local", path: "C:/downloads/missing.md", hash: "" },
    "C:/downloads/readme.md",
  );
  expect(open).toHaveBeenCalledTimes(1);
  expect(useWorkspace.getState().error).toBe(
    "파일을 찾을 수 없습니다: missing.md",
  );
});
