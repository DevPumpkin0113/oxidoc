# 버전 및 릴리즈

- 공개 저장소: https://github.com/DevPumpkin0113/oxidoc
- `develop`: 개발 작업·개발 커밋
- `main`: 공개 기준 버전
- 태그: `vMAJOR.MINOR.PATCH`, 게시한 태그 재사용·이동 금지
- 초기 버전: `0.1.0`, 기능 추가 `minor`·호환 수정 `patch`·호환성 파괴 변경 `major` 기준

## 버전 변경

```powershell
npm run version:set -- 0.1.1
npm run version:check
npm run check
```

`version:set`은 package.json·package-lock.json·Tauri 설정·Cargo.toml·Cargo.lock의 앱 버전을 함께 변경. 직접 파일별 변경 대신 해당 명령 사용. `version:check`는 잠금 파일의 루트 항목까지 검사. 의존성 버전은 유지.

CHANGELOG.md의 Unreleased 내용을 해당 버전으로 이동하고 날짜·변경 사항 갱신. Node 버전은 `.node-version`, Rust는 `rust-toolchain.toml` 기준.

## 게시 절차

1. `develop`에서 버전·변경 이력 갱신 및 검증, 릴리즈 준비 커밋
2. 요청/합의된 공개 범위 확인 후 `main`에 반영, CI 통과 확인
3. `git tag -a v0.1.1 -m "Oxidoc v0.1.1"`
4. `git push origin main develop` 및 `git push origin v0.1.1`
5. GitHub Release에 같은 버전의 변경 이력 게시

초기 v0.1.0은 소스 릴리즈. 설치 파일·서명·앱 내 업데이트는 별도 작업. CI는 main push와 main/develop 대상 PR, 수동 실행에서 전체 검사 수행. 비밀값과 테스트 산출물은 저장소에 포함하지 않음.
