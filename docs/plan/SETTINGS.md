# 앱 설정

관련 작업: EP005 · W030~W037

## 범위

- 상태 표시줄 톱니바퀴·명령 팔레트·`Ctrl ,`를 통한 별도 설정 탭 진입
- 프로젝트와 독립된 전역 설정, 즉시 적용·자동 저장·기본값 초기화
- 한국어·영어, 시스템 언어 기본값: 한국어 계열 → 한국어, 그 외 → 영어
- 시스템·라이트·다크 모드, 모드별 테마 선택 및 실행 중 시스템 변경 감지
- UI 11~20px·편집기 10~32px·미리보기 12~32px 독립 크기
- 실제 앱 버전 및 GitHub Releases 기반 업데이트 확인·다운로드·설치 UI

2026-11-08에는 업데이트 UI만 제공. 2026-11-10 W080 착수로 실제 기능 범위 확대. Tauri 공식 updater 플러그인·정식 릴리즈 채널 채택, 자체 설치 실행기 대안 대비 네이티브 서명 검증과 설치 방식 유지 활용.

## 업데이트

- 시작 3초 후 1회 확인·설정에서 수동 재확인, 새 버전 상태 표시줄 알림
- 고정 GitHub 저장소 `DevPumpkin0113/oxidoc`의 최신 릴리즈 `latest.json`, 현재/이전/시험 버전 제외
- 다운로드 진행·릴리즈 내용·네트워크/배포 오류 안내, 다운로드 완료 후 별도 설치 및 재시작 확인
- 설치 전 미저장 문서 저장/폐기/취소 및 복구 대기 확인, 설정·세션·복구 데이터 저장 실패 시 설치 중단
- 서명 검증 완료 전 설치 차단·서명된 버전과 메타데이터 버전 일치 강제, 설치 방식별 NSIS/MSI 유지
- 공개 키는 앱에 포함, 비밀 키는 Git 제외 `.local/keys/oxidoc-updater.key`에 보관·별도 안전한 백업 필요
- `npm run build:release`: 설치 파일·서명·`latest.json`·체크섬 생성. 다음 정식 릴리즈에 함께 게시 필요
- 기존 v0.2.0 배포 파일에는 업데이트 모듈 없음. 기능 포함 첫 버전 수동 설치 필요, 공개 업데이트 설치·재시작 통합 검증은 W080 완료 전 필수

## 상태와 영속화

- Zustand: 검증된 설정·시스템 언어/테마·버전·저장 오류 상태
- Tauri Store `settings.json`: 앱 데이터 영역의 고정 파일·고정 키, 프로젝트 세션과 분리
- Rust: 언어·모드·테마 ID·크기 범위 검증, 저장 실패 시 Store 메모리 값 복구
- 프런트엔드: 저장 순서 직렬화, 실패 안내, 알 수 없는 값의 기본값 복원
- 최신 저장 요청 기준 오류 상태 반영, 앱 종료 전 추가 요청까지 설정 저장 큐 완료 대기
- 브라우저 샘플: `localStorage`의 `oxidoc.settings.v1` 키, 데스크톱 설정과 별도
- 기본값: 시스템 언어·시스템 테마, Light/Dark Modern, UI/편집기 13px·미리보기 15px
- 시스템 언어: 데스크톱 `sys-locale`, 브라우저 `navigator.language`; 언어 변경 이벤트 및 창 포커스 시 재확인
- 시스템 테마: `prefers-color-scheme` 변경 이벤트, 명시한 라이트/다크 모드 우선

## 언어와 편집기

- 앱 문구·동적 개수·접근성 이름·오류 안내의 한국어/영어 사전
- 사용자 문서 본문·파일 이름·프로젝트 이름·경로의 원문 유지
- 네이티브 파일 선택창 제목의 앱 언어 반영, Windows 자체 버튼 문구는 OS 제공
- Monaco 공식 한국어 메시지 번들 사용, 모델·실행 취소 이력 유지 상태로 편집기 언어 재구성
- Monaco 0.57의 초기화 시점 고정 찾기 문구: 찾기 위젯 컨트롤·결과 수에 한정한 언어 어댑터
- 편집기 본문·입력 값 변환 금지, Monaco 갱신 시 언어 번들 인덱스·위젯 구조 회귀 확인
- [Monaco 라이선스](../../public/licenses/monaco-LICENSE.txt)

## 테마

원본 팔레트를 바탕으로 구성한 Oxidoc용 테마. CSS 의미별 토큰·Monaco 구문/위젯·Markdown 미리보기 동기화. VS Code 확장 로드 기능은 범위 외.

| 라이트               | 다크                | 원본                                                                                                                                                   |
| -------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| VS Code Light Modern | VS Code Dark Modern | [VS Code](https://github.com/microsoft/vscode)                                                                                                         |
| GitHub Light         | GitHub Dark         | [GitHub Theme](https://github.com/primer/github-vscode-theme)                                                                                          |
| One Light            | One Dark Pro        | [One Light](https://github.com/akamud/vscode-theme-onelight) · [One Dark Pro](https://github.com/Binaryify/OneDark-Pro)                                |
| Solarized Light      | Dracula             | [Solarized](https://github.com/microsoft/vscode/tree/main/extensions/theme-solarized-light) · [Dracula](https://github.com/dracula/visual-studio-code) |
| Catppuccin Latte     | Catppuccin Mocha    | [Catppuccin Palette](https://catppuccin.com/palette/)                                                                                                  |

## 검증

- 설정 초기화·시스템 감지·모드 선택 우선순위·재초기화 복원·유효하지 않은 입력·직렬 저장·실패 복구
- 설정 탭 진입/종료·언어 왕복·문서 본문 보존·업데이트 상태/버튼·브라우저 비활성 처리
- 실제 브라우저의 시스템 테마 변경·글꼴 적용·Monaco 언어·실행 취소 이력·최소 창 배치
- 네이티브 설정 입력 검증·앱 빌드/실행, 전체 검사 `npm run check`
