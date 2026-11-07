import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import styles from "./App.module.css";

interface RuntimeInfo {
  version: string;
  platform: string;
}

export default function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const desktop = isTauri();

  async function checkRuntime() {
    setChecking(true);
    setError(false);
    setRuntime(null);
    try {
      setRuntime(await invoke<RuntimeInfo>("runtime_info"));
    } catch {
      setError(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className={styles.workspace}>
      <section className={styles.welcome} aria-labelledby="app-title">
        <div className={styles.mark} aria-hidden="true">
          O
        </div>
        <p className={styles.eyebrow}>YOUR SPACE TO WRITE</p>
        <h1 id="app-title">Oxidoc</h1>
        <p className={styles.description}>문서에 집중하는 나만의 작업 공간</p>
        <button
          className={styles.button}
          type="button"
          disabled={!desktop || checking}
          onClick={checkRuntime}
        >
          {checking ? "확인 중…" : "앱 연결 확인"}
        </button>
        <div className={styles.status} aria-live="polite" role="status">
          {!desktop ? "브라우저 미리보기 · 데스크톱 기능은 앱에서 사용" : null}
          {desktop && !runtime && !error && !checking
            ? "작업 공간 준비 완료"
            : null}
          {runtime
            ? `데스크톱 연결 완료 · ${runtime.platform} · v${runtime.version}`
            : null}
          {error ? "앱 연결 확인 실패 · 다시 시도해 주세요" : null}
        </div>
      </section>
    </main>
  );
}
