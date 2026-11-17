# 기술 스택과 구조

## 제품 범위

- VS Code 스타일 UI 기반 로컬 Markdown 에디터, Windows 우선
- 기존 프로젝트 폴더 등록·검색·전환 중심 프로젝트 관리
- 제외: 프로젝트 템플릿, VS Code 확장 실행 호환

## 기술 구성

| 영역              | 기술                                                                                   | 용도                                         |
| ----------------- | -------------------------------------------------------------------------------------- | -------------------------------------------- |
| 데스크톱 앱       | Tauri 2                                                                                | 창 관리·파일 접근·설치 패키지·업데이트       |
| UI                | React + TypeScript                                                                     | 탐색기·탭·프로젝트·명령 팔레트               |
| 개발·빌드         | Vite                                                                                   | 프런트엔드 개발 서버 및 빌드                 |
| 편집기            | Monaco Editor                                                                          | Markdown 편집·구문 강조·찾기·바꾸기          |
| Markdown 미리보기 | react-markdown + remark-gfm + rehype-raw·rehype-sanitize (코드 강조는 Monaco colorize) | 제목·목록·표·체크박스 렌더링                 |
| 다이어그램        | Mermaid + DOMPurify                                                                    | 지연 로딩 렌더링·정제된 SVG 이미지 미리보기  |
| 상태 관리         | Zustand                                                                                | 열린 탭·활성 프로젝트·레이아웃·설정 상태     |
| 로컬 저장         | Rust JSON·Tauri Store                                                                  | 프로젝트 목록·즐겨찾기·설정·세션             |
| 파일 처리·검색    | Rust 명령                                                                              | 파일 입출력·경로 검증·프로젝트 검색          |
| 스타일            | CSS Modules + CSS 변수                                                                 | 컴포넌트별 모듈, 공용 tree·dialog·panel 모듈 |
| 검증              | Vitest + React Testing Library / Rust 테스트                                           | UI 동작 및 파일 처리 검증                    |

## 역할 분담

- React·Zustand: 작업 공간 상태는 `workspace/store.ts`(기능별 slice는 `workspace/slices/`, 자동 저장 구독은 `workspace/persistence.ts`), 대화상자·메뉴·팔레트 같은 화면 상태는 `workbench/uiStore.ts`. 컴포넌트는 필요한 값만 선택자로 구독하고, 문서 본문·커서는 편집기·미리보기·개요만 구독한다.
- 앱 셸: `App.tsx`는 배치만 맡고, 메뉴·팔레트 명령·문서 작업·전역 단축키는 `src/workbench/` 모듈이 store에서 현재 상태를 읽어 처리한다.
- Monaco: 문서 편집 모델과 실행 취소 이력. Monaco와 렌더러는 지연 로딩.
- Markdown 분석·미리보기: `workspace/markdownBlocks.ts`가 문서를 독립 파싱 가능한 블록으로 나누고 블록별 결과를 캐시한다. remark 파서는 큰 문서에서 크기보다 빠르게 느려지므로(1MB 약 11초) 문서 전체를 한 번에 파싱하지 않는다.
- Rust: 등록된 프로젝트 경로와 실제 대상 경로를 검증한 파일 처리·검색·설정 값 검증. 프런트엔드에 범용 파일·설정 저장 권한을 주지 않는다.
- 외부 변경 감지: Rust `notify`로 열린 프로젝트를 재귀 감시해 `workspace-changed` 이벤트로 알리고, 프런트엔드는 이벤트가 올 때만 메타데이터를 대조한다(`workspace/monitor.ts`). 감시 실패 시 폴링으로 대체.
- 검색 캐시: 감시 중인 프로젝트만 파일 목록·내용을 캐시한다(`workspace/cache.rs`). 생성·삭제·이름 변경은 목록을, 내용 변경은 해당 파일만 비운다. 감시가 없으면 매번 순회한다.
- 링크 갱신: Rust `markdown_texts`가 검색 캐시로 `.md` 파일을 한 번에 읽어 주고(최대 64MB), 링크 위치 계산은 미리보기와 같은 remark 파서로 프런트엔드(`workspace/linkUpdates.ts`)에서 한다. 쓰기는 프로젝트 바꾸기의 `apply_replace`(디스크 내용이 미리보기 시점과 같을 때만 저장)를 그대로 쓴다.
- 설치된 글꼴: Rust `fontdb`로 시스템 글꼴 파일을 한 번 읽어 패밀리 이름·다른 이름·고정폭 여부만 넘긴다(`system_fonts`, 앱 실행 중 캐시). 글꼴 파일 경로나 내용은 프런트엔드로 보내지 않는다.
- 문서 본문은 실제 파일로만 관리하고, 앱 데이터에는 메타데이터·설정·세션·복구 임시본만 둔다.

