# Oxidoc

[공개 저장소](https://github.com/DevPumpkin0113/oxidoc) · [릴리즈](https://github.com/DevPumpkin0113/oxidoc/releases) · [변경 이력](CHANGELOG.md)

VS Code 스타일 UI 기반 로컬 Markdown 에디터 및 프로젝트 관리 도구. Windows 우선 지원.

현재 구성: 커스텀 창 제어·문서 탭, 사이드바 탐색기·검색·프로젝트, Monaco 편집 및 Markdown 분할 미리보기, 실제 폴더 탐색·문서 읽기·저장.

탐색기 파일·폴더 복사/이동, 탭 일괄 관리, 외부 변경 감지·미저장 복구, 빠른 파일 열기, 프로젝트 전체 바꾸기, 이미지 붙여넣기·문서 링크 자동 완성 지원. [기능별 진행 순서](docs/plan/NEXT.md) · [화면 및 단축키](docs/plan/UI.md)

데스크톱 앱은 실제 로컬 프로젝트를 사용하며, 브라우저 미리보기만 샘플 문서 제공. 브라우저 샘플은 디스크 저장 불가.

## 개발 환경

- Node.js 24 LTS 및 npm (`.node-version` 기준 24.14.0)
- Rust stable MSVC 도구 모음 (`rustup`, `rustfmt`, `clippy`)
- Visual Studio C++ 데스크톱 개발 도구 및 Windows SDK
- Microsoft Edge WebView2 Runtime

초기 확인 환경: Node.js 24.14.0, npm 11.15.0, Rust 1.94.1, Visual Studio 2026 C++ 도구, WebView2 156.

## 설치 및 실행

Windows x64 설치 파일은 [최신 릴리즈](https://github.com/DevPumpkin0113/oxidoc/releases/latest)의 Assets에서 제공. 일반 설치는 `Oxidoc_*_x64-setup.exe`, MSI 설치는 `Oxidoc_*_x64_en-US.msi` 선택. SHA-256은 같은 릴리즈의 `SHA256SUMS.txt`에서 확인. 현재 패키지는 코드 서명 미적용.

소스에서 개발 실행:

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

실행 검증: 데스크톱 창에서 커스텀 타이틀바 드래그·더블클릭·최소화·최대화·복원·닫기 동작 확인. 탐색기 문서 선택, 탭 전환, 편집 내용의 실시간 미리보기 반영 확인.

작업 공간 단축키: `Ctrl O` 프로젝트 폴더 열기, `Ctrl S` 현재 문서 저장, `Ctrl K` 프로젝트 전체 검색, `Ctrl B` 사이드바 전환, `Ctrl P` 빠른 파일 열기, `Ctrl Shift P` 명령 팔레트, `Ctrl Shift H` 프로젝트 전체 바꾸기, `Ctrl Shift S` 다른 이름으로 저장, `Ctrl F/H` 찾기·바꾸기. 좁은 창의 분할 보기는 상하 배치로 전환.

## 실제 프로젝트 사용

1. 탐색기의 **폴더 열기** 또는 프로젝트의 **프로젝트 등록** 선택
2. Windows 폴더 선택창에서 작업할 폴더 선택
3. 탐색기에서 하위 폴더를 펼치고 문서 선택
4. 문서 편집 후 **저장** 또는 `Ctrl S` 실행
5. 프로젝트에서 즐겨찾기·태그·이름/경로 검색 및 최근 사용순 정렬
6. 재실행 또는 프로젝트 전환 시 열린 문서·활성 탭·보기·개요·사이드바 복원

미저장 문서 닫기·프로젝트 전환·앱 종료 시 저장/저장 안 함/취소 선택. 저장 실패 시 문서와 미저장 상태 유지. 저장 시 외부 변경 확인 및 동일 폴더 임시 파일을 통한 교체, UTF-8 BOM 유지.

현재 지원 범위: 5MB 이하 UTF-8 텍스트, 폴더별 최대 10,000개 항목. 탐색기 폴더는 펼칠 때 읽고 심볼릭 링크는 표시하지 않음. 프로젝트 목록은 앱 데이터 영역의 projects.json에 저장. 문서 내용은 해당 파일에 저장. 열린 문서 경로와 레이아웃은 별도 세션에 저장, 미저장 본문은 프로젝트별 임시본으로 보관하며 재실행 시 복구 선택 제공.

탐색기 상단 버튼 및 항목 메뉴: 파일·폴더 생성, 이름 변경, 휴지통 이동. 프로젝트 메뉴: 표시 이름·태그 편집, 목록 제거, 이동한 폴더 재연결. 목록 제거 시 실제 파일 유지. 다른 이름 저장은 등록된 프로젝트 내부 대상 지원.

항목 메뉴: 방향키·Home/End 이동, Esc/Tab 또는 배경 클릭으로 닫기 및 호출 위치 포커스 복귀. 구분선·아이콘·주의 작업 표시, 실행할 수 없는 명령 비활성화. 메뉴·팔레트·주요 앱 단축키의 공통 실행 조건 적용.

우클릭은 앱 전용 메뉴 사용. 파일·폴더·프로젝트의 **탐색기에서 열기**, 경로 복사, 폴더 내 검색 지원. 탐색기 빈 공간·최상위 폴더명에서 생성/새로고침/모두 접기, 프로젝트 행에서 열기·즐겨찾기·표시 이름/태그 관리. 입력란·편집기의 텍스트 메뉴도 앱 메뉴로 제공.

Markdown: GFM 표·체크리스트·코드 블록, 문서 개요 및 위치 이동, 양방향 소스 줄 기반 스크롤 동기화, Monaco 찾기·바꾸기·들여쓰기·탭 간 실행 취소 이력. 상대 문서 링크와 프로젝트 내부 PNG/JPEG/GIF/WebP/AVIF/BMP 이미지(10MB 이하) 지원. 원시 HTML·원격 이미지·SVG 차단, HTTP/HTTPS 링크는 기본 브라우저에서 열기.

전체 검색: UTF-8 텍스트 대상, 최대 20,000개 항목·500개 결과·깊이 64, `.git`·`node_modules`·`target`·`dist` 제외. 생략 항목·결과 제한 안내 제공. 파일 변경은 3초 주기와 앱 포커스 복귀 시 감지, 검색 결과는 검색 조건 변경 시 재조회.

## 앱 설정

상태 표시줄 톱니바퀴·명령 팔레트·`Ctrl ,`에서 설정 탭 열기. 시스템/한국어/English 선택, 시스템/라이트/다크 모드 및 라이트·다크 테마 각 5종, UI·편집기·미리보기 글꼴 크기 조절. 변경 즉시 적용·자동 저장 및 기본값 초기화 지원.

앱 정보에 실제 버전 표시. v0.3.0부터 GitHub 최신 정식 릴리즈 확인·다운로드·서명 검증·설치 및 재시작 기능 포함. 기존 v0.2.0에는 해당 기능이 없어 v0.3.0 수동 설치 필요. 업데이트 배포에는 설치 파일·서명·latest.json 게시 필요. 세부 범위·저장 방식·테마 출처: [앱 설정](docs/plan/SETTINGS.md).

## 폴더 구성

```text
src/                  React UI 및 프런트엔드 테스트
src-tauri/            Rust 앱·Tauri 설정·권한·네이티브 리소스
docs/plan/            기술 결정 및 작업 운영 기준
docs/worktree/        Worktree CLI 관리 데이터
```

## 개발 기준

- [기술 스택 및 역할 분담](docs/plan/TECH_STACK.md)
- [작업 공간 UI](docs/plan/UI.md)
- [Worktree 작업 구성 기준](docs/plan/WORKTREE.md)
- 파일 접근은 Rust 명령에서 등록된 프로젝트 경로 및 실제 대상 경로를 검증. 프런트엔드에 범용 파일·설정 저장 권한 미부여.
- 프로젝트·즐겨찾기: Windows `%APPDATA%\com.oxidoc.desktop\projects.json`, Rust JSON 검증·원자적 저장. 설정·세션은 동일 앱 데이터 폴더의 Tauri Store 사용.
- 미리보기 원시 HTML·원격 이미지 비활성화. 등록 경로 내부 이미지와 상대 문서 링크만 파일 접근 허용.
- 배포 식별자 `com.oxidoc.desktop`은 초기 개발용이며 릴리즈 준비 시 검토.

## 아이콘 리소스

- 앱 아이콘: 청록·민트 리본 심볼, [원본 PNG](assets/branding/app-icon.png). 데스크톱 리소스는 `src-tauri/icons`, 브라우저 favicon은 `public/favicon.png` 사용.
- 재생성: `npm run tauri -- icon assets/branding/app-icon.png --output output/app-icons` 실행 후 데스크톱 PNG·ICO·ICNS를 `src-tauri/icons`에 복사, `64x64.png`를 `public/favicon.png`로 복사.
- UI·창 제어: [VS Code Codicons](https://github.com/microsoft/vscode-codicons), SVG 스프라이트 사용
- 편집기 위젯: 고정 Monaco 버전의 전용 Codicon 폰트 로컬 번들, [라이선스](public/licenses/monaco-LICENSE.txt)·[제3자 고지](public/licenses/monaco-ThirdPartyNotices.txt)
- 파일·폴더: [Material Icon Theme](https://github.com/material-extensions/vscode-material-icon-theme), 필요한 SVG만 가져오기
- 라이선스 원문: [Codicons](public/licenses/codicons-LICENSE.txt), [Codicons 코드](public/licenses/codicons-LICENSE-CODE.txt), [Material Icon Theme](public/licenses/material-icon-theme-LICENSE.txt)
- 모든 아이콘은 앱에 포함해 제공하며 외부 서버 요청 없이 표시. Codicons는 Monaco의 아이콘 폰트와 분리.

## 공식 참고

- [Tauri Windows 개발 환경](https://v2.tauri.app/start/prerequisites/)
- [Tauri Vite 설정](https://v2.tauri.app/start/frontend/vite/)

## 버전 관리

현재 공개 버전 `v0.3.0`. 개발 브랜치 `develop`, 공개 기준 `main`. 버전 변경은 `npm run version:set -- 0.3.1`, 정합성 확인은 `npm run version:check`. [릴리즈 절차](docs/plan/RELEASING.md). Windows x64 EXE·MSI 설치 파일 제공.
