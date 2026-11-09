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
6. 게시 태그와 동일한 소스에서 `npm ci`, `npm run build:release` 실행. `TAURI_SIGNING_PRIVATE_KEY` 또는 Git 제외 `.local/keys/oxidoc-updater.key` 필요, 비밀번호 사용 시 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 지정
7. `src-tauri/target/release/bundle/nsis`의 설치 EXE와 `bundle/msi`의 MSI 버전 확인, SHA-256 생성
8. `output/release`의 설치 파일·`.sig`·`latest.json`·`SHA256SUMS.txt`를 해당 GitHub Release에 업로드, 다운로드 후 원본 해시 대조. 기존 게시 버전/태그 재사용 금지

업데이트 비밀 키는 저장소·릴리즈 자산에 포함 금지, 별도 안전한 백업 필수. CI 서명은 동일 키를 저장소 시크릿으로 별도 구성한 후 사용. 공개 키 교체 시 기존 앱의 새 키 신뢰 전환 계획 필요. 메타데이터에는 정식 버전과 설치 방식별 서명/URL 포함, 서명된 버전과 일치 강제. v0.2.0에서 첫 업데이트 지원 버전으로는 수동 설치, 이후 실제 설치 업데이트 및 재시작·프로젝트/설정 보존 확인 후 작업 완료.

초기 v0.1.0은 소스 릴리즈, v0.2.0부터 Windows x64 EXE·MSI 제공, v0.3.0부터 업데이트 검증용 서명·메타데이터 제공. 설치 파일은 Git에 포함하지 않고 Release 자산으로 배포. Windows 코드 서명 인증서는 별도 작업, 코드 서명 미적용 여부는 릴리즈 안내에 명시. 게시된 태그는 유지하며 같은 태그의 설치 파일을 추가할 때도 동일 소스 여부 확인. CI는 main push와 main/develop 대상 PR, 수동 실행에서 전체 검사 수행. 비밀값과 테스트 산출물은 저장소에 포함하지 않음.
