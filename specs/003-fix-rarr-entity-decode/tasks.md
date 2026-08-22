---

description: "Task list template for feature implementation"
---

# Tasks: HTML 엔티티 디코딩 누락 수정 (&rarr;)

**Input**: Design documents from `/specs/003-fix-rarr-entity-decode/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: 이 기능은 스펙(User Story 2, 3)에서 테스트를 명시적으로 요구하므로 테스트 태스크를 포함한다.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Single project(기존 `scripts/sync-tistory-series/` 구조)를 그대로 사용한다. 새 디렉터리를
만들지 않는다.

---

## Phase 1: Setup

이 기능은 새 프로젝트 초기화, 새 의존성, 새 도구 설정이 필요 없다(기존 Node.js 스크립트
저장소를 그대로 사용). Setup 단계는 해당 없음 — Phase 2로 바로 진행한다.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `&rarr;` 디코딩 자체를 가능하게 하는 핵심 수정. User Story 1(저장된 값 보정)과
User Story 2(디코더 테스트)가 모두 이 결과값에 의존한다.

**⚠️ CRITICAL**: 이 태스크가 끝나야 User Story 1, 2의 "올바른 값"이 확정된다.

- [X] T001 `scripts/sync-tistory-series/index.js`의 `HTML_ENTITIES` 객체에 `"&rarr;": "→"`
  항목을 추가하고, `decodeHtmlEntities`의 정규식(`/&amp;|&lt;|&gt;|&quot;|&#39;/g`)에
  `&rarr;`를 대안으로 포함해 `/&amp;|&lt;|&gt;|&quot;|&#39;|&rarr;/g`로 확장한다. 기존
  다섯 엔티티 처리 방식(구체적 사실을 적는 한국어 주석 스타일 포함)을 그대로 유지한다.

**Checkpoint**: `decodeHtmlEntities("Navigation 2 &rarr; 3")`가 `"Navigation 2 → 3"`을
반환함을 수동으로(node -e 등) 확인한 뒤 User Story 단계로 진행한다.

---

## Phase 3: User Story 1 - 시리즈 목차에서 실제 화살표를 본다 (Priority: P1) 🎯 MVP

**Goal**: navigation_series.json과 .github/sync-state.json에 이미 잘못 저장된 `&rarr;` 값을
`→`로 직접 수정한다.

**Independent Test**: 두 파일에서 `&rarr;` 문자열을 grep했을 때 결과가 없고, title이
`→`를 포함함을 확인한다(spec.md Acceptance Scenarios 1, 2 / quickstart.md 3단계).

### Implementation for User Story 1

- [X] T002 [P] [US1] `navigation_series.json`에서 url이
  `https://kenel.tistory.com/433`인 항목의 title을
  `"[Android] Navigation - Navigation 2 → 3"`으로 수정한다(다른 필드·항목·파일 구조는
  건드리지 않는다, Constitution I).
- [X] T003 [P] [US1] `.github/sync-state.json`의 `processedPosts` 배열에서 url이
  `https://kenel.tistory.com/433`인 레코드의 title을 T002와 동일한 문자열로 수정한다.
  `lastMod`, `publishedAt`, `processedAt`은 변경하지 않는다(data-model.md 참고 — 이번
  보정은 드리프트 이벤트가 아니다).

**Checkpoint**: User Story 1은 이 두 파일 수정만으로 완전히 검증 가능하며 독립적으로 배포
가능하다(quickstart.md 3단계 통과).

---

## Phase 4: User Story 2 - 앞으로 같은 종류의 엔티티가 다시 나타나도 목차가 깨지지 않는다 (Priority: P2)

**Goal**: `decodeHtmlEntities`가 `&rarr;`를 올바르게 처리하고 기존 다섯 엔티티도 회귀 없이
계속 처리함을 자동화된 테스트로 고정한다.

