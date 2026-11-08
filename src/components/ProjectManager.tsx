import { t } from "../settings/i18n";
import { useMemo, useState } from "react";
import { useWorkspace } from "../workspace/store";
import type { Project } from "../workspace/api";
import Icon from "./Icon";
import styles from "../App.module.css";
export default function ProjectManager({
  onActivate,
  onRegister,
  onManage,
}: {
  onActivate: (project: Project) => void;
  onRegister: () => void;
  onManage: (project: Project, x: number, y: number) => void;
}) {
  const { projects, project, busy, desktop, updateProject } = useWorkspace();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [favorites, setFavorites] = useState(false);
  const [sort, setSort] = useState("recent");
  const tags = useMemo(
    () =>
      [...new Set(projects.flatMap((project) => project.tags ?? []))].sort(),
    [projects],
  );
  const visible = projects
    .filter(
      (project) =>
        `${project.name} ${project.path}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()) &&
        (!tag || project.tags?.includes(tag)) &&
        (!favorites || project.favorite),
    )
    .sort(
      (a, b) =>
        Number(b.favorite ?? false) - Number(a.favorite ?? false) ||
        (sort === "name"
          ? a.name.localeCompare(b.name)
          : (b.lastOpened ?? 0) - (a.lastOpened ?? 0)),
    );
  const statusLabel = (item: Project) =>
    item.status === "missing"
      ? t("폴더 없음")
      : item.status === "denied"
        ? t("접근 권한 없음")
        : item.status === "unavailable"
          ? t("접근 불가")
          : project?.path === item.path
            ? t("열려 있음")
            : "";
  const grouped = new Map<string | null, Project[]>();
  for (const item of visible) {
    const itemTags = [...new Set(item.tags ?? [])].filter(Boolean);
    for (const label of tag ? [tag] : itemTags.length ? itemTags : [null]) {
      const group = grouped.get(label) ?? [];
      group.push(item);
      grouped.set(label, group);
    }
  }
  const groups = [...grouped].sort(([a], [b]) =>
    a === null ? 1 : b === null ? -1 : a.localeCompare(b),
  );
  return (
    <div className={styles.projectsPanel}>
      <button
        className={styles.openProjectButton}
        disabled={busy || !desktop}
        onClick={onRegister}
      >
        <Icon name="folder" size={15} />
        {t("프로젝트 등록")}
      </button>
      <label className={styles.visuallyHidden} htmlFor="project-search">
        {t("프로젝트 검색")}
      </label>
      <input
        id="project-search"
        className={styles.panelInput}
        placeholder={t("이름 또는 경로")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className={styles.projectFilters}>
        <select
          aria-label={t("프로젝트 정렬")}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="recent">{t("최근 사용순")}</option>
          <option value="name">{t("이름순")}</option>
        </select>
        <select
          aria-label={t("태그 필터")}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        >
          <option value="">{t("모든 태그")}</option>
          {tag && !tags.includes(tag) ? (
            <option value={tag}>{tag}</option>
          ) : null}
          {tags.map((tag) => (
            <option key={tag}>{tag}</option>
          ))}
        </select>
      </div>
      <div className={styles.projectListMeta}>
        <label className={styles.favoriteFilter}>
          <input
            type="checkbox"
            checked={favorites}
            onChange={(event) => setFavorites(event.target.checked)}
          />
          {t("즐겨찾기만")}
        </label>
        <p className={styles.resultCount}>
          {t("{0}개의 프로젝트", visible.length)}
        </p>
      </div>
      {groups.map(([label, items]) => (
        <section
          key={label === null ? "untagged" : `tag:${label}`}
          className={styles.projectTagGroup}
          aria-label={label ?? t("태그 없음")}
        >
          <h3 title={label ?? t("태그 없음")}>
            <span>{label ?? t("태그 없음")}</span>
            <small>{items.length}</small>
          </h3>
          {items.map((item) => (
            <div className={styles.projectRow} key={item.path}>
              <button
                className={styles.projectCard}
                disabled={busy}
                onClick={() => onActivate(item)}
                title={`${item.path}${item.tags?.length ? ` · ${item.tags.join(", ")}` : ""}`}
              >
                <Icon name="book" size={16} />
                <strong>{item.name}</strong>
                {statusLabel(item) ? (
                  <span
                    className={`${styles.projectOpen} ${item.status && item.status !== "available" ? styles.unavailable : ""}`}
                    role="img"
                    aria-label={statusLabel(item)}
                    title={statusLabel(item)}
                  >
                    <span />
                  </span>
                ) : null}
              </button>
              <button
                className={styles.rowAction}
                disabled={busy || !desktop}
                aria-label={t("{0} 즐겨찾기", item.name)}
                aria-pressed={Boolean(item.favorite)}
                onClick={() =>
                  void updateProject(item.path, { favorite: !item.favorite })
                }
              >
                <Icon name={item.favorite ? "starFilled" : "star"} size={14} />
              </button>
              <button
                className={styles.rowAction}
                disabled={busy || !desktop}
                aria-label={t("{0} 프로젝트 관리", item.name)}
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onManage(item, rect.right, rect.bottom);
                }}
              >
                <Icon name="more" size={14} />
              </button>
            </div>
          ))}
        </section>
      ))}
      {!visible.length ? (
        <p className={styles.projectNote}>
          {projects.length
            ? t("검색 조건에 맞는 프로젝트가 없습니다.")
            : t("폴더를 등록하면 여기에 표시됩니다.")}
        </p>
      ) : null}
    </div>
  );
}
