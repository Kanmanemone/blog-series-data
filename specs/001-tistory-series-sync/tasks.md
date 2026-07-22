---

description: "Task list template for feature implementation"
---

# Tasks: 티스토리 시리즈 목차 JSON 동기화 자동화

**Input**: Design documents from `/specs/001-tistory-series-sync/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Tests**: plan.md의 Project Structure와 research.md §8이 `node --test` 기반 단위 테스트 파일 구조를 명시적으로 설계했으므로, 각 모듈의 단위 테스트 작업을 포함한다.

**Organization**: 작업은 spec.md의 User Story(P1/P2)별로 그룹화되어 각 스토리를 독립적으로 구현·검증할 수 있다. (2026-07-22 결정으로 PR 검토 안전장치를 다루던 옛 User Story 3은 제거되었다 — spec.md Clarifications Session 2026-07-22 참고)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능(다른 파일, 미완료 작업에 대한 의존성 없음)
- **[Story]**: 이 작업이 속한 User Story(US1/US2)
- 모든 작업에 정확한 파일 경로를 포함한다

## Path Conventions

이 저장소는 빌드 구조가 없는 단일 프로젝트(plan.md Project Structure)이므로, 신규 코드는
저장소 루트의 `scripts/sync-tistory-series/`(스크립트 본체)와 `.github/workflows/`(트리거)에만
추가한다. 기존 `*_series.json`과 `keyword_filename_formatter.html`은 참고용이며 변경하지 않는다.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 자동화 스크립트를 위한 최소 디렉터리 구조 준비. Constitution III(독립형 바닐라
웹 유틸리티)의 취지에 따라 `package.json`이나 빌드 도구는 추가하지 않는다.

- [ ] T001 Create directory scaffold `scripts/sync-tistory-series/` and `scripts/sync-tistory-series/__tests__/` per plan.md Project Structure (첫 소스 파일 작성 시 함께 생성해도 무방)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: User Story 1·2 모두가 공통으로 의존하는 순수 모듈. 게시글 수집(sitemap), 시리즈명
추출, 동기화 상태 입출력, 기존 시리즈 파일 조회·매칭은 어느 스토리를 먼저 구현하든 먼저
갖춰져야 한다.

**⚠️ CRITICAL**: 이 Phase가 끝나기 전에는 User Story 작업을 시작할 수 없다.

- [ ] T002 [P] Implement sitemap fetch, `<url>` block parsing, post-path filtering, desktop/mobile ID merge in scripts/sync-tistory-series/sitemap.js (FR-001, FR-005, FR-006; research.md §2 — `^/(m/)?[0-9]+$` 패턴, `<loc>`/`<lastmod>` 정규식 추출, 커트라인 필터는 포함하지 않고 전체 게시글 목록을 반환; 주석은 한국어로, 구체적으로 작성 — Constitution II)
- [ ] T003 [P] Implement raw series name extraction and seriesId normalization in scripts/sync-tistory-series/seriesName.js (FR-008, FR-009; research.md §4 — `keyword_filename_formatter.html`과 동일한 공백 제거·소문자 변환·Windows 금지 문자 제거 로직 이식; 주석은 한국어로, 구체적으로 작성 — Constitution II)
- [ ] T004 [P] Implement sync state read/write and KST cutoff formatting in scripts/sync-tistory-series/syncState.js (FR-002, FR-003, FR-016; research.md §5, §7; data-model.md Sync State — `.github/sync-state.json`이 없으면 커트라인 없음으로 간주해 전체 sitemap을 대상으로 처리하는 기본 동작 포함; 주석은 한국어로, 구체적으로 작성 — Constitution II)
- [ ] T005 [P] Implement series file directory listing and seriesId matching (read-only) in scripts/sync-tistory-series/seriesFiles.js (FR-010, FR-017; data-model.md Series File — 저장소 루트 `*_series.json`을 모두 읽어 seriesId → 파일 매핑을 구성하는 함수만 우선 구현, 갱신/생성 함수는 US1·US2에서 추가; 주석은 한국어로, 구체적으로 작성 — Constitution II)
- [ ] T006 [P] Unit tests for sitemap.js in scripts/sync-tistory-series/__tests__/sitemap.test.js (FR-005 데스크톱/모바일 병합, FR-006 카테고리 페이지 등 비게시글 경로 제외)
- [ ] T007 [P] Unit tests for seriesName.js in scripts/sync-tistory-series/__tests__/seriesName.test.js (FR-008 마지막 `" - "` 기준 분리·대괄호 구간 제거·공백 정리, `" - "` 없는 제목의 추출 제외, FR-009 seriesId 정규화)
- [ ] T008 [P] Unit tests for syncState.js in scripts/sync-tistory-series/__tests__/syncState.test.js (FR-002 `+09:00` 오프셋 포맷, FR-003 `cutoff = 실행 시작 시각 - 5분`, 파일 부재 시 기본 동작)
- [ ] T009 [P] Unit tests for seriesFiles.js listing/matching in scripts/sync-tistory-series/__tests__/seriesFiles.test.js (FR-010 seriesId 일치 판정, 일치하는 파일이 없는 경우 판정)

**Checkpoint**: 이 시점 이후 User Story 1과 2를 병렬로 시작할 수 있다.

---

## Phase 3: User Story 1 - 정기 동기화로 기존 시리즈에 신규 게시글 반영 (Priority: P1) 🎯 MVP

**Goal**: 마지막 커트라인 이후 갱신된 게시글 중 기존 시리즈와 seriesId가 일치하는 것을 찾아,
해당 `*_series.json`에 항목을 추가해 기본 브랜치에 직접 커밋·푸시한다.

**Independent Test**: 마지막 커트라인 이후 `lastmod`가 갱신되고 기존 시리즈와 같은 seriesId를
가진 게시글을 하나 준비한 뒤 워크플로우를 실행해, 해당 시리즈 json에 새 항목이 추가되어
기본 브랜치에 커밋·푸시되는지 확인한다(quickstart.md 시나리오 1).

### Implementation for User Story 1

- [ ] T010 [US1] Implement cutoff-based candidate filtering in scripts/sync-tistory-series/index.js (FR-004: sitemap.js가 반환한 전체 게시글과 syncState.js가 읽은 저장된 cutoff를 비교해 `lastmod`가 더 최신인 게시글만 후보로 선별; depends on T002, T004)
- [ ] T011 [US1] Implement candidate post title fetch and HTML entity decoding in scripts/sync-tistory-series/index.js (FR-007; research.md §3 — `<title>([^<]*)<\/title>` 정규식, `&amp;`/`&lt;`/`&gt;`/`&quot;`/`&#39;` 다섯 개 엔티티만 방어적으로 치환; 엔티티 디코딩은 `decodeHtmlEntities(text)`처럼 별도 export 가능한 순수 함수로 작성해 단독 테스트가 가능하게 함; depends on T010)
- [ ] T012 [P] [US1] Unit tests for `decodeHtmlEntities` in scripts/sync-tistory-series/__tests__/index.test.js (`&amp;`/`&lt;`/`&gt;`/`&quot;`/`&#39;` 각 엔티티 치환, 엔티티 없는 원문 그대로 유지, 여러 엔티티가 섞인 제목 처리; covers T011)
- [ ] T013 [P] [US1] Implement append-to-existing-series function in scripts/sync-tistory-series/seriesFiles.js (FR-010, FR-011: seriesId가 일치하는 파일을 찾아 `items`에 동일 URL이 있으면 건너뛰고 없으면 배열 끝에 추가, 기존 순서 보존; 주석은 한국어로, 구체적으로 작성 — Constitution II; depends on T005)
- [ ] T014 [P] [US1] Add append/match test cases to scripts/sync-tistory-series/__tests__/seriesFiles.test.js (중복 URL 건너뛰기, 신규 URL이 배열 끝에 추가되는지, 기존 항목 순서가 보존되는지; covers T013)
- [ ] T015 [US1] Wire full orchestration in scripts/sync-tistory-series/index.js: sitemap 조회 → 커트라인 필터 → 제목 조회 → rawSeriesName/seriesId 계산 → 기존 파일 매칭 → 항목 추가 → syncState의 cutoff·processedPosts 갱신(FR-015는 스크립트가 아니라 워크플로우의 git push 시점으로 보장되므로 스크립트는 워킹 트리 파일만 갱신). `" - "`가 없어 rawSeriesName을 추출하지 못한 게시글도 processedPosts에는 `rawSeriesName: null`로 기록한다(FR-016 "처리한 모든 게시글"에 해당하며, 후속 제목 변경 감지 기능의 이력 기반이 됨); 주석은 한국어로, 구체적으로 작성 — Constitution II (depends on T010, T011, T012, T013, T014)
- [ ] T016 [US1] Create GitHub Actions workflow in .github/workflows/tistory-series-sync.yml (FR-014: cron 스케줄 + `workflow_dispatch` 트리거로 `node scripts/sync-tistory-series/index.js` 실행; job 권한을 `contents: write`로 설정; git 사용자를 `github-actions[bot]`으로 구성; `git status --porcelain`이 비어 있으면(변경 없음) 커밋·푸시 단계를 건너뛰고, 변경이 있으면 변경된 `*_series.json`과 `.github/sync-state.json`을 커밋해 기본 브랜치로 `git push` — 병합 검토 없이 즉시 반영(research.md §6); depends on T015)