**Independent Test**: `npm test` 실행 시 `index.test.js`의 `decodeHtmlEntities` 테스트가
신규 `&rarr;` 케이스를 포함해 전부 통과한다.

### Tests for User Story 2

- [X] T004 [US2] `scripts/sync-tistory-series/__tests__/index.test.js`의
  `decodeHtmlEntities` 테스트 스위트에 `"Navigation 2 &rarr; 3"` → `"Navigation 2 → 3"`
  케이스를 추가한다. 기존 다섯 엔티티 케이스(각각 개별 치환, 엔티티 없는 원문 유지, 여러
  엔티티 혼합)는 그대로 둔다(depends on T001).

**Checkpoint**: `npm test`로 index.test.js를 실행해 신규 케이스와 기존 회귀 케이스가 모두
통과함을 확인한다.

---

## Phase 5: User Story 3 - 저장소 전체에 같은 패턴의 미해석 엔티티가 남아있지 않음을 확인한다 (Priority: P3)

**Goal**: 모든 `*_series.json`의 title에 미해석 HTML named entity가 없음을 재현 가능한
테스트로 고정한다.

**Independent Test**: 신규 테스트 파일을 단독 실행해도(`node --test
scripts/sync-tistory-series/__tests__/seriesDataIntegrity.test.js`) 통과한다.

### Tests for User Story 3

- [X] T005 [P] [US3] `scripts/sync-tistory-series/__tests__/seriesDataIntegrity.test.js`를
  새로 작성한다: 저장소 루트의 모든 `*_series.json` 파일을 읽어 각 `items[].title`이
  `/&[a-zA-Z][a-zA-Z0-9]*;/` 패턴에 매치되지 않음을 단언한다(T002 수정 후 navigation도
  통과해야 함).
- [X] T006 [US3] `package.json`의 `scripts.test` 커맨드에
  `scripts/sync-tistory-series/__tests__/seriesDataIntegrity.test.js`를 다른 테스트
  파일들과 같은 방식으로 추가해 `npm test` 실행 시 함께 돌도록 한다(depends on T005).

**Checkpoint**: `npm test`가 신규 테스트 파일을 포함해 전체 통과한다.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 전체 변경에 대한 최종 검증.

- [X] T007 `npm test`를 실행해 기존 6개 테스트 파일 + 신규
  `seriesDataIntegrity.test.js`가 모두 통과함을 확인한다(전체 회귀 없음 확인).
- [X] T008 `quickstart.md`의 1~3단계를 순서대로 실행해 버그 재현(구현 전 상태였다면)과
  보정 결과를 최종 확인한다.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup**: 해당 없음.
- **Foundational (Phase 2, T001)**: 다른 모든 단계보다 먼저 완료해야 한다 — User Story
  1의 "올바른 값"과 User Story 2의 테스트 기대값이 모두 이 함수의 출력에 근거한다.
- **User Story 1 (Phase 3)**: Foundational 이후 시작 가능. User Story 2, 3과 파일이
  겹치지 않아 병렬 가능.
- **User Story 2 (Phase 4)**: Foundational 이후 시작 가능. User Story 1과 독립적.
- **User Story 3 (Phase 5)**: Foundational과 무관(기존 데이터 grep으로 이미 확인된 대로,
  현재는 navigation 외 매치가 없음)하지만, T002가 반영된 뒤 실행해야 navigation도
  통과함이 의미 있으므로 T002 이후 실행을 권장한다.
- **Polish (Phase 6)**: 모든 User Story 완료 후 진행.

### Within Each User Story

- User Story 1: T002, T003은 서로 다른 파일이라 병렬 가능.
- User Story 2: T004 단일 태스크.
- User Story 3: T005(새 파일 작성) 이후 T006(package.json 등록) — 순차.

### Parallel Opportunities

- T002와 T003은 병렬 가능(서로 다른 파일).
- T005(새 테스트 파일)는 T002~T004와 파일이 겹치지 않아 병렬 가능하나, T006은 T005 완료 후
  진행한다.

