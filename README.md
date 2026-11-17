# Oxidoc

[공개 저장소](https://github.com/DevPumpkin0113/oxidoc) · [릴리즈](https://github.com/DevPumpkin0113/oxidoc/releases) · [변경 이력](CHANGELOG.md)

VS Code 스타일 UI 기반 로컬 Markdown 에디터 및 프로젝트 관리 도구. Windows 우선 지원.

## 주요 기능

- 프로젝트 폴더 등록·전환, 즐겨찾기·태그·최근 사용순 정렬
- 실제 폴더 탐색기: 생성·이름 변경·휴지통 이동·복사/이동·드래그, 문서만 보기/전체 보기
- Monaco 편집기와 Markdown 분할 미리보기, 문서 개요, 양방향 스크롤 동기화
- Mermaid 다이어그램(코드 블록·`.mmd`·`.mermaid`), 이미지 붙여넣기, 문서 링크 자동 완성·깨진 링크 경고
- 프로젝트 전체 검색·바꾸기(변경 미리보기), 빠른 파일 열기, 명령 팔레트
- 외부 변경 감지, 미저장 문서 복구, 세션 복원
- 한국어/English, 라이트·다크 테마 각 5종, 앱 내 업데이트

세부 동작·단축키·제한 값: [화면과 기능](docs/plan/UI.md)

## 설치

[최신 릴리즈](https://github.com/DevPumpkin0113/oxidoc/releases/latest)의 Assets에서 `Oxidoc_*_x64-setup.exe`를 받아 설치한다. 이후 버전은 앱 안에서 업데이트된다. 코드 서명은 적용되지 않았다.

## 개발 환경

- Node.js 24 LTS 및 npm (`.node-version` 기준 24.14.0)
- Rust (`rust-toolchain.toml` 기준 1.94.1, MSVC, `rustfmt`·`clippy`)
- Visual Studio C++ 데스크톱 개발 도구 및 Windows SDK
- Microsoft Edge WebView2 Runtime

```powershell
npm ci
npm run dev:desktop
```

브라우저 UI만 확인할 때는 `npm run dev` 후 `http://127.0.0.1:1420`에 접속한다. 샘플 문서로 동작하며 디스크에 저장하지 않는다. 의존성은 `package-lock.json`과 `src-tauri/Cargo.lock`으로 고정한다.

## 검증 명령

| 명령                                                 | 용도                                                 |
| ---------------------------------------------------- | ---------------------------------------------------- |
| `npm run check`                                      | 타입·린트·테스트·프런트엔드 빌드·포맷·Rust 검사 전체 |
| `npm run typecheck`                                  | 앱 및 빌드 설정 TypeScript 검사                      |
| `npm run lint`                                       | ESLint 검사                                          |
| `npm test`                                           | Vitest 및 React Testing Library 테스트               |
| `npm run build`                                      | 프런트엔드 프로덕션 빌드                             |
| `npm run check:rust`                                 | Rust 컴파일 검사                                     |
| `npm run lint:rust`                                  | Rust Clippy 검사                                     |
| `npm run test:rust`                                  | Rust 테스트 실행                                     |
| `npm run format:check` / `npm run format:rust:check` | 포맷 검사                                            |
| `npm run format` / `npm run format:rust`             | 포맷 적용                                            |
| `npm run build:desktop`                              | 데스크톱 앱 및 설치 패키지 빌드                      |

## 문서

- [기술 스택과 구조](docs/plan/TECH_STACK.md) — 기술 구성, 저장 위치, 보안 경계
- [화면과 기능](docs/plan/UI.md) — 레이아웃, 기능 동작, 설정, 단축키, 제한 값
- [버전 및 릴리즈](docs/plan/RELEASING.md) — 버전 변경과 게시 절차
- [예정 작업](docs/plan/BACKLOG.md) — 다음 기능의 범위와 완료 조건

## 폴더 구성

```text
src/                  React UI 및 프런트엔드 테스트
src-tauri/            Rust 앱·Tauri 설정·권한·네이티브 리소스
scripts/              버전·릴리즈 빌드 스크립트
docs/plan/            기술·기능·릴리즈 문서
.agent/               작업 계획(plan.md)·세션 인계(handoff.md)
```

## 아이콘과 라이선스

- 앱 아이콘: [원본 PNG](assets/branding/app-icon.png). 재생성은 `npm run tauri -- icon assets/branding/app-icon.png --output output/app-icons` 실행 후 PNG·ICO·ICNS를 `src-tauri/icons`에, `64x64.png`를 `public/favicon.png`로 복사.
- UI·창 제어: [VS Code Codicons](https://github.com/microsoft/vscode-codicons) — [라이선스](public/licenses/codicons-LICENSE.txt), [코드 라이선스](public/licenses/codicons-LICENSE-CODE.txt)
- 파일·폴더: [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme) — [라이선스](public/licenses/material-icon-theme-LICENSE.txt)
- 편집기: Monaco 및 전용 Codicon 폰트 — [라이선스](public/licenses/monaco-LICENSE.txt), [제3자 고지](public/licenses/monaco-ThirdPartyNotices.txt)
- 테마 원본: [화면과 기능 › 테마](docs/plan/UI.md#테마)

## 버전 관리

현재 공개 버전 `v0.4.0`. 개발 브랜치 `develop`, 공개 기준 `main`. 절차는 [버전 및 릴리즈](docs/plan/RELEASING.md).
