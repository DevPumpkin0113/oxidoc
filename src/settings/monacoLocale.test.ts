import { describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { localizeFindWidget } from "./monacoLocale";
describe("Monaco 위젯 언어 전환", () => {
  it("찾기 컨트롤·결과 수·대화상자 이름 전환, 사용자 텍스트와 입력 보존", async () => {
    const root = document.createElement("div");
    root.innerHTML =
      '<div class="view-lines">Find / Replace 사용자 문서</div><div class="find-widget" aria-label="Find / Replace"><textarea aria-label="Find" placeholder="Find">Find 사용자 입력</textarea><button aria-label="Replace All(Ctrl+Alt+Enter)"></button><span class="matchesCount">1 of 3</span></div>';
    const stop = localizeFindWidget(root, "ko");
    expect(root.querySelector(".find-widget")).toHaveAttribute(
      "aria-label",
      "찾기/바꾸기",
    );
    expect(root.querySelector("textarea")).toHaveAttribute(
      "aria-label",
      "찾기",
    );
    expect(root.querySelector("textarea")?.value).toBe("Find 사용자 입력");
    expect(root.querySelector(".view-lines")?.textContent).toBe(
      "Find / Replace 사용자 문서",
    );
    const koreanCount = root.querySelector(".matchesCount")?.textContent;
    expect(koreanCount).not.toBe("1 of 3");
    const newButton = document.createElement("button");
    newButton.setAttribute("aria-label", "Next Match(Enter)");
    root.querySelector(".find-widget")?.append(newButton);
    await waitFor(() =>
      expect(newButton.getAttribute("aria-label")).toBe(
        "다음 검색 결과(Enter)",
      ),
    );
    stop();
    const stopEnglish = localizeFindWidget(root, "en");
    expect(root.querySelector(".matchesCount")?.textContent).toBe("1 of 3");
    expect(root.querySelector("textarea")).toHaveAttribute(
      "aria-label",
      "Find",
    );
    stopEnglish();
  });
});
