# Quickstart: 배치 결정 제거 검증

## 사전 준비

- Node.js 24 (로컬은 `.tools/node-v24.18.0-win-x64`를 PATH에 추가)
- 외부 의존성 없음

## 1. 전체 테스트

```bash
npm test
```

기대 결과: 모두 통과. 특히
- `run.test.js` — spec US1(수동 순서 유지 4가지), US2(배치 결정 없이 기존 동작: 파일 미생성, 재분류 보류/생성, 2개 미만 삭제, 카테고리), US3(묶음 공개 시각 순), US4(수동 추가 항목 제목 갱신).
- `seriesDataIntegrity.test.js` — [data-model.md](./data-model.md) INV-1, INV-2를 실제 저장소 데이터로 확인.

## 2. 실제 sitemap으로 드라이런(선택)

저장소를 임시 디렉터리에 복사해(`*_series.json`, `.github/sync-state.json`, `scripts/`) `node scripts/sync-tistory-series/index.js`를 실행한다. 기대 결과: `.github/series-assignments.json`이 생기지 않고, 목차 파일 diff는 실제로 바뀐 글의 항목만 보인다.

## 3. 병합

004 → 005 순서로 main에 병합한다. 병합 전 main의 봇이 `series-assignments.json`을 수정했다면 수정/삭제 충돌이 나는데, 삭제 쪽을 택한다(`git rm .github/series-assignments.json`). 그 사이 봇이 목차 파일을 바꿨다면 병합 결과에서 `npm test`(무결성 테스트)로 다시 확인한다.

## 4. 운영 확인

병합 후 아무 시리즈 목차의 두 항목 순서를 바꿔 push하고, 그 시리즈에 새 글이 붙은 뒤에도 그 순서가 유지되는지 본다.