**Checkpoint**: 이 시점에서 User Story 1은 완전히 동작하며 quickstart.md 시나리오 1로 독립적으로
검증 가능하다.

---

## Phase 4: User Story 2 - 새로운 시리즈 자동 생성 (Priority: P2)

**Goal**: 기존 시리즈와 매칭되지 않는 seriesId를 가진 게시글이 현재 sitemap에 2개 이상
공개되어 있을 때만 새 `<seriesId>_series.json` 파일을 생성해 기본 브랜치에 직접 커밋·푸시한다.

**Independent Test**: 어떤 기존 시리즈 파일의 seriesId와도 일치하지 않는 seriesId를 가진
게시글을 두 개(같은 seriesId) 준비해 워크플로우를 실행하고 새 파일이 생성되어 커밋·푸시되는지,
하나만 준비했을 때는 파일이 생성되지 않는지 확인한다(quickstart.md 시나리오 2).

### Implementation for User Story 2

- [ ] T017 [US2] Implement cross-run sibling counting in scripts/sync-tistory-series/seriesFiles.js (FR-012: 이번 실행에서 매칭 실패한 후보들 중 같은 seriesId를 공유하는 것들과, syncState.js의 `processedPosts`에 기록된 같은 seriesId 이력 중 현재 sitemap(T002 결과)에도 여전히 존재하는(공개된) 게시글을 합산해 "현재 sitemap에 존재하는 공개 게시글" 수를 셈; data-model.md 상태 전이 참고; 주석은 한국어로, 구체적으로 작성 — Constitution II; depends on T013)
- [ ] T018 [US2] Implement create-new-series-file function in scripts/sync-tistory-series/seriesFiles.js (FR-012 임계치 2개 이상, FR-013 `listName`은 가장 먼저 발견된 게시글의 rawSeriesName, `items`는 `lastmod` 오름차순(발행 순서), FR-017 기존 스키마 준수; 주석은 한국어로, 구체적으로 작성 — Constitution II; depends on T017)
- [ ] T019 [P] [US2] Add creation-threshold test cases to scripts/sync-tistory-series/__tests__/seriesFiles.test.js (같은 seriesId 공개 게시글이 1개면 파일 미생성 확인 SC-005, 2개 이상이면 파일 생성·`listName`·발행 순서 확인; covers T017, T018)
- [ ] T020 [US2] Extend orchestration in scripts/sync-tistory-series/index.js to branch into the create-new-file path when no existing series file matches (주석은 한국어로, 구체적으로 작성 — Constitution II; depends on T015, T017, T018, T019)