---

## Parallel Example: User Story 1

```bash
# T002, T003을 함께 진행 가능:
Task: "navigation_series.json의 title 수정"
Task: ".github/sync-state.json의 title 수정"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 2(T001) 완료 — 올바른 디코딩 결과 확정.
2. Phase 3(T002, T003) 완료 — 독자가 실제로 보는 화살표 문제 해결(MVP).
3. **STOP and VALIDATE**: navigation_series.json / sync-state.json grep으로 확인.

### Incremental Delivery

1. Foundational(T001) → User Story 1(T002, T003) → 독자 체감 버그 해결(MVP).
2. User Story 2(T004) → 재발 방지 회귀 테스트 확보.
3. User Story 3(T005, T006) → 저장소 전체 범위 확인을 반복 가능하게 고정.
4. Polish(T007, T008) → 전체 검증.

---

## Notes

- 태스크 수가 적은 소규모 버그 수정이므로 팀 병렬 전략(Parallel Team Strategy) 섹션은
  생략한다 — 오버엔지니어링 방지.
- 각 태스크 완료 후 커밋할 필요는 없다(구현 단계 전체를 `/speckit-implement`가 한 번에
  처리하고, CLAUDE.md 정책에 따라 스킬 종료 후 커밋 1개를 만든다).

---

## Phase 7: Convergence

`/speckit-converge`가 구현 완료 후 저장소 전체를 감사하는 과정에서, `&rarr;`와 같은 버그
클래스(디코딩되지 않은 HTML named entity가 `.github/sync-state.json`에 원문 그대로 저장됨)의
또 다른 실측 사례를 발견했다: url `https://kenel.tistory.com/`(백준 11726 게시글)의 title이
`"[백준] 11726 (2&times;n 타일링)"`으로 `&times;`(×)가 미해석 상태다. 이 게시글은 어떤
`*_series.json`에도 속해있지 않아(단독 게시글) FR-005의 회귀 테스트 범위 밖이었다.

- [X] T009 [P] `scripts/sync-tistory-series/index.js`의 `HTML_ENTITIES`에
  `"&times;": "×"` 항목을 추가하고 `decodeHtmlEntities`의 정규식에 `&times;`를 포함시킨다
  per plan.md 결정 1 (missing)
- [X] T010 [P] `.github/sync-state.json`에서 title에 `"[백준] 11726 (2&times;n 타일링)"`을
  포함하는 레코드를 찾아 `"[백준] 11726 (2×n 타일링)"`으로 수정한다(`lastMod` 등 다른
  필드는 건드리지 않음, T003과 동일한 원칙) per Edge Cases (missing)
- [X] T011 `scripts/sync-tistory-series/__tests__/index.test.js`의
  `decodeHtmlEntities` 테스트에 `&times;` → `×` 회귀 케이스를 추가한다(depends on T009) per
  FR-006 (missing)

---

## Phase 8: 사용자 피드백 — 재발 방지 구조 개선

T009-T011로 `&times;`를 고친 직후, 사용자가 "그런 식으로 주먹구구식으로 하면 안 되고, 원인을
분석해서 비슷한 일이 아예 재발하지 않게 해야 한다"고 지적했다. `&rarr;` → `&times;`로
이어진 패턴이 바로 그 증거다: "실측되는 대로 하나씩 이름을 등록"하는 방식은 세 번째,
네 번째 미등록 엔티티에 대해서도 똑같이 조용히 실패한다. research.md 결정 3에 따라
decodeHtmlEntities를 구조적으로 재설계한다(spec.md FR-007, FR-008, US2 개정).

