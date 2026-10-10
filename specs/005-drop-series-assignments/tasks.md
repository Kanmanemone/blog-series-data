# Tasks: 배치 결정 파일 제거 — 목차 파일을 유일한 기준으로

**Input**: Design documents from `/specs/005-drop-series-assignments/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: spec FR-010과 SC-001~SC-004가 검증 가능한 회귀 테스트를 전제로 하고, 기존 `run.test.js` 통합 테스트가 이 구조 변경의 안전망이므로 테스트 태스크를 포함한다.

**Organization**: US1·US2는 둘 다 P1이고 같은 `run()` 재작성으로 함께 구현된다(배치 결정을 없애는 순간 기존 동작을 새 연산으로 옮겨야 하므로). 그래서 Phase 2(Foundational)에서 편집 연산과 `run()` 재작성을 하고, 각 스토리 Phase는 그 스토리의 수용 시나리오 테스트와 남은 차이를 다룬다.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 `package.json`의 `test` 스크립트에서 `scripts/sync-tistory-series/__tests__/reconcile.test.js`와 `scripts/sync-tistory-series/__tests__/seriesAssignments.test.js`를 뺀다.

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 `scripts/sync-tistory-series/seriesFiles.js`에 추가·export: (a) `findSeriesIdForUrl(seriesFiles, url)`(reconcile.js에서 그대로 이전), (b) `orderByPublishedAt(posts)` — 안정 정렬, `publishedAt` ISO 문자열 오름차순, `publishedAt`이 null/undefined인 글은 뒤로, 원본 배열을 바꾸지 않음, (c) `appendBatch(file, posts)` — posts(`{ title, canonicalUrl, publishedAt }`)를 `orderByPublishedAt`으로 정렬해 `file.data.items`에 없는 URL만 `{ title, url }`로 끝에 붙이고 붙인 개수를 반환, (d) `retitleItem(file, url, title)` — 같은 위치에서 title만 바꾸고 실제로 바뀌었으면 true, (e) `removeItem(file, url)` — 해당 항목을 빼고 뺐으면 true. 기존 `appendToSeries`는 삭제한다. 주석에 "기존 항목의 위치를 바꾸는 연산은 두지 않는다(헌법 v1.1.0 원칙 I)"를 적는다.
- [X] T003 `scripts/sync-tistory-series/seriesFiles.js`의 `createSeriesFile`을 lastmod 정렬 대신 `orderByPublishedAt`으로 정렬하도록 바꾸고(listName = 정렬 후 첫 글의 `rawSeriesName`), `collectSiblingCandidates`가 돌려주는 각 ref에 처리 이력 레코드의 `publishedAt`(없으면 null)을 함께 담는다.
- [X] T004 `scripts/sync-tistory-series/index.js`의 `run()` 001 단계 재작성: `readAssignments`·`addPostsToGroup` 제거. 후보 루프에서 (1) URL이 이미 `existingFilesForNewPosts`의 어떤 파일에 있으면 `retitleItem`으로 그 자리 제목만 갱신(바뀌면 `seriesRetitled`+1, 파일을 changedFiles에 추가, 아니면 `postInfoUpdate`+1)하고 다음 후보로(시리즈 추출 불가 판정보다 먼저), (2) 매칭 파일이 있으면 파일별로 모았다가 루프 뒤에 `appendBatch`(반환 개수만큼 `seriesAdded`), (3) 새 파일 생성은 기존 흐름 유지(과거 이력 형제는 T003의 publishedAt 사용).
- [X] T005 `scripts/sync-tistory-series/index.js`의 `run()` 002 단계 재작성: 드리프트 대상이 있으면 `listSeriesFiles()`로 읽은 목록을 메모리에서 고친다. 파일별 `{ added, removed, retitled }` 집계 Map과 새로 만든 파일 목록을 둔다. 삭제 확정 → 목차에 있으면 `removeItem`, 없으면 `postDeleted`+1. 목차 밖 → `postInfoUpdate`+1. 제목 동일 재확인 → `postInfoUpdate`+1(기존 규칙). 같은 시리즈 또는 시리즈 추출 불가 → `retitleItem`. 다른 시리즈 → 재분류 후보로 모았다가 목표 seriesId별로: 목표 파일이 있거나 이동 글이 2개 이상이면 옛 파일들에서 `removeItem` 후 목표 파일에 `appendBatch`(없으면 `createSeriesFile`로 생성, listName은 정렬 후 첫 글의 원시 시리즈명), 아니면 옛 파일에서 `retitleItem`. 마지막에 손댄 파일마다 items가 1개 이하면 파일 삭제(`seriesDeleted`+1, 그 파일 집계는 버림), 아니면 쓰고 집계를 `seriesAdded/Removed/Retitled`에 더한다. 새 파일은 `seriesCreated`+1. 바뀌지 않은 파일은 쓰지 않는다(FR-009). `reconcile`·`seriesAssignments` require와 `writeAssignments` 호출 제거.
- [X] T006 `scripts/sync-tistory-series/seriesAssignments.js`, `scripts/sync-tistory-series/reconcile.js`, `scripts/sync-tistory-series/__tests__/seriesAssignments.test.js`, `scripts/sync-tistory-series/__tests__/reconcile.test.js`를 삭제하고, `findSeriesIdForUrl` 단위 테스트는 `scripts/sync-tistory-series/__tests__/seriesFiles.test.js`로 옮긴다. `seriesFiles.test.js`의 `appendToSeries` 테스트 2개는 `appendBatch` 테스트로 바꾸고, `createSeriesFile` 정렬 테스트는 "공개 시각 순, lastmod 무관"으로 바꾼다.
- [X] T007 `scripts/sync-tistory-series/__tests__/run.test.js`에서 배치 결정 관련 준비·검증(`ASSIGNMENTS_PATH` 쓰기·읽기)을 빼고 목차 파일 결과로만 검증하도록 기존 4개 테스트를 고친다. 각 테스트 끝에 `.github/series-assignments.json`이 존재하지 않음을 확인한다(US2/AC1).

**Checkpoint**: `npm test` 전체 통과.

---

## Phase 3: User Story 1 - 관리자가 바꾼 순서가 계속 유지된다 (Priority: P1) 🎯 MVP

**Goal**: 기존 항목 순서가 어떤 자동 편집에서도 바뀌지 않는다(FR-002, SC-001).

**Independent Test**: T008 통과.

- [X] T008 [US1] `scripts/sync-tistory-series/__tests__/run.test.js`에 테스트 추가: 목차 `swemo`를 공개 시각과 다른 순서 [C, A, B]로 두고(처리 이력 공개 시각은 A<B<C), 목차 `flow` [F1, F2]가 있을 때 한 실행에서 (1) 새 글 D가 swemo에 들어옴, (2) A 제목 변경 → 다음 실행에서 `swemo` = [C, A(새), B, D], 이어서 (3) B가 flow로 재분류되는 실행 → swemo [C, A, D], flow [F1, F2, B], (4) A 삭제 확정 실행 → swemo [C, D]. 각 단계에서 순서를 `deepEqual`로 확인한다.

**Checkpoint**: T008 통과.

---

## Phase 4: User Story 2 - 배치 결정 없이도 기존 자동 동기화가 그대로 동작한다 (Priority: P1)

**Goal**: 재분류 보류/생성, 2개 미만 삭제, 카테고리 집계 유지(FR-005, FR-006, FR-008).

**Independent Test**: T009, T010 통과.

- [X] T009 [P] [US2] `scripts/sync-tistory-series/__tests__/run.test.js`에 테스트 추가: (a) 목차에 있는 글 하나만 아직 파일이 없는 새 시리즈로 이름이 바뀌면 옛 목차에 남고 제목만 갱신(`제목 갱신: 1건`), (b) 같은 실행에서 두 글(서로 다른 목차)이 같은 새 시리즈로 바뀌면 새 목차가 공개 시각 순 두 항목으로 생성되고 각 옛 목차에서 빠짐(커밋 요약 `생성: 1건`, 옛 목차가 남으면 `항목 제거`), (c) 항목 2개인 목차에서 하나가 삭제 확정되면 파일이 삭제되고 요약은 `삭제: 1건`만 있고 `항목 제거`는 없음.
- [X] T010 [P] [US2] `scripts/sync-tistory-series/__tests__/seriesDataIntegrity.test.js`에서 004 INV-2(배치 결정 비교) 테스트와 `readAssignments` require를 지우고, "한 URL은 최대 한 목차에만 있다" 테스트를 추가한다(위반 목록을 `assert.deepEqual(offenders, [])`로 비교).

**Checkpoint**: T009, T010 통과.

---

## Phase 5: User Story 3 - 여러 글을 한꺼번에 붙일 때는 공개 시각 순이다 (Priority: P2)

**Goal**: FR-003.

**Independent Test**: T011, T012 통과.

- [X] T011 [P] [US3] `scripts/sync-tistory-series/__tests__/seriesFiles.test.js`에 `orderByPublishedAt` 테스트 추가: 공개 시각 오름차순, null은 뒤로, 같은 값·둘 다 null이면 입력 순서 유지, 원본 배열 불변.
- [X] T012 [US3] `scripts/sync-tistory-series/__tests__/run.test.js`에 테스트 추가: (a) 기존 목차에 같은 실행에서 새 글 X(공개 늦음, sitemap 앞)와 Y(공개 이른, sitemap 뒤)가 들어오면 [기존…, Y, X], (b) 처리 이력의 P(공개 이른, lastmod 최근)와 새 글 Q(공개 늦음)로 새 목차가 생기면 [P, Q]. 테스트 하네스의 `mockFetch`가 URL별 공개 시각을 받을 수 있게 `date` 필드를 추가한다(없으면 기존 고정값).

**Checkpoint**: T011, T012 통과.

---

## Phase 6: User Story 4 - 직접 추가한 목차 항목의 제목도 따라간다 (Priority: P3)

**Goal**: FR-007.

**Independent Test**: T013 통과.

- [X] T013 [US4] `scripts/sync-tistory-series/__tests__/run.test.js`에 테스트 추가: 처리 이력이 없는 글 M이 `swemo`에 있고, M의 새 제목이 다른 기존 시리즈 `flow`를 가리키며 lastmod가 커트라인 이후일 때 → `swemo`에서 M의 제목만 바뀌고 위치 유지, `flow`에는 추가되지 않음, 요약 `제목 갱신: 1건`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T014 [P] `.github/workflows/tistory-series-sync.yml`, `.github/workflows/tistory-series-sync-manual.yml`에서 `series-assignments.json`을 `git add`하는 `if` 블록 3줄을 지운다.
- [X] T015 `git rm .github/series-assignments.json`.
- [X] T016 `scripts/sync-tistory-series/`에서 `assignments`·`reconcile`·`배치 결정`·`seriesAssignments` 잔존 참조(주석 포함)를 grep해 현재 동작에 맞게 고친다(`index.js`의 `extractPublishedAt` 주석의 `insertByPublishedAt` 언급 등).
- [X] T017 `npm test` 전체 통과 확인, quickstart.md 2번(실제 sitemap 드라이런: 배치 결정 파일 미생성, 목차 diff 없음 또는 실제 변경분만) 확인.

---

## Dependencies & Execution Order

- T001 → T002 → T003 → T004 → T005 → T006 → T007 → (US1 T008) → (US2 T009, T010) → (US3 T011, T012) → (US4 T013) → T014~T017
- T002~T005는 같은 두 파일을 순서대로 고치므로 순차.
- 스토리 Phase들은 테스트 추가 위주라 Phase 2 이후 서로 독립.

## Parallel Opportunities

- T009(run.test.js)와 T010(seriesDataIntegrity.test.js), T011(seriesFiles.test.js)은 서로 다른 파일.
- T014는 다른 태스크와 파일이 겹치지 않는다.

## Implementation Strategy

- MVP = Phase 2 + US1 + US2(P1, 함께 배포). US3·US4는 같은 브랜치에서 마무리.
- 오버엔지니어링 금지: 001·002 단계 통합, 새 모듈 추가, 영구 제외 목록 같은 기능은 만들지 않는다(research.md 결정 3).

---

## Phase 8: Convergence

- [X] T018 `scripts/sync-tistory-series/__tests__/run.test.js`에 통합 테스트 추가: 처리 이력 제목이 "Newx - 1"인 글 H가 재분류 보류로 `swemo`(항목 3개)에 남아 있는 상태에서, 새 글 "Newx - 2"가 들어와 001이 `newx_series.json`을 만들면 H가 `newx`로 옮겨지고 `swemo`에서 빠지는지(두 목차에 동시에 없음) 확인 per SC-004 (partial)
- [X] T019 `scripts/sync-tistory-series/__tests__/run.test.js`의 "신규 게시글 흐름이 기존 목차에 추가한 항목은…" 테스트 1차 실행 뒤 커밋 요약에 `항목 추가: 1건`이 있는지 단언 추가 per US2/AC5 (partial)
