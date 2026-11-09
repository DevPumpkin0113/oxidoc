# Oxidoc 기술 스택

확정일: 2026-11-07 · 관련 작업: W001

## 제품 범위

- VS Code 스타일 UI 기반 로컬 Markdown 에디터
- 기존 프로젝트 폴더 등록·검색·전환 중심 프로젝트 관리
- Windows 우선 지원
- Mermaid 및 프로젝트 템플릿 기능 제외

## 기술 구성

| 영역                 | 선정 기술                                    | 적용 용도                           |
| -------------------- | -------------------------------------------- | ----------------------------------- |
| 데스크톱 앱          | Tauri 2                                      | 창 관리·파일 접근·설치 패키지       |
| UI                   | React + TypeScript                           | 탐색기·탭·프로젝트·명령 팔레트      |
| 개발·빌드            | Vite                                         | 프런트엔드 개발 서버 및 빌드        |
| 편집기               | Monaco Editor                                | Markdown 편집·구문 강조·찾기·바꾸기 |
| Markdown 미리보기    | react-markdown + remark-gfm                  | 제목·목록·표·체크박스 렌더링        |
| 상태 관리            | Zustand                                      | 열린 탭·활성 프로젝트·레이아웃 상태 |
| 로컬 메타데이터 저장 | Rust JSON·Tauri Store                        | 프로젝트 목록·즐겨찾기·설정·세션    |
| 파일 처리·검색       | Tauri 파일 API + Rust                        | 파일 입출력·경로 처리·프로젝트 검색 |
| 스타일               | CSS Modules + CSS 변수                       | VS Code 스타일 배치 및 테마         |
| 검증                 | Vitest + React Testing Library / Rust 테스트 | UI 동작 및 파일 처리 검증           |

## 역할 분담

- React·TypeScript: UI와 사용자 상호작용
- Monaco: 문서 편집 모델과 편집 이력
- Zustand: 화면과 작업 공간 상태 관리, 입력마다 문서 전체 복제 방지
- Tauri Store: 프로젝트 메타데이터와 설정 영속화, 문서 본문은 실제 파일로 관리
- Tauri 파일 API·Rust: 허용된 프로젝트 경로 접근, 파일 처리 및 검색
- Markdown 미리보기: 원시 HTML 초기 비활성화, 향후 허용 시 정제 처리 추가

## 선정 근거 및 대안

- Tauri: 로컬 파일 중심 데스크톱 앱 구성에 적합한 시스템 WebView 활용
- Monaco: VS Code와 익숙한 편집 경험 제공, 앱 레이아웃은 별도 구현
- Electron 대안 검토: TypeScript·Node.js 중심 개발의 장점 대비 런타임 포함 배포를 고려해 Tauri 선정
- 초기 메타데이터 저장: 설정·세션은 Tauri Store 활용. W054에서 프로젝트 등록·즐겨찾기는 기존 AppData `projects.json` 형식·위치를 유지하면서 Rust의 명시적 읽기·검증·원자적 교체로 변경. Store 초기 로드 실패가 빈 캐시로 처리되는 경로와 종료 시 캐시 저장 의존 제거. 별도 데이터베이스 도입은 검색·데이터 규모 요구에 따라 재검토.

## 구현 확인 항목

- Windows WebView2 및 Rust 개발 환경 구성
- 의존성 버전 고정과 개발·빌드·검증 명령 기록
- 기본 창 실행과 Monaco·Markdown 미리보기 연동 검증
- VS Code 확장 실행 호환은 현재 범위 외

## 공식 참고 자료

- [Tauri WebView](https://v2.tauri.app/reference/webview-versions/)
- [Tauri 파일 시스템](https://v2.tauri.app/plugin/file-system/)
- [Tauri Store](https://v2.tauri.app/plugin/store/)
- [Monaco Editor](https://github.com/microsoft/monaco-editor)
- [react-markdown](https://github.com/remarkjs/react-markdown)