- [X] T012 `scripts/sync-tistory-series/index.js`에서 `HTML_ENTITIES`를
  `NAMED_HTML_ENTITIES`로 재구성하고(`&#39;`는 숫자 참조이므로 표에서 제거),
  `decodeHtmlEntities`가 `&#39;`(decimal)·`&#x2192;`(hex) 형태의 숫자 문자 참조를
  `String.fromCodePoint`로 항상 디코딩하도록 정규식과 치환 로직을 다시 작성한다 per
  FR-007 (missing)
- [X] T013 `scripts/sync-tistory-series/index.js`에 `hasUnresolvedNamedEntity(text)`를
  추가해 디코딩 후에도 이름 있는 엔티티 패턴(`/&[a-zA-Z]+;/`)이 남아있는지 감지하고,
  `extractTitle`이 그 경우 게시글 URL과 남은 제목을 포함한 명확한 에러를 던지도록
  수정한다. 이 에러는 `run()`의 기존 `fetchPostTitle`/`fetchPostDetails` 호출부
  try/catch(001부터 존재)에 자연히 걸려 그 게시글만 건너뛴다(새 재시도 장치를 만들지
  않음, research.md 결정 3의 기각 사유 참고) per FR-008 (missing)
- [X] T014 [P] `decodeHtmlEntities`와 `extractTitle`, `hasUnresolvedNamedEntity`를
  `module.exports`에 추가해 단위 테스트에서 직접 호출 가능하게 한다 per US2/AC3, US2/AC4
  (missing)
- [X] T015 `scripts/sync-tistory-series/__tests__/index.test.js`에 (a) 등록되지 않은
  숫자 문자 참조(`&#169;`, `&#x2192;`)가 코드 수정 없이 디코딩되는 테스트, (b)
  `hasUnresolvedNamedEntity`가 화이트리스트에 없는 이름만 감지하는 테스트, (c)
  `extractTitle`이 미등록 이름 있는 엔티티에 대해 던지는 테스트, (d) 알려진 엔티티에
  대해서는 정상 반환하는 회귀 테스트를 추가한다 per US2/AC3, US2/AC4, SC-004 (missing)

**Checkpoint**: `npm test` 전체 통과, 저장소 전체 JSON 재스캔 결과 미해석 엔티티 0건
(quickstart.md 절차 재실행으로 확인).

---

## Phase 9: 사용자 피드백 — 화이트리스트를 표준 표로 대체

Phase 8을 커밋한 뒤 사용자가 "화이트리스트를 왜 관리하냐, String.fromCodePoint로 다
해결되는 거 아니냐"고 질문했다. 답은 "숫자 문자 참조는 그렇지만 이름 있는 엔티티는
이름 자체에 코드포인트 정보가 없어 표가 필요하다"였고, 이어서 "그 표를 손으로 6개만
채우지 말고 표준이 이미 확정한 표를 통째로 쓰자"는 방향으로 사용자가 직접 선택했다
(research.md 결정 4).

- [X] T016 `scripts/sync-tistory-series/htmlNamedEntities.js`를 신규 작성해 HTML
  4.01/XHTML1이 정의한 이름 있는 문자 참조 표 전체(252개, 기본 마크업 4 + Latin-1 96 +
  기호·수학·그리스 문자 + 추가 특수 문자)를 이름→유니코드 코드포인트(숫자) 객체로
  내장한다 per research.md 결정 4 (missing)
- [X] T017 `scripts/sync-tistory-series/index.js`의 `decodeHtmlEntities`가
  `htmlNamedEntities.js`를 require해 이름 있는 엔티티도 숫자 문자 참조와 동일하게
  `String.fromCodePoint` 경로로 디코딩하도록 재작성한다(기존 6개짜리
  `NAMED_HTML_ENTITIES` 상수 제거). `hasUnresolvedNamedEntity`/`extractTitle`의
  실패 감지는 그대로 유지해 표에도 없는 이름에 대한 최후 안전망으로 남긴다 per FR-002
  (missing)