## 저장 위치

앱 데이터 폴더: Windows `%APPDATA%\com.oxidoc.desktop\`

| 데이터                   | 저장 방식                                            |
| ------------------------ | ---------------------------------------------------- |
| 프로젝트·즐겨찾기        | `projects.json`, Rust 읽기·검증·원자적 교체          |
| 설정                     | Tauri Store `settings.json`, 프로젝트 세션과 분리    |
| 세션(열린 문서·레이아웃) | Tauri Store                                          |
| 미저장 복구본            | 프로젝트별 임시본, 원자적 저장                       |
| 브라우저 미리보기 설정   | `localStorage` `oxidoc.settings.v1`, 데스크톱과 별도 |

- 설정 저장은 요청 순서대로 직렬화하고, 저장 실패 시 Store 메모리 값을 복구한다. 앱 종료 전 저장 큐 완료를 기다린다.
- 배포 식별자 `com.oxidoc.desktop`은 초기 개발용이며 바꾸면 기존 데이터 위치가 달라진다.

## 보안 경계

- 미리보기: 원시 HTML은 rehype-raw로 파싱한 뒤 rehype-sanitize 허용 목록(`workspace/previewHtml.ts`, GitHub 기본 정제에서 `picture`·`source`·폼 속성·`class`·`style` 제외)만 통과. `script`·`style`·`iframe`·`object`·`embed`·`svg`·`math`·`textarea` 등은 내용째 제거, 그 밖의 태그는 글자만 남김, 이벤트 속성·`javascript:` 링크 제거, `input`은 작업 목록 체크 상자만. HTML의 `a`·`img`도 Markdown과 같은 링크·이미지 컴포넌트를 거친다. 로컬은 등록 경로 내부 래스터 이미지(SVG 제외)와 상대 문서 링크만 허용하고, 원격 이미지는 https만 `referrerpolicy=no-referrer`·지연 로딩으로 표시(설정 `원격 이미지 표시`로 끔, CSP `img-src https:`), http 이미지는 차단. `<img>`의 `width`·`height`는 숫자·퍼센트만 반영. HTTP/HTTPS 링크는 기본 브라우저로 연다. `<`가 없는 블록은 HTML 파싱을 건너뛴다.
- Mermaid: 원시 SVG 삽입 대신 DOMPurify로 정제한 SVG 이미지로 격리, 외부 링크·HTML 동작 비활성.
- 타이틀바 제어 권한은 해당 Tauri 창 명령으로 제한.
- 업데이트: 앱에 포함된 공개 키로 서명을 검증한 뒤에만 설치. 비밀 키는 Git 제외 `.local/keys/oxidoc-updater.key`에 두고 별도 백업한다.

## 선정 근거

- Tauri: 시스템 WebView를 쓰는 로컬 파일 중심 앱. Electron은 TypeScript·Node.js 중심 개발이 편하지만 런타임을 포함한 배포 크기 때문에 제외.
- Monaco: VS Code와 같은 편집 경험. 앱 레이아웃은 별도 구현.
- 프로젝트 목록: Tauri Store는 초기 로드 실패가 빈 목록으로 처리될 수 있어, 기존 `projects.json` 위치·형식을 유지한 채 Rust의 명시적 검증·원자적 저장으로 바꿨다. 데이터베이스는 검색·데이터 규모 요구가 생기면 재검토.
- Mermaid: 초기에는 제외했으나 프로젝트 문서 안의 흐름도 확인 요구로 Markdown 블록과 `.mmd`·`.mermaid` 독립 문서를 지원.
- 업데이트: 자체 설치 실행기 대신 Tauri 공식 updater 플러그인과 GitHub 정식 릴리즈 채널. 네이티브 서명 검증과 설치 방식을 그대로 쓸 수 있다.
- 전이 의존성: `package.json` `overrides`로 DOMPurify·minimatch를 고정(초기 의존성 감사 취약점 대응). 상위 패키지 갱신 시 재검토.
