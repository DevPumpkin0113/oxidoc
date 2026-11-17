# 인계

<!-- 세션을 마칠 때 맨 위에 항목을 하나 추가한다. 최신이 위. 항목은 최근 10개만 두고 오래된 것은 지운다(git에 남는다). -->

## 2026-11-17 20:00 · Claude
- 한 일: 프로젝트 검색 조건 확장(정규식·단어 단위·포함/제외 패턴, 검색 상태 유지, 입력란 자동 완성 끔), 이동·이름 변경 시 Markdown 링크 갱신, 프로젝트 필터 공통 드롭다운, 설정 화면 개편(섹션 목록·검색·재배치, 라이트/다크 테마 전환, 글꼴 크기 −/+ 입력, 항목별 되돌리기, 언어·모드 드롭다운), body 최소 폭 제거, 설치된 글꼴 검색(fontdb)을 모두 앱 확인 후 develop에 커밋(550bbd2…c94dae8). agent-kit guides/desktop-app.md에 입력란 자동 완성 끄기 규칙 추가(agent-kit 쪽 커밋 안 함)
- 멈춘 곳: plan.md '지금'이 비어 있음. develop이 origin보다 26커밋 앞서 있고 push 안 함
- 다음 할 일: '다음'의 파일·폴더 다중 선택 또는 Markdown 편집 도구 중 하나를 '지금'으로 올려 착수, 필요하면 push와 agent-kit 가이드 커밋
- 결정: 검색·바꾸기는 Rust query.rs 한 규칙을 공유하고 정규식 모드만 $1 확장. 링크 갱신은 미리보기와 같은 remark 파서로 프런트엔드에서 계산하고 쓰기는 apply_replace 재사용. 공통 Dropdown은 포털 + 목록 내부만 스크롤(scrollIntoView가 바깥 스크롤을 일으켜 닫히던 버그). 설치된 글꼴은 이름·고정폭 여부만 프런트엔드로 넘김
- 막힌 것: 없음

## 2026-11-17 16:09 · Claude
- 한 일: 구조·성능 개선 6건(선택자 구독, App 분리, store slice 분리, 블록 단위 미리보기, 파일 감시 전환, 검색 캐시)과 폴더 펼침 고착 수정, UI/UX 개선 7건(문서 탭, 오버레이 스크롤바, 도구막대 정리, 글자 수·저장 상태, 코드 블록 구문 강조, 편집기 글꼴·줄 바꿈, 안전한 HTML 허용)을 모두 앱 확인 후 develop에 커밋(f15bbc1…320f084). 테스트 문서 C:\dev-workspace-vscode\playground\app\test003 작성
- 멈춘 곳: 다음 작업 '파일·폴더 다중 선택'은 시작 안 함. develop이 origin보다 18커밋 앞서 있고 push 안 함
- 다음 할 일: BACKLOG의 '파일·폴더 다중 선택' 범위 확인 후 착수, 필요하면 push
- 결정: 새 기능보다 UI/UX 개선 우선(미리보기 탭은 제외). 미리보기 HTML은 전면 차단에서 허용 목록(workspace/previewHtml.ts)으로 완화하고 AGENTS.md 확정된 결정에 기록. 스크롤바는 desktop-app 가이드의 오버레이 방식
- 막힌 것: 없음. 참고로 Bash heredoc이 `\\`를 `\`로 바꿔 `\n`·정규식이 깨지므로 백슬래시가 든 수정은 Edit 도구로 할 것

## 2026-11-17 · Claude
- 한 일: AGENTS.md를 프로젝트 전용 양식으로 정리, CLAUDE.md 추가, Worktree 데이터(docs/worktree, worktree.json, docs/plan/WORKTREE.md) 삭제, 남은 작업을 .agent/plan.md와 docs/plan/BACKLOG.md로 이전, 문서 통합(SETTINGS.md를 UI.md·TECH_STACK.md로 합치고 README·RELEASING 축약)
- 멈춘 곳: 지침 정리 변경과 이전 세션의 v0.4.0 배포 간소화 변경(CHANGELOG, RELEASING, scripts 등)이 모두 커밋 전
- 다음 할 일: 변경 검토 후 커밋, 이어서 파일·폴더 다중 선택 착수
- 결정: Worktree CLI 사용 중단, W080 업데이트 기능은 완료로 처리
- 막힌 것: 없음