- [X] T018 [P] `htmlNamedEntities.js`의 값이 정확한지 `String.fromCodePoint`로
  최소 40개 항목(자주 쓰이는 기호·화살표·그리스 문자·이 저장소가 실제로 겪은 `&rarr;`/
  `&times;` 포함)을 실제 유니코드 문자와 대조하고, 중복 코드포인트가 없는지 스팟체크한다
  per SC-005 (missing)
- [X] T019 `scripts/sync-tistory-series/__tests__/index.test.js`를 갱신한다: (a) 표준
  표에는 있지만 이 저장소가 등록한 적 없는 이름(`&copy;`, `&ndash;`, `&euro;`)이 코드
  수정 없이 디코딩되는 테스트 추가, (b) `hasUnresolvedNamedEntity`/`extractTitle`의
  실패 감지 테스트를 표준 표에도 없는 엔티티(`&checkmark;`, HTML5 전용)로 교체(기존
  `&copy;` 예시는 이제 표준 표에 있어 더 이상 실패 사례가 아님) per US2/AC4, US2/AC5,
  SC-004, SC-005 (missing)

**Checkpoint**: `npm test` 전체 통과, 저장소 전체 JSON 재스캔 결과 미해석 엔티티 0건.

---

## Phase 10: User Story 4 — 커밋 메시지 8-카테고리 집계 (spec.md, research.md 결정 5)

`&rarr;`/`&times;` 수정과는 독립적인 요구사항으로, 자동 동기화 커밋 메시지가 시리즈
파일 CUD만 세던 것을 게시글 3종 + 시리즈 5종, 총 8개 카테고리로 넓히고 형식을
"게시글"/"시리즈" 중첩 그룹 + 카테고리별 합산 건수로 바꾼다.

- [X] T020 `scripts/sync-tistory-series/reconcile.js`의 `reconcile(assignments, rootDir)`가
  파일별 CUD 배열 대신 `{created, added, removed, retitled, deleted}` 5개 숫자 집계를
  반환하도록 다시 쓴다(각 파일의 `diffItems` 결과를 배열에 담는 대신 실행 전체에 걸쳐
  합산). `findSeriesIdForUrl`은 그대로 둔다. JSDoc을 새 반환 형태에 맞게 갱신한다 per
  research.md 결정 5 (missing)
- [X] T021 [P] `scripts/sync-tistory-series/__tests__/reconcile.test.js`를 T020의 새
  반환 형태(`{created, added, removed, retitled, deleted}`)에 맞춰 갱신한다 — 기존
  테스트가 검증하던 시나리오(생성/삭제/추가·제거·제목갱신 혼합/변경 없음/범위 밖 파일
  무시)는 그대로 유지하되 단언(assert) 대상만 배열 원소에서 숫자 필드로 바꾼다
  (depends on T020) per research.md 결정 5 (missing)
- [X] T022 `scripts/sync-tistory-series/index.js`의 `run()`에 `postNew`/`postInfoUpdate`/
  `postDeleted` 카운터를 추가하고 다음 지점에서 직접 증가시킨다: (a) 001 신규 후보
  루프에서 `seriesId === null`인 후보와, `unmatchedBySeriesId` 그룹인데 형제가 2명
  미만이라 `createSeriesFile`이 파일을 안 만든 후보는 `postNew`; (b) 001에서
  `appendToSeries`가 이미 있는 URL이라 false를 반환하면 `postInfoUpdate`; (c) 002
  드리프트 재확인 루프에서, `upsertProcessedPost` 호출 전에 이전 title을 캡처해 새
  title과 비교 — `oldSeriesId`가 없거나 title 텍스트가 실제로 안 바뀌었으면
  `postInfoUpdate`; (d) 002 삭제 확정 루프에서 `oldSeriesId`가 없는 게시글은
  `postDeleted` per FR-009, FR-010, FR-011 (missing)
