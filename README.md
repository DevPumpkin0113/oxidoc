# Oxidoc

VS Code 스타일 UI 기반 로컬 Markdown 에디터 및 프로젝트 매니저. Windows 우선 지원.

현재 구성: Tauri 기본 창, React 시작 화면, Rust 연결 확인, 개발·검증 도구. 편집기와 프로젝트 관리 기능은 후속 작업 범위.

## 개발 환경

- Node.js 24 LTS 및 npm (`.node-version` 기준 24.14.0)
- Rust stable MSVC 도구 모음 (`rustup`, `rustfmt`, `clippy`)
- Visual Studio C++ 데스크톱 개발 도구 및 Windows SDK
- Microsoft Edge WebView2 Runtime

초기 확인 환경: Node.js 24.14.0, npm 11.15.0, Rust 1.94.1, Visual Studio 2026 C++ 도구, WebView2 156.

## 설치 및 실행

```powershell
npm ci
npm run dev:desktop
```

브라우저 UI 미리보기: `npm run dev` 후 `http://127.0.0.1:1420` 접속. 네이티브 연결 확인은 데스크톱 앱에서만 지원.

첫 네이티브 빌드 시 Cargo 의존성 다운로드 및 컴파일 시간 필요. npm 의존성은 정확한 버전과 `package-lock.json`, Rust 의존성은 `src-tauri/Cargo.lock`으로 고정.

전이 의존성 패치: `package.json`의 `overrides`로 DOMPurify 3.4.17 및 minimatch 11.0.5 고정. 초기 의존성 감사에서 발견된 취약점 대응이며, 상위 패키지 갱신 시 재검토.

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

실행 검증: 데스크톱 창의 **앱 연결 확인** 버튼 선택 후 `데스크톱 연결 완료 · windows · v0.1.0` 표시 확인.

## 폴더 구성

```text
src/                  React UI 및 프런트엔드 테스트
src-tauri/            Rust 앱·Tauri 설정·권한·네이티브 리소스
docs/plan/            기술 결정 및 작업 운영 기준
docs/worktree/        Worktree CLI 관리 데이터
```

## 개발 기준

- [기술 스택 및 역할 분담](docs/plan/TECH_STACK.md)
- [Worktree 작업 구성 기준](docs/plan/WORKTREE.md)
- 네이티브 파일 권한은 기능 구현 시 필요한 경로·작업만 추가. 현재 파일 시스템 접근 권한 미부여.
- 미리보기 원시 HTML 초기 비활성화. Monaco와 Markdown 렌더러는 해당 기능 구현 시 연결.
- 앱 아이콘은 공식 템플릿의 임시 리소스 사용. 배포 식별자 `com.oxidoc.desktop`은 초기 개발용이며 릴리즈 준비 시 검토.

## 공식 참고

- [Tauri Windows 개발 환경](https://v2.tauri.app/start/prerequisites/)
- [Tauri Vite 설정](https://v2.tauri.app/start/frontend/vite/)
