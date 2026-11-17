# 개발 안내

Oxidoc을 빌드하고 고치는 데 필요한 환경·명령·구성. 사용 안내는 [README](../README.md).

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

- [기술 스택과 구조](plan/TECH_STACK.md) — 기술 구성, 저장 위치, 보안 경계
- [화면과 기능](plan/UI.md) — 레이아웃, 기능 동작, 설정, 단축키, 제한 값
- [버전 및 릴리즈](plan/RELEASING.md) — 버전 변경과 게시 절차, 브랜치 역할
- [예정 작업](plan/BACKLOG.md) — 다음 기능의 범위와 완료 조건

## 폴더 구성

```text
src/                  React UI 및 프런트엔드 테스트
src/workbench/        메뉴·명령·단축키·화면 상태 등 앱 셸 로직
src-tauri/            Rust 앱·Tauri 설정·권한·네이티브 리소스
scripts/              버전·릴리즈 빌드 스크립트
docs/plan/            기술·기능·릴리즈 문서
.github/assets/       README 스크린샷
.agent/               작업 계획(plan.md)·세션 인계(handoff.md)
```

## 아이콘

앱 아이콘 원본은 [assets/branding/app-icon.png](../assets/branding/app-icon.png). 재생성은 `npm run tauri -- icon assets/branding/app-icon.png --output output/app-icons` 실행 후 PNG·ICO·ICNS를 `src-tauri/icons`에, `64x64.png`를 `public/favicon.png`로 복사한다.

## README 스크린샷

`.github/assets/screenshot-00N.png`는 브라우저 미리보기(`npm run dev`, 샘플 작업 공간, 1280×800)에서 찍는다. 화면이 크게 바뀌면 같은 이름으로 다시 찍어 바꾼다.

## 버전 관리

개발 브랜치 `develop`, 공개 기준 `main`. 버전은 `npm run version:set -- <버전>`으로만 바꾸고, 절차는 [버전 및 릴리즈](plan/RELEASING.md)를 따른다.
