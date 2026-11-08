import { describe, expect, it, vi } from "vitest";
import {
  createSettingsStore,
  defaults,
  effectiveLanguage,
  effectiveTheme,
  languageFor,
  parseSettings,
  type SettingsApi,
} from "./store";
import { themes } from "./themes";
import { english, translate, translateError } from "./i18n";
import { useSettings } from "./store";
function fixture(saved: unknown = null, locale = "ko-KR") {
  const api: SettingsApi = {
    load: vi.fn().mockResolvedValue(saved),
    save: vi.fn().mockResolvedValue(undefined),
    info: vi.fn().mockResolvedValue({ version: "2.3.4", locale }),
  };
  return { api, store: createSettingsStore(api) };
}
describe("앱 전역 설정", () => {
  it("이전 저장 실패·최신 저장 성공 시 오래된 오류 표시 제거", async () => {
    const { api, store } = fixture();
    await store.getState().initialize();
    let failFirst: (error: Error) => void = () => {};
    vi.mocked(api.save).mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          failFirst = reject;
        }),
    );
    const first = store.getState().update({ uiFontSize: 15 });
    await vi.waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    const flushing = store.getState().flush();
    const second = store.getState().update({ uiFontSize: 18 });
    failFirst(Error("temporary failure"));
    await Promise.all([first, second, flushing]);
    expect(store.getState().error).toBe("");
    expect(vi.mocked(api.save).mock.calls[1][0].uiFontSize).toBe(18);
  });
  it("flush는 대기 중인 마지막 설정 저장까지 완료 대기", async () => {
    const { api, store } = fixture();
    await store.getState().initialize();
    let finishFirst = () => {},
      finishSecond = () => {};
    vi.mocked(api.save)
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishSecond = resolve;
          }),
      );
    const first = store.getState().update({ uiFontSize: 14 });
    await vi.waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    let flushed = false;
    const flushing = store
      .getState()
      .flush()
      .then(() => {
        flushed = true;
      });
    const second = store.getState().update({ uiFontSize: 19 });
    finishFirst();
    await first;
    await vi.waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(flushed).toBe(false);
    finishSecond();
    await second;
    await flushing;
    expect(flushed).toBe(true);
  });
  it("최초 시스템 언어와 실제 버전 감지·중복 초기화 방지", async () => {
    const { api, store } = fixture();
    await Promise.all([
      store.getState().initialize(),
      store.getState().initialize(),
    ]);
    expect(api.load).toHaveBeenCalledOnce();
    expect(api.info).toHaveBeenCalledOnce();
    expect(effectiveLanguage(store.getState())).toBe("ko");
    expect(store.getState().version).toBe("2.3.4");
    expect(languageFor("KO_kr")).toBe("ko");
    expect(languageFor("fr-FR")).toBe("en");
  });
  it("명시한 언어 우선 및 시스템 재선택 후 감지 언어 추종", async () => {
    const { store, api } = fixture({ language: "en" });
    await store.getState().initialize();
    expect(effectiveLanguage(store.getState())).toBe("en");
    await store.getState().update({ language: "system" });
    expect(effectiveLanguage(store.getState())).toBe("ko");
    vi.mocked(api.info).mockResolvedValue({
      version: "2.3.4",
      locale: "de-DE",
    });
    await store.getState().refreshLocale();
    expect(effectiveLanguage(store.getState())).toBe("en");
  });
  it("설정 재실행 복원·기본값 초기화", async () => {
    const saved = {
      ...defaults,
      language: "ko",
      darkTheme: "dracula",
      uiFontSize: 18,
      editorFontSize: 23,
      previewFontSize: 25,
    };
    const { store, api } = fixture(saved);
    await store.getState().initialize();
    expect(store.getState().settings).toEqual(saved);
    await store.getState().reset();
    expect(api.save).toHaveBeenLastCalledWith(defaults);
    const restarted = fixture(
      vi.mocked(api.save).mock.calls.slice(-1)[0]?.[0],
    ).store;
    await restarted.getState().initialize();
    expect(restarted.getState().settings).toEqual(defaults);
  });
  it("오염된 설정·잘못된 테마 종류·글꼴 범위의 기본값 복원", () => {
    expect(
      parseSettings({
        language: "ja",
        mode: "invalid",
        lightTheme: "dracula",
        darkTheme: "unknown",
        uiFontSize: 200,
        editorFontSize: NaN,
        previewFontSize: "24",
      }),
    ).toEqual(defaults);
    expect(parseSettings(null)).toEqual(defaults);
  });
  it("빠른 연속 변경을 순서대로 저장, 실패 안내 및 다음 저장 재시도", async () => {
    const { store, api } = fixture();
    await store.getState().initialize();
    vi.mocked(api.save).mockRejectedValueOnce(Error("disk full"));
    await store.getState().update({ editorFontSize: 18 });
    expect(store.getState().error).toContain("disk full");
    expect(store.getState().settings.editorFontSize).toBe(18);
    await Promise.all([
      store.getState().update({ editorFontSize: 20 }),
      store.getState().update({ editorFontSize: 24 }),
    ]);
    expect(
      vi.mocked(api.save).mock.calls.map((call) => call[0].editorFontSize),
    ).toEqual([18, 20, 24]);
    expect(store.getState().error).toBe("");
  });
  it("시스템 모드 변경 시 선택한 라이트·다크 테마 전환, 명시 모드 우선", async () => {
    const { store } = fixture({
      ...defaults,
      lightTheme: "github-light",
      darkTheme: "dracula",
    });
    await store.getState().initialize();
    store.setState({ systemDark: false });
    expect(effectiveTheme(store.getState()).id).toBe("github-light");
    store.setState({ systemDark: true });
    expect(effectiveTheme(store.getState()).id).toBe("dracula");
    await store.getState().update({ mode: "light" });
    expect(effectiveTheme(store.getState()).id).toBe("github-light");
    expect(themes.filter((theme) => theme.kind === "light")).toHaveLength(5);
    expect(themes.filter((theme) => theme.kind === "dark")).toHaveLength(5);
  });
  it("번역 매개변수에 사용자 문서명·경로 보존", () => {
    expect(translate("프로젝트 열기: {0}", "en", "한글 프로젝트")).toBe(
      "Open project: 한글 프로젝트",
    );
    expect(translate("줄 {0}, 열 {1}", "en", 4, 9)).toBe("Ln 4, Col 9");
    useSettings.setState({ settings: { ...defaults, language: "en" } });
    expect(translateError("복원하지 못한 문서: 문서/편집.md")).toBe(
      "Documents not restored: 문서/편집.md",
    );
    expect(english["설정"]).toBe("Settings");
  });
});
