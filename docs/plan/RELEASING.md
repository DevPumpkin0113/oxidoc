# 버전 및 릴리즈

릴리즈 준비·게시·게시 후 확인의 단계별 체크리스트는 `release-prep` 스킬을 따른다. 이 문서에는 Oxidoc 전용 값과 절차를 적는다.

- 공개 저장소: https://github.com/DevPumpkin0113/oxidoc
- 브랜치: `develop` 개발 작업·커밋, `main` 공개 기준
- 태그: `vMAJOR.MINOR.PATCH`. 기능 추가 `minor`, 호환 수정 `patch`, 호환성 파괴 `major`. 게시한 태그는 재사용·이동하지 않는다.
- CI: `main` push, `main`/`develop` 대상 PR, 수동 실행에서 전체 검사

## 버전 변경

```powershell
npm run version:set -- 0.4.1
npm run version:check
npm run check
```

`version:set`은 package.json·package-lock.json·Tauri 설정·Cargo.toml·Cargo.lock의 앱 버전을 함께 바꾼다. 파일별로 직접 고치지 않는다. CHANGELOG.md의 Unreleased 내용을 해당 버전으로 옮기고 날짜를 적는다.

## 게시 절차

1. `develop`에서 버전·변경 이력 갱신과 검증 후 릴리즈 준비 커밋
2. 공개 범위를 확인하고 `main`에 반영, CI 통과 확인
3. `git tag -a v0.4.1 -m "Oxidoc v0.4.1"`
4. `git push origin main develop`, `git push origin v0.4.1`
5. GitHub Release에 같은 버전의 변경 이력 게시
6. 태그와 같은 소스에서 `npm ci`, `npm run build:release`. 서명 키는 `TAURI_SIGNING_PRIVATE_KEY` 또는 Git 제외 `.local/keys/oxidoc-updater.key`, 비밀번호가 있으면 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
7. `src-tauri/target/release/bundle/nsis`의 설치 EXE 버전·서명 확인
8. `output/release`에서 해당 버전의 EXE·`.exe.sig`·`latest.json` 세 파일만 Release에 업로드(디렉터리 전체 업로드 금지). 다운로드 후 원본 해시·서명 대조

## 배포 자산

- v0.4.0부터 EXE·EXE 서명·`latest.json` 세 파일만 게시. MSI·체크섬은 만들지 않는다(기존 MSI 설치 사용자는 EXE로 수동 전환).
- `latest.json`에는 정식 버전과 NSIS EXE 서명·URL을 넣고, 서명된 버전과 일치해야 한다.
- 설치 파일은 Git에 넣지 않고 Release 자산으로만 배포. Windows 코드 서명은 미적용이며 릴리즈 안내에 명시한다.

## 서명 키

- 업데이트 비밀 키는 저장소·릴리즈 자산에 넣지 않고 별도로 안전하게 백업한다.
- CI 서명은 같은 키를 저장소 시크릿으로 구성한 뒤 사용한다.
- 공개 키를 바꾸면 기존 앱이 새 키를 신뢰하도록 전환 계획이 필요하다.
