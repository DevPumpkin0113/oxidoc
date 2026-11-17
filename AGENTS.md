# Oxidoc 지침

공통 지침은 전역 설정으로 자동 적용된다. 여기에는 이 프로젝트에만 해당하는 내용만 적는다.

## 프로젝트

- 목적: VS Code 스타일 UI 기반 로컬 Markdown 에디터 및 프로젝트 관리 도구, Windows 우선
- 상태: v0.5.0 공개. 작업 계획은 `.agent/plan.md`, 세션 인계는 `.agent/handoff.md`로 관리

## 기술 환경

- 언어·런타임: TypeScript 6.0, Node 24.14.0(`.node-version`), Rust 1.94.1(`rust-toolchain.toml`, edition 2024)
- 프레임워크: Tauri 2, React 19.3, Vite 8.3, Monaco 0.57, Zustand 5.1, Mermaid 12.3
- 테스트: Vitest 5.1 + React Testing Library, Rust 테스트
- 따를 가이드: C:/dev-workspace-vscode/agent-kit/guides/desktop-app.md

## 명령어

- 설치: `npm ci`
- 개발 실행: `npm run dev:desktop` (브라우저 UI만 확인: `npm run dev` → http://127.0.0.1:1420)
- 테스트: `npm test`, `npm run test:rust`
- 린트·타입 검사: `npm run lint`, `npm run typecheck`, `npm run lint:rust`
- 전체 검사: `npm run check`
- 빌드: `npm run build:desktop`, 릴리즈 빌드는 `npm run build:release`
- 버전 변경: `npm run version:set -- <버전>` (파일별로 직접 고치지 않는다)

## 먼저 읽을 문서

- `README.md` — 사용자용 기능 소개·설치·화면(스크린샷은 `npm run screenshots`로 갱신)
- `docs/DEVELOPMENT.md` — 개발 환경, 검증 명령, 폴더 구성
- `docs/plan/TECH_STACK.md` — 기술 구성·역할 분담·저장 위치·보안 경계. 앱 기반 구성 변경 시 확인
- `docs/plan/UI.md` — 레이아웃, 기능 동작, 설정·업데이트, 단축키, 제한 값. 화면·기능 변경 시 확인하고 함께 갱신
- `docs/plan/RELEASING.md` — 버전·태그·릴리즈 게시 절차와 브랜치 역할
- `docs/plan/BACKLOG.md` — 예정 작업의 범위·완료 조건·검증 방법

## 폴더별 규칙

- `src-tauri/` — 파일 접근은 Rust 명령에서 등록된 프로젝트 경로와 실제 대상 경로를 검증한다. 프런트엔드에 범용 파일·설정 저장 권한을 주지 않는다.
- `.local/` — 업데이트 서명 키 위치. 열거나 커밋하지 않는다.

## 확정된 결정

- 미리보기 HTML은 허용 목록(`workspace/previewHtml.ts`)만 표시하고 스크립트·스타일·이벤트 속성·폼·임베드·로컬 SVG를 차단하며, 등록 경로 내부 이미지와 상대 문서 링크만 파일 접근을 허용한다 — 보안 경계. 2026-11-17 원시 HTML 전면 차단에서 허용 목록으로 완화(`<details>`·`<kbd>` 등 문서 표현 필요)
- 원격 이미지는 VS Code 미리보기 정책처럼 https만 기본 표시(리퍼러 없이, 설정으로 끄기), http는 차단. CSP `img-src`에 `https:` 포함 — 2026-11-17 전면 차단에서 변경(README 배지 등 표시 필요, 위험은 이미지 요청에 따른 열람 추적이며 `<img>`라 코드 실행 없음)
- 배포 자산은 EXE·EXE 서명·`latest.json` 세 파일만 쓰고 MSI는 만들지 않는다 — 2026-11-10 배포 간소화
- 작업 관리는 Worktree CLI 대신 `.agent/plan.md`·`handoff.md`를 쓴다 — 2026-11-17 전환, 이전 기록은 git 이력에 남음