**Checkpoint**: 이 시점에서 User Story 1과 2가 모두 독립적으로 동작한다.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 여러 User Story에 걸친 마무리 작업

- [ ] T021 Add fetch-failure and git-push-failure error handling with specific Korean log messages (sitemap 조회 실패, 게시글 제목 조회 실패, 두 실행이 겹쳐 push가 거부된 경우 각각 어떤 URL/단계에서 어떤 이유로 실패했는지 로그에 남기고, push 실패 시 자동 재시도 없이 워크플로우를 실패로 종료) in scripts/sync-tistory-series/index.js and .github/workflows/tistory-series-sync.yml (주석은 한국어로, 구체적으로 작성 — Constitution II; depends on T015, T016, T020)
- [ ] T022 [P] Run full unit test suite `node --test scripts/sync-tistory-series` and fix any failures across scripts/sync-tistory-series/__tests__/
- [ ] T023 Execute quickstart.md 시나리오 1–4 end-to-end validation against a real branch (depends on T021, T022)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 의존성 없음 — 즉시 시작 가능
- **Foundational (Phase 2)**: Setup 완료 후 진행 — 모든 User Story를 블로킹함
- **User Story 1 (Phase 3)**: Foundational 완료 후 시작 가능. 다른 스토리에 의존하지 않음
- **User Story 2 (Phase 4)**: Foundational 완료 후 시작 가능하나, `seriesFiles.js`·`index.js`를
  같은 파일에서 이어서 수정하므로(T017·T018이 T013 위에, T020이 T015 위에 쌓임) 실질적으로
  User Story 1 구현 완료 후 진행하는 것을 권장
