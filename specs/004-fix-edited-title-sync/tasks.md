# Tasks: 수정된 게시글 제목이 목차에 반영되지 않는 문제 수정

**Input**: Design documents from `/specs/004-fix-edited-title-sync/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: spec FR-005, FR-006이 회귀 테스트와 데이터 무결성 테스트를 명시적으로 요구하므로 테스트 태스크를 포함한다.

**Organization**: User Story 1·2는 둘 다 P1이며 함께 배포되어야 한다(spec User Story 2 "Why this priority"). US1만 먼저 배포하면 다음 드리프트 재조정이 swemo 435를 지운다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 다른 파일을 건드리고 미완료 태스크에 의존하지 않아 병렬 가능
- **[Story]**: 해당 user story (US1, US2, US3)

## Phase 1: Setup

- [X] T001 `package.json`의 `test` 스크립트에 `scripts/sync-tistory-series/__tests__/run.test.js`를 추가한다(파일 목록을 명시 나열하는 기존 방식 유지).

---

## Phase 2: Foundational (Blocking Prerequisites)

- [X] T002 `scripts/sync-tistory-series/__tests__/run.test.js`를 새로 만든다: 파일 최상단에서 `fs.mkdtempSync`로 만든 임시 디렉터리로 `process.chdir`한 뒤 `../index.js`를 require한다(`COMMIT_SUMMARY_PATH`가 require 시점의 cwd로 계산되므로 순서가 중요). 헬퍼: (a) `.github/sync-state.json`·`.github/series-assignments.json`·`<seriesId>_series.json`을 임시 디렉터리에 쓰는 함수, (b) `globalThis.fetch`를 `{ sitemapXml, posts: { [url]: { title, date } } }` 고정 응답으로 바꾸는 함수 — sitemap URL(`https://kenel.tistory.com/sitemap.xml`)이면 `<urlset><url><loc>…</loc><lastmod>…</lastmod></url>…</urlset>`을, 게시글 URL이면 `<title>${title}</title><span class="date">${date}</span>`을 `{ ok: true, text: async () => … }`로 돌려준다, (c) 각 테스트 시작 시 임시 디렉터리 안의 파일을 비우는 초기화. 아직 테스트 케이스는 넣지 않는다.

**Checkpoint**: `node --test scripts/sync-tistory-series/__tests__/run.test.js`가 0개 테스트로 성공한다.

---

## Phase 3: User Story 1 - 수정된 제목이 다음 정기 실행에서 목차에 반영된다 (Priority: P1) 🎯 MVP

**Goal**: 이미 목차에 있는 게시글이 수정되면 신규 게시글 흐름이 아니라 드리프트 감지 단계가 처리해, 같은 실행에서 목차 제목이 갱신된다(FR-001, FR-002).

**Independent Test**: T003의 통합 테스트가 통과한다.

### Tests for User Story 1

- [X] T003 [US1] `scripts/sync-tistory-series/__tests__/run.test.js`에 테스트 추가: 커트라인 `2026-10-07T13:48:30+09:00`, 처리 이력에 /427·/435(옛 제목 "Swemo - Iteration 8: Label과 Text 분리", lastMod `2026-10-07T03:30:05.000Z`), `swemo_series.json`과 배치 결정 swemo 그룹에 두 항목이 있는 상태에서, sitemap이 /435의 lastmod를 `2026-10-08T04:41:00.000Z`(커트라인 이후)로, 게시글 HTML이 새 제목 "Swemo - Iteration 8: Bulleted List 구현"을 주면 `run()` 후 (1) `swemo_series.json`의 /435 제목이 새 제목, (2) 배치 결정 swemo 그룹의 /435 제목도 새 제목, (3) `.sync-commit-summary.txt`에 "제목 갱신: 1건"이 있고 "정보 갱신"은 없다, (4) 게시글 HTML fetch가 /435에 대해 정확히 1번만 일어났다(SC-004)를 확인한다. 수정 전 코드에서는 (1)이 실패해야 한다.
- [X] T004 [P] [US1] `scripts/sync-tistory-series/__tests__/index.test.js`에 `excludeAlreadyListed` 단위 테스트 추가: (a) 처리 이력 있음 + 목차에 있음 → 제외, (b) 처리 이력 없음 + 목차에 있음 → 유지, (c) 처리 이력 있음 + 어떤 목차에도 없음 → 유지, (d) 처리 이력에 `deletedAt` 있음 + 목차에 있음 → 유지.

### Implementation for User Story 1

