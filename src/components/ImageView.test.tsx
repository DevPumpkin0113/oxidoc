import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ImageView from "./ImageView";
import StatusBar from "./StatusBar";
import { workspaceApi } from "../workspace/api";
import { isDirty } from "../workspace/model";
import { useWorkspace } from "../workspace/store";

const summary = {
  id: "assets/pixel.png",
  name: "pixel.png",
  folder: "assets",
  dirty: false,
};

beforeEach(() => {
  useWorkspace.setState({
    desktop: true,
    project: { name: "Notes", path: "C:/notes" },
    documents: [],
    activeId: null,
  });
});
afterEach(() => vi.restoreAllMocks());
const file = { id: summary.id, name: summary.name, folder: summary.folder };

it("이미지는 텍스트로 읽지 않고 탭으로 열리며 수정·저장 대상이 아님", async () => {
  const read = vi.spyOn(workspaceApi, "read");
  await act(() =>
    useWorkspace.getState().open({
      name: "pixel.png",
      path: "assets/pixel.png",
      isDirectory: false,
    }),
  );
  expect(read).not.toHaveBeenCalled();
  const [document] = useWorkspace.getState().documents;
  expect(document.id).toBe("assets/pixel.png");
  expect(useWorkspace.getState().activeId).toBe("assets/pixel.png");
  expect(isDirty({ ...document, content: "changed", diskContent: null })).toBe(
    false,
  );
  await expect(
    useWorkspace.getState().saveAs("assets/pixel.png"),
  ).resolves.toBe(false);

  render(<StatusBar />);
  expect(screen.getByText("이미지 · 읽기 전용")).toBeInTheDocument();
  expect(screen.queryByText("UTF-8")).not.toBeInTheDocument();
});

it("맞춤으로 시작해 휠은 커서 기준 확대·축소, 끌면 이동, 버튼·더블클릭으로 맞춤·100%, 바뀌면 다시 불러옴", async () => {
  const image = vi
    .spyOn(workspaceApi.advanced!, "image")
    .mockResolvedValueOnce("data:image/png;base64,AAAA")
    .mockRejectedValueOnce("이미지를 찾을 수 없습니다.");
  useWorkspace.setState({
    documents: [{ ...file, content: "1", savedContent: "1" }],
  });
  const size = vi
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(300);
  try {
    const user = userEvent.setup();
    const view = render(<ImageView document={summary} />);
    // Hidden until its size is known, so it is not exposed as an image yet.
    await waitFor(() =>
      expect(view.container.querySelector("img")).not.toBeNull(),
    );
    const img = view.container.querySelector("img")!;
    expect(img).toHaveAttribute("alt", "pixel.png");
    expect(image).toHaveBeenCalledWith("C:/notes", "assets/pixel.png");
    Object.defineProperties(img, {
      naturalWidth: { value: 704 },
      naturalHeight: { value: 252 },
    });
    fireEvent.load(img);
    expect(screen.getByText("704 × 252 · PNG · 0.0 KB")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(img.style.transform).toBe("translate(24px, 87px) scale(0.5)");
    expect(screen.getByRole("button", { name: "맞춤" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // The wheel zooms around the cursor (frame origin at 0,0 in jsdom).
    const canvas = img.parentElement!;
    fireEvent.wheel(canvas, { deltaY: -100, clientX: 24, clientY: 87 });
    expect(img.style.transform).toBe("translate(24px, 87px) scale(0.575)");
    expect(screen.getByText("57%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "맞춤" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    fireEvent.pointerDown(canvas, { button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(canvas, { clientX: 130, clientY: 90 });
    fireEvent.pointerUp(canvas);
    expect(img.style.transform).toBe("translate(54px, 77px) scale(0.575)");
    fireEvent.pointerMove(canvas, { clientX: 300, clientY: 300 });
    expect(img.style.transform).toBe("translate(54px, 77px) scale(0.575)");

    await user.click(screen.getByRole("button", { name: "100%" }));
    expect(img.style.transform).toBe("translate(-152px, 24px) scale(1)");
    await user.click(screen.getByRole("button", { name: "확대" }));
    expect(screen.getByText("150%")).toBeInTheDocument();
    fireEvent.doubleClick(canvas);
    expect(img.style.transform).toBe("translate(24px, 87px) scale(0.5)");

    // A new stamp from the file monitor reloads the image.
    act(() =>
      useWorkspace.setState({
        documents: [{ ...file, content: "2", savedContent: "2" }],
      }),
    );
    view.rerender(<ImageView document={summary} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "이미지를 찾을 수 없습니다.",
    );
  } finally {
    size.mockRestore();
  }
});