- **Polish (Phase 5)**: 원하는 모든 User Story 완료 후 진행

### User Story Dependencies

- **User Story 1 (P1)**: Foundational 이후 시작 가능, 다른 스토리 의존 없음
- **User Story 2 (P2)**: Foundational 이후 시작 가능하나 `seriesFiles.js`/`index.js`를 공유하는
  구현상 이유로 User Story 1 이후 진행 권장

### Within Each User Story

- 같은 파일(`index.js`, `seriesFiles.js`)을 다루는 작업은 선언된 순서대로 순차 진행
- 서로 다른 파일을 다루는 작업([P] 표시)은 병렬 진행 가능
- 각 스토리는 Checkpoint에서 quickstart.md 해당 시나리오로 독립 검증 후 다음 스토리로 이동

### Parallel Opportunities

- Foundational Phase의 T002–T009는 모두 서로 다른 파일이므로 병렬 진행 가능
- User Story 1의 T012(index.test.js)·T013·T014(seriesFiles.js 관련)는 T010·T011·T015(index.js
  관련) 작업과 병렬 진행 가능. T016(workflow yml)은 T015가 만드는 `index.js` 진입점을 호출만
  하므로 내용 작성 자체는 병렬 가능하나, 최종 동작 검증은 T015 완료 후 가능
- User Story 2의 T019(테스트)은 T017·T018 완료 후 그 결과를 검증하므로 순차 진행 권장

---

## Parallel Example: Foundational Phase

```bash
# Foundational 모듈을 동시에 구현:
Task: "Implement sitemap fetch/parse/filter in scripts/sync-tistory-series/sitemap.js"
Task: "Implement seriesName extraction/normalization in scripts/sync-tistory-series/seriesName.js"
Task: "Implement sync state read/write in scripts/sync-tistory-series/syncState.js"
Task: "Implement series file listing/matching in scripts/sync-tistory-series/seriesFiles.js"
```

## Parallel Example: User Story 1

```bash
# index.js 오케스트레이션 작업과 별도로 진행 가능한 병렬 작업:
Task: "Unit tests for decodeHtmlEntities in scripts/sync-tistory-series/__tests__/index.test.js"
Task: "Implement append-to-existing-series in scripts/sync-tistory-series/seriesFiles.js"
Task: "Add append/match test cases in scripts/sync-tistory-series/__tests__/seriesFiles.test.js"
```

---

## Implementation Strategy

### MVP First (User Story 1만)

1. Phase 1: Setup 완료
2. Phase 2: Foundational 완료(모든 스토리를 블로킹하므로 필수)
3. Phase 3: User Story 1 완료
4. **STOP and VALIDATE**: quickstart.md 시나리오 1로 User Story 1을 독립적으로 검증
5. 이 시점에서 이미 "기존 시리즈에 신규 게시글 자동 반영"이라는 핵심 가치를 제공

### Incremental Delivery

1. Setup + Foundational 완료 → 기반 준비 완료
2. User Story 1 추가 → 독립 검증 → 배포/데모(MVP!)
3. User Story 2 추가 → 독립 검증 → 배포/데모
4. 각 스토리는 이전 스토리를 깨지 않고 가치를 더함

---

## Notes

- [P] 작업 = 서로 다른 파일, 미완료 작업에 대한 의존성 없음
- [Story] 라벨은 추적성을 위해 작업을 특정 User Story에 매핑함
- 각 User Story는 독립적으로 완료·검증 가능해야 함
- 같은 파일(`index.js`, `seriesFiles.js`)을 여러 스토리가 이어서 수정하므로, 병렬 작업 시
  파일 충돌을 피하려면 해당 파일을 다루는 작업들은 한 사람/에이전트가 순서대로 처리할 것
- Checkpoint마다 quickstart.md의 해당 시나리오로 검증 후 다음 단계로 이동
- 코드를 작성하는 모든 작업은 Constitution II(주석은 한국어로, 구체적으로)를 따른다
- 모든 변경은 병합 검토 없이 기본 브랜치에 직접 커밋·푸시된다(spec.md Clarifications Session
  2026-07-22). 문제가 있으면 관리자가 `git revert`로 되돌린다.
