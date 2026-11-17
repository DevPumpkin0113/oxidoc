import { useEffect, useState } from "react";
import { effectiveTheme, useSettings } from "../settings/store";
import { t } from "../settings/i18n";
import { cachedDiagram, renderDiagram } from "../workspace/mermaidRenderer";
import styles from "./MermaidDiagram.module.css";

/** Waits for a pause in typing before rendering an uncached diagram. */
const RENDER_DELAY_MS = 250;

export default function MermaidDiagram({
  source,
  line,
}: {
  source: string;
  line?: number;
}) {
  const theme = useSettings(effectiveTheme);
  const size = useSettings((state) => state.settings.previewFontSize);
  const key = JSON.stringify([source, theme.id, size]);
  const [response, setResponse] = useState<{
    key: string;
    image?: string;
    error?: string;
  }>();
  const cached = cachedDiagram(source, theme, size);
  useEffect(() => {
    if (cached) return;
    let active = true;
    const timer = setTimeout(() => {
      void renderDiagram(source, theme, size, () => active)
        .then((image) => {
          if (active) setResponse({ key, image });
        })
        .catch((error) => {
          if (active) setResponse({ key, error: String(error) });
        });
    }, RENDER_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [source, theme, size, key, cached]);
  const result = cached ?? (response?.key === key ? response : undefined);
  return (
    <div className={styles.diagram} data-source-line={line}>
      {result?.image ? (
        <img
          className={styles.image}
          src={result.image}
          alt={t("Mermaid 다이어그램")}
        />
      ) : (
        <p role={result?.error ? "alert" : "status"}>
          {result?.error
            ? t("Mermaid 문법을 확인해 주세요.")
            : t("다이어그램 렌더링 중…")}
        </p>
      )}
      {result?.error ? (
        <pre className={styles.error}>{result.error}</pre>
      ) : null}
      <details>
        <summary>{t("Mermaid 원문")}</summary>
        <pre>
          <code>{source}</code>
        </pre>
      </details>
    </div>
  );
}
