# Quickstart: 수정된 게시글 제목 반영 검증

## 사전 준비

- Node.js 24 (로컬은 저장소의 `.tools/node-v24.18.0-win-x64`를 PATH에 추가해 사용)
- 외부 npm 의존성 없음

## 1. 전체 테스트

```bash
npm test
```

기대 결과: 모든 테스트 통과. 특히 다음이 포함된다.

- `run.test.js` — 이미 목차에 있는 게시글의 제목을 바꾸고 lastmod를 커트라인 이후로 둔 상태로 `run()`을 돌리면 목차 제목이 바뀌고 커밋 요약에 "제목 갱신"이 집계된다(spec User Story 1). 신규 흐름으로 추가된 항목이 다음 실행 후에도 남는다(User Story 2).
- `seriesDataIntegrity.test.js` — 실제 저장소 데이터에서 INV-2, INV-3([data-model.md](./data-model.md)) 위반 0건(User Story 3, SC-002).

## 2. 수정 전 코드로 재현 확인(선택)

`run.test.js`의 User Story 1 테스트를 수정 전 `index.js`(`git show main:scripts/sync-tistory-series/index.js`)로 돌리면 목차 제목이 옛 제목으로 남아 실패해야 한다 — 테스트가 실제 원인을 재현하는지 확인하는 용도.

## 3. 운영 확인

기본 브랜치 병합 후, 목차에 있는 아무 게시글의 제목을 티스토리에서 수정하고 다음 예약 실행(최대 6시간)을 기다린다. 기대 결과: 커밋 `chore: 게시글 동기화 (...)` 본문에 "- 시리즈 / - 제목 갱신: 1건"이 나오고 해당 `*_series.json` 제목이 바뀐다.