- [X] T005 [US1] `scripts/sync-tistory-series/index.js`에 순수 함수 `excludeAlreadyListed(candidates, processedPosts, seriesFiles)`를 추가·export한다: `deletedAt` 없는 처리 이력 레코드가 있고 `findSeriesIdForUrl(seriesFiles, canonicalUrl)`가 null이 아닌 후보를 뺀다. 주석에 "이 게시글은 처리 이력 lastMod가 보존되어 같은 실행의 selectDriftCandidates가 재확인한다, 여기서 처리하면 처리 이력이 먼저 덮어써져 드리프트가 영구히 감지되지 않았다(004 원인 분석)"를 구체적으로 적는다.
- [X] T006 [US1] `scripts/sync-tistory-series/index.js`의 `run()`에서 `filterCandidates` 직후 `listSeriesFiles()` 결과로 `excludeAlreadyListed`를 적용하고, 로그에 "이미 목차에 있어 드리프트 감지로 넘긴 게시글 n건"을 남긴다. 신규 게시글 처리 루프가 쓰던 `existingFilesForNewPosts`는 이 목록을 재사용한다.

**Checkpoint**: T003, T004 통과.

---

## Phase 4: User Story 2 - 신규 게시글 흐름으로 추가된 항목이 이후 재조정에서 사라지지 않는다 (Priority: P1)

**Goal**: 001 흐름이 목차에 쓴 항목이 같은 실행 안에서 배치 결정에도 기록된다(FR-003, INV-2).

**Independent Test**: T007 통합 테스트와 T008 단위 테스트 통과.

### Tests for User Story 2

- [X] T007 [US2] `scripts/sync-tistory-series/__tests__/run.test.js`에 테스트 추가: 배치 결정 swemo 그룹과 `swemo_series.json`에 /400·/427 두 항목이 있고, 처리 이력에 없는 새 게시글 /435("Swemo - Iteration 8: Label과 Text 분리")가 sitemap에 나타나는 1차 `run()` 후 배치 결정 swemo 그룹에 /435가 있음을 확인. 이어서 /427의 제목과 lastmod를 바꾼 sitemap으로 2차 `run()`(커트라인은 1차 실행이 쓴 값) 후 `swemo_series.json`에 /435가 그대로 남고 /427 제목만 바뀌었음을 확인한다. 또한 배치 결정에 그룹이 없던 시리즈에 처리 이력 형제 1건 + 새 글 1건으로 목차 파일이 새로 생성되는 경우, 실행 후 배치 결정 그룹이 생성된 파일의 두 URL을 모두 담는지 확인한다.
- [X] T008 [P] [US2] `scripts/sync-tistory-series/__tests__/seriesAssignments.test.js`에 `addPostsToGroup` 단위 테스트 추가: (a) 그룹이 없으면 목차 파일 기준으로 시드되고 `listName`이 파일 값, 전달한 게시글의 `publishedAt`이 채워진다, (b) 그룹이 이미 있으면 기존 항목 순서를 바꾸지 않고 새 게시글이 공개 시각 기준 위치에 들어간다, (c) 이미 있는 URL은 중복 추가되지 않고 제목만 갱신된다.

### Implementation for User Story 2

- [X] T009 [US2] `scripts/sync-tistory-series/seriesAssignments.js`에 `addPostsToGroup(assignments, seriesFile, posts)`를 추가·export한다: `ensureGroupSeeded(assignments, seriesFile.seriesId, seriesFile)` 후 각 `{url, title, publishedAt}`를 `upsertInGroup`으로 넣는다. 주석에 "재조정은 배치 결정 그룹으로 목차 파일을 덮어쓰므로, 001이 목차에 쓴 항목을 여기 기록하지 않으면 다음 재조정이 그 항목을 지운다(004, swemo 435 사례)"를 적는다.
- [X] T010 [US2] `scripts/sync-tistory-series/index.js`의 `run()`을 수정한다: (a) 배치 결정을 실행 초반 한 번 `readAssignments()`로 읽어 001·002 단계가 같은 객체를 쓰게 하고(드리프트 블록 안의 `readAssignments()` 호출 제거), (b) `appendToSeries` 성공 시 `addPostsToGroup(assignments, matched, [{ url: post.canonicalUrl, title: post.title, publishedAt: post.publishedAt }])`, (c) `createSeriesFile`로 파일을 만들었으면 `addPostsToGroup(assignments, created, allSiblings를 {url,title,publishedAt}로 변환한 배열)`(과거 이력 형제의 publishedAt은 `state.processedPosts` 값 사용, 없으면 null), (d) `writeAssignments(assignments)`는 001에서 목차가 바뀌었거나(`changedFiles.size > 0`) 드리프트 대상이 있었을 때 한 번만 호출한다.