- [X] T023 [P] `scripts/sync-tistory-series/index.js`에 순수 함수
  `buildCommitMessageBody(counts)`를 추가한다 — 8개 카운트를 받아 "게시글"(새 글/정보
  갱신/삭제)·"시리즈"(생성/항목 추가/항목 제거/제목 갱신/삭제) 두 그룹으로 나눈 본문
  문자열을 만든다. n=0인 카테고리 줄 생략(FR-014), 그룹 전체 합이 0이면 헤더 줄 생략
  (FR-015), 카테고리 줄은 `  - <라벨>: n건`(2칸 들여쓰기). 같은 파일에서 `buildNewPostCud`,
  `renderCommitSummary`, `CUD_TYPE_LABEL`을 제거한다(더 이상 쓰이지 않음) per FR-012,
  FR-013, FR-014, FR-015 (missing)
- [X] T024 `scripts/sync-tistory-series/index.js`의 `writeCommitSummary`를
  `writeCommitSummary(counts)`로 바꾼다 — N(8개 카운트의 합, FR-016)을 첫 줄에, T023의
  `buildCommitMessageBody(counts)` 결과를 이어지는 줄에 써서 `.sync-commit-summary.txt`를
  만든다(N===0이면 기존처럼 파일을 만들지 않음/지운다). `run()`에서 001의
  `seriesCreated`/`seriesAdded`(changedFiles·appendCountsByFile 기반)와 T020의 002
  집계, T022의 게시글 3종을 하나의 `counts` 객체로 합쳐 `writeCommitSummary(counts)`를
  호출하도록 배선한다. 실행 끝의 콘솔 로그도 `cudSummary.length` 대신 8개 카운트 요약을
  출력하도록 바꾼다(depends on T020, T022, T023) per FR-016 (missing)
- [X] T025 [P] `buildCommitMessageBody`를 `module.exports`에 추가해 단위 테스트에서 직접
  호출 가능하게 한다(depends on T023) per FR-012~FR-016 (missing)
- [X] T026 `scripts/sync-tistory-series/__tests__/index.test.js`를 갱신한다: (a)
  `buildNewPostCud`/`renderCommitSummary` 테스트 제거, (b) `buildCommitMessageBody`
  단위 테스트 추가 — 카테고리별 n건 표시, n=0 줄 생략, 그룹 전체 0일 때 헤더 생략,
  게시글/시리즈 둘 다 있을 때 순서와 들여쓰기, N=8개 합 검증(depends on T023, T025) per
  FR-012~FR-016, SC-006, SC-008 (missing)
- [X] T027 `.github/workflows/tistory-series-sync.yml`과
  `.github/workflows/tistory-series-sync-manual.yml`의 커밋 스텝을 T024의 새
  `.sync-commit-summary.txt` 형식에 맞춘다 — `wc -l` 대신 `head -n1`로 N을 읽고,
  `tail -n +2`로 본문을 읽어 커밋 메시지 본문(`-m`)에 쓴다. 커밋 제목 텍스트("chore:
  게시글 동기화")는 이미 적용돼 있으므로 그대로 둔다(depends on T024) per FR-018
  (missing)
- [X] T028 `npm test`를 실행해 전체 스위트가 회귀 없이 통과함을 확인한다(depends on
  T020~T026) per SC-006, SC-007, SC-008 (missing)
- [X] T029 quickstart.md 4단계의 `node -e` 스니펫을 실제로 실행해 `buildCommitMessageBody`
  출력이 문서에 적은 예상 형식과 일치하는지 확인한다(depends on T024, T025) (missing)

**Checkpoint**: `npm test` 전체 통과. `buildCommitMessageBody`가 8개 카테고리 조합에서
문서화된 형식(그룹/들여쓰기/0건 생략)을 정확히 만들어낸다. 워크플로우 두 파일이 새
`.sync-commit-summary.txt` 형식을 올바르게 읽는다(로컬 시뮬레이션으로 확인, 실제
GitHub Actions 실행 확인은 이번 세션 범위 밖).
