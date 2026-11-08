import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectManager from "./ProjectManager";
import CommandPalette from "./CommandPalette";
import MarkdownPreview from "./MarkdownPreview";
import { useWorkspace } from "../workspace/store";
import { workspaceApi } from "../workspace/api";

beforeEach(() => useWorkspace.setState(useWorkspace.getInitialState(), true));
describe("프로젝트·명령 팔레트", () => {
  it("복수 태그 그룹·태그 없음·고유 프로젝트 개수 및 필터/열기 유지", async () => {
    const user = userEvent.setup(),
      activate = vi.fn();
    const shared = {
      name: "Shared",
      path: "C:/shared",
      tags: ["work", "hobby", "work"],
      favorite: true,
    };
    useWorkspace.setState({
      projects: [
        shared,
        { name: "Work", path: "C:/work", tags: ["work"], lastOpened: 10 },
        { name: "Hobby", path: "C:/hobby", tags: ["hobby"], lastOpened: 20 },
        { name: "Loose", path: "C:/loose", tags: [] },
      ],
    });
    render(
      <ProjectManager
        onActivate={activate}
        onRegister={vi.fn()}
        onManage={vi.fn()}
      />,
    );
    const work = screen.getByRole("region", { name: "work" });
    const hobby = screen.getByRole("region", { name: "hobby" });
    expect(
      within(work)
        .getAllByRole("button")
        .filter((button) => button.querySelector("strong"))
        .map((button) => button.textContent),
    ).toEqual(["Shared", "Work"]);
    expect(
      within(hobby).getByRole("button", { name: "Shared" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "태그 없음" })).getByRole(
        "button",
        { name: "Loose" },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("4개의 프로젝트")).toBeInTheDocument();
    await user.click(within(work).getByRole("button", { name: "Shared" }));
    expect(activate).toHaveBeenCalledWith(shared);
    await user.selectOptions(screen.getByLabelText("태그 필터"), "work");
    expect(
      screen.queryByRole("region", { name: "hobby" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("2개의 프로젝트")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("태그 필터"), "");
    await user.click(screen.getByLabelText("즐겨찾기만"));
    expect(screen.getByText("1개의 프로젝트")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Shared" })).toHaveLength(2);
    expect(
      screen.queryByRole("region", { name: "태그 없음" }),
    ).not.toBeInTheDocument();
  });
  it("팔레트 밖으로 포커스가 이동해도 Esc 닫기, IME 조합 중 Esc 보호", () => {
    const close = vi.fn();
    const { unmount } = render(
      <CommandPalette commands={[]} onClose={close} />,
    );
    screen.getByRole("combobox").blur();
    fireEvent.keyDown(document.body, { key: "Escape", isComposing: true });
    expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
    unmount();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledOnce();
  });
  it("닫기 버튼 키보드 접근·Tab 순환·Enter 닫기에서 명령 미실행", async () => {
    const user = userEvent.setup(),
      close = vi.fn(),
      run = vi.fn();
    render(
      <CommandPalette
        commands={[{ id: "a", label: "Alpha", run }]}
        onClose={close}
      />,
    );
    const input = screen.getByRole("combobox");
    const button = screen.getByRole("button", { name: "명령 팔레트 닫기" });
    await user.tab();
    expect(button).toHaveFocus();
    await user.tab();
    expect(input).toHaveFocus();
    await user.tab({ shift: true });
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(close).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });
  it("대화상자 내부 클릭 유지 및 배경 클릭 닫기", () => {
    const close = vi.fn();
    render(<CommandPalette commands={[]} onClose={close} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.pointerDown(dialog);
    expect(close).not.toHaveBeenCalled();
    fireEvent.pointerDown(dialog.parentElement!);
    expect(close).toHaveBeenCalledOnce();
  });
  it("즐겨찾기 우선·최근 정렬, 경로 검색, 태그와 즐겨찾기 필터", async () => {
    const user = userEvent.setup();
    useWorkspace.setState({
      projects: [
        {
          name: "Recent",
          path: "C:/work/recent",
          lastOpened: 30,
          tags: ["work"],
        },
        {
          name: "Favorite",
          path: "C:/personal",
          lastOpened: 10,
          favorite: true,
          tags: ["personal"],
        },
        {
          name: "Old",
          path: "C:/work/old",
          lastOpened: 1,
          tags: ["work"],
          status: "missing",
        },
      ],
    });
    render(
      <ProjectManager
        onActivate={vi.fn()}
        onRegister={vi.fn()}
        onManage={vi.fn()}
      />,
    );
    const cards = () =>
      screen
        .getAllByRole("button")
        .filter((b) => b.querySelector("strong"))
        .map((b) => b.textContent);
    expect(cards()).toEqual(["Favorite", "Recent", "Old"]);
    expect(screen.getByRole("img", { name: "폴더 없음" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("프로젝트 검색"), "C:/work");
    expect(cards()).toEqual(["Recent", "Old"]);
    await user.clear(screen.getByLabelText("프로젝트 검색"));
    await user.selectOptions(screen.getByLabelText("태그 필터"), "personal");
    expect(cards()).toEqual(["Favorite"]);
    await user.selectOptions(screen.getByLabelText("태그 필터"), "");
    await user.click(screen.getByLabelText("즐겨찾기만"));
    expect(cards()).toEqual(["Favorite"]);
  });
  it("경로 검색과 화살표·Enter 실행, Escape 닫기", async () => {
    const user = userEvent.setup();
    const first = vi.fn(),
      second = vi.fn(),
      close = vi.fn();
    render(
      <CommandPalette
        onClose={close}
        commands={[
          { id: "a", label: "Alpha", detail: "C:/notes", run: first },
          { id: "b", label: "Beta", detail: "C:/notes", run: second },
        ]}
      />,
    );
    await user.type(screen.getByRole("combobox"), "C:/notes");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalledOnce();
  });
});
describe("미리보기 콘텐츠 정책", () => {
  it("GFM 표·체크리스트·코드 표시, 원시 HTML 및 원격 이미지 요청 차단", () => {
    const { container } = render(
      <MarkdownPreview
        content={
          '# 제목\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n\n```js\nalert(1)\n```\n\n<script>alert(2)</script>\n\n<iframe src="https://evil.test"></iframe>\n\n![remote](https://evil.test/tracker.png)'
        }
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(container.querySelector("pre code")?.textContent).toContain(
      "alert(1)",
    );
    expect(container.querySelector("script,iframe,img")).toBeNull();
    expect(screen.getByText(/remote · 외부 이미지/)).toBeInTheDocument();
  });
  it("상대 이미지의 검증된 데이터 URL과 문서 링크 이동", async () => {
    const image = vi
      .spyOn(workspaceApi.advanced!, "image")
      .mockResolvedValue("data:image/png;base64,AAAA");
    const follow = vi.fn();
    const user = userEvent.setup();
    render(
      <MarkdownPreview
        desktop
        root="C:/notes"
        documentPath="docs/a.md"
        onNavigate={follow}
        content={"![local](../images/a.png)\n\n[next](b.md#title)"}
      />,
    );
    expect(await screen.findByRole("img", { name: "local" })).toHaveAttribute(
      "src",
      "data:image/png;base64,AAAA",
    );
    expect(image).toHaveBeenCalledWith("C:/notes", "images/a.png");
    await user.click(
      within(
        screen.getByRole("article", { name: "Markdown 미리보기" }),
      ).getByRole("link", { name: "next" }),
    );
    expect(follow).toHaveBeenCalledWith({
      kind: "local",
      path: "docs/b.md",
      hash: "title",
    });
    image.mockRestore();
  });
});