**Checkpoint**: T003·T004·T007·T008 통과, 기존 테스트 전부 통과.

---

## Phase 5: User Story 3 - 이미 어긋난 3건이 복구된다 (Priority: P2)

**Goal**: 저장소 데이터의 INV-2, INV-3 위반 0건(FR-004, FR-006, SC-002).

**Independent Test**: T011 무결성 테스트 통과.

### Tests for User Story 3

- [X] T011 [P] [US3] `scripts/sync-tistory-series/__tests__/seriesDataIntegrity.test.js`에 테스트 2개 추가: (a) INV-3 — 모든 `*_series.json` 항목 제목이 `.github/sync-state.json`의 같은 URL 레코드 `title`과 같다(`title`이 없는 레코드는 건너뜀), (b) INV-2 — `.github/series-assignments.json`의 각 그룹에 대해 같은 이름의 목차 파일이 있으면 URL 집합과 URL별 제목이 같다. 위반 목록을 모아 `assert.deepEqual(offenders, [])`로 비교한다(기존 테스트와 같은 형식). 복구 전에는 435·212·412로 실패해야 한다.

### Implementation for User Story 3

- [X] T012 [US3] 일회성 데이터 복구(스크립트는 저장소에 남기지 않음): `swemo_series.json` /435, `그래프_series.json` /212, `2026buildwithaihands-oncampus_series.json` /412 항목 제목과 `.github/series-assignments.json`의 해당 제목을 `.github/sync-state.json` 제목으로 바꾸고, swemo 그룹에 /435를 `addPostsToGroup` 규칙(publishedAt = 처리 이력 값 `2026-08-25T06:47:00.000Z`)으로 추가한다. 항목 순서·다른 필드는 바꾸지 않는다.

**Checkpoint**: T011 통과.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T013 `npm test` 전체 통과 확인, quickstart.md 2번(수정 전 `index.js`로 T003이 실패함) 확인.
- [X] T014 [P] `README.md`가 스크립트 동작을 설명하는 범위(현재 한 줄 요약)라 변경이 필요 없는지 확인하고, 필요 없으면 손대지 않는다.

---

## Dependencies & Execution Order

- T001 → T002 → (US1: T003, T004 → T005 → T006) → (US2: T007, T008 → T009 → T010) → (US3: T011 → T012) → T013, T014
- US1과 US2는 같은 `index.js`의 `run()`을 고치므로 순차로 진행한다. 배포는 둘을 함께 한다.
- US3의 T011은 US1·US2와 독립(다른 파일)이라 언제든 작성 가능하지만, T012 복구는 코드 수정 이후에 한다(커밋 순서상 코드 → 데이터).

## Parallel Opportunities

- T004(index.test.js)와 T003(run.test.js)은 서로 다른 파일.
- T008(seriesAssignments.test.js)과 T007(run.test.js)은 서로 다른 파일.
- T011은 다른 모든 테스트 태스크와 병렬 가능.

## Implementation Strategy

- MVP = US1 + US2(둘 다 P1, 함께 배포 필수). US3는 데이터 복구로, 코드 수정과 같은 브랜치에서 마무리한다.
- 오버엔지니어링 금지: 상시 자가 치유, `run()` 의존성 주입 리팩터링, 스키마 변경은 하지 않는다(research.md 결정 3·4).

---

## Phase 7: Convergence

- [X] T015 `scripts/sync-tistory-series/__tests__/run.test.js`에 통합 테스트 추가: 목차 `swemo`·`flow`(각 2항목, 배치 결정 동일, 처리 이력 lastMod = sitemap lastmod)가 있는 상태에서 (a) swemo 항목 하나의 제목이 "Flow - …"로 바뀌고 lastmod가 커트라인 이후일 때 `run()` 후 그 URL이 `flow_series.json`에만 있고 `swemo_series.json`에는 없음(두 목차에 중복으로 남지 않음), (b) 다른 swemo 항목은 제목 그대로 lastmod만 커트라인 이후로 바뀌었을 때 그 항목 제목·위치가 그대로임을 확인 per US1/AC2, US1/AC3 (partial)
- [X] T016 `scripts/sync-tistory-series/index.js`의 `appendToSeries`가 false를 반환하는 분기 주석을 실제 도달 조건("목차에 이미 있지만 처리 이력이 없거나 삭제 확정된 레코드라 excludeAlreadyListed가 넘기지 않은 게시글")으로 고친다 per Constitution II (partial)
