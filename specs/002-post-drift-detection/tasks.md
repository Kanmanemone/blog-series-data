---

description: "Task list template for feature implementation"
---

# Tasks: 게시글 드리프트(제목 변경·삭제) 감지 및 갱신

**Input**: Design documents from `/specs/002-post-drift-detection/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md)

**Tests**: plan.md의 Project Structure와 research.md가 `node --test` 기반 단위 테스트 파일 구조를 명시적으로 설계했으므로(001과 동일 관행), 각 모듈의 단위 테스트 작업을 포함한다.

**Organization**: 작업은 spec.md의 User Story(P1/P2)별로 그룹화되어 각 스토리를 독립적으로 구현·검증할 수 있다.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 병렬 실행 가능(다른 파일, 미완료 작업에 대한 의존성 없음)
- **[Story]**: 이 작업이 속한 User Story(US1/US2)
- 모든 작업에 정확한 파일 경로를 포함한다

## Path Conventions

001이 이미 만든 `scripts/sync-tistory-series/`(스크립트 본체)와 `.github/workflows/`(트리거)
구조를 그대로 확장한다(plan.md Project Structure). 새 디렉터리는 필요 없다 — 신규 파일
2개(`seriesAssignments.js`, `reconcile.js`)와 신규 테스트 2개만 기존 디렉터리에 추가한다.
`seriesFiles.js`는 이 기능에서 **변경하지 않는다** — `collectSiblingCandidates`는 001의
신규 시리즈 생성 흐름(`index.js:123`)이 여전히 사용하는 무관한 로직이므로 손대지 않는다
(research.md §5, `/speckit-analyze` 발견 사항 I1로 초안의 "제거" 지시를 정정).

---

## Phase 1: Setup

001이 이미 `scripts/sync-tistory-series/`와 `.github/workflows/` 구조를 만들어 두었으므로
(plan.md Project Structure), 이 기능을 위한 별도의 디렉터리 스캐폴딩 작업은 없다. Foundational
Phase부터 바로 시작한다.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: User Story 1·2가 공통으로 의존하는 3계층 인프라 — 처리 이력 확장, 배치 결정
레코드 읽기/쓰기/부분 갱신, 재조정 엔진. 두 스토리 모두 이 계층 위에서 동작한다. 001의
기존 `seriesFiles.js`(`collectSiblingCandidates` 포함)는 건드리지 않는다(위 Path
Conventions 참고).

**⚠️ CRITICAL**: 이 Phase가 끝나기 전에는 User Story 작업을 시작할 수 없다.

- [X] T001 [P] Extend `processedPosts` 스키마와 재확인 후보 판정 헬퍼를 scripts/sync-tistory-series/syncState.js에 구현 (FR-002, FR-004; data-model.md "Processed Post" — `rawSeriesName` 필드를 `title`로 대체하고 `lastMod`·`deletedAt`을 추가; `lastMod`는 001의 sitemap 파생 필드 `lastmod`(소문자)와 의도적으로 다른 케이싱임을 주석에 명시(data-model.md "케이싱 참고"); `lastMod` 필드가 없거나 sitemap의 현재 `lastmod`가 기록값보다 최신이면 재확인 후보로 판정하는 순수 함수(예: `isDriftCandidate(record, currentLastmod)`)를 export; `deletedAt`이 설정된 레코드는 항상 후보 제외; 주석은 한국어로, 구체적으로 작성 — Constitution II)
- [X] T002 [P] `.github/series-assignments.json` 읽기/쓰기를 scripts/sync-tistory-series/seriesAssignments.js에 구현 (data-model.md "Series Assignment" 스키마 — `{ [seriesId]: { listName, posts: [{url, title}] } }`, `posts`는 lastMod 오름차순; 파일이 없으면 빈 객체로 간주; 주석은 한국어로, 구체적으로 작성 — Constitution II)
- [X] T003 scripts/sync-tistory-series/seriesAssignments.js에 배치 결정 부분 갱신 함수를 구현 (FR-006, FR-007; research.md §3, data-model.md "부분 갱신 규칙" — 게시글 URL로 현재 소속 seriesId를 찾는 역방향 조회; 삭제 확정이면 찾은 위치에서 제거하고 어디에도 추가하지 않음(FR-007); 삭제가 아니면 새 title로 새 seriesId를 계산해 (a) 기존과 같으면 그 자리 title만 갱신, (b) 다르고 새 그룹이 이 게시글 포함 2개 이상이면 이동(제거+추가), (c) 다르지만 새 그룹이 아직 1개뿐이면 기존 위치에 유지하되 title만 갱신; 이 함수는 호출자(T009·T013)가 "이번 실행에서 title·lastMod가 갱신됐거나 deletedAt이 새로 설정된" 게시글에 대해서만 호출함으로써 FR-006의 "변경된 게시글만 갱신" 요구를 만족시킨다 — 함수 자체는 어떤 게시글이 대상인지 판단하지 않는다; 주석은 한국어로, 구체적으로 작성 — Constitution II; depends on T002)
- [X] T004 [P] scripts/sync-tistory-series/__tests__/seriesAssignments.test.js에 단위 테스트 작성 (순수 텍스트 갱신, 임계값 충족 재분류(이동), 임계값 미충족으로 인한 이동 보류, 삭제 확정으로 인한 완전 제거, **그리고 이번에 호출되지 않은(= 변경되지 않은) 다른 게시글의 배치 결정 항목이 실행 전후로 값이 그대로인지**(FR-006 음성 케이스 — `/speckit-analyze` 발견 사항 U1); covers T002, T003)
- [X] T005 scripts/sync-tistory-series/reconcile.js에 재조정 알고리즘을 구현 (FR-008, FR-009, FR-010, FR-011; research.md §4, data-model.md "Series File"·"Commit Change Summary" — 배치 결정 전체를 순회해 `posts.length < 2`면 파일 미생성/삭제(FR-011), 파일 없으면 생성(FR-010, listName은 posts 중 가장 이른 lastMod 게시글의 원시 시리즈명), 파일 있으면 url 기준 diff로 누락 항목 추가·더 이상 없는 항목 제거·title 다른 항목 갱신(FR-008, FR-009)만 수행하고 diff 없으면 파일을 쓰지 않음(SC-006); 배치 결정에 없는 seriesId의 기존 파일은 건드리지 않음; 처리한 각 파일에 대해 `{type, seriesId, detail}` 형태의 CUD 항목을 모아 배열로 반환; 001의 `listSeriesFiles`·`writeSeriesFile`(seriesFiles.js, 변경 없음)을 재사용; 주석은 한국어로, 구체적으로 작성 — Constitution II; depends on T002)
- [X] T006 [P] scripts/sync-tistory-series/__tests__/reconcile.test.js에 단위 테스트 작성 (파일 생성/삭제, 항목 추가/제거/title 갱신, 배치 결정과 이미 일치할 때 파일을 쓰지 않는지(SC-006), 배치 결정에 없는 seriesId의 기존 파일을 건드리지 않는지, 반환되는 CUD 목록의 정확성; covers T005)

**Checkpoint**: 이 시점 이후 User Story 1과 2를 병렬로 시작할 수 있다.

---

## Phase 3: User Story 1 - 제목 변경 자동 반영 (Priority: P1) 🎯 MVP

**Goal**: 이미 목차에 반영된 게시글의 제목이 바뀌면(재분류를 유발하든 안 하든) 수동 개입
없이 목차에 반영한다.

**Independent Test**: 목차에 반영된 게시글 하나의 실제 제목을 바꾼 뒤(재분류 없는 경우와
있는 경우 각각) 스크립트를 실행해, quickstart.md 시나리오 1·2 결과가 나오는지 확인한다.

### Implementation for User Story 1

- [X] T007 [US1] scripts/sync-tistory-series/index.js에 전체 `processedPosts`를 대상으로 한 드리프트 후보 선별 함수를 구현 (FR-002; T001의 `isDriftCandidate`를 이번 실행의 sitemap 전체 목록과 대조해 사용; 001의 기존 cutoff 기반 신규 게시글 후보 선별과는 별개의 두 번째 순회임을 주석에 명시; 주석은 한국어로, 구체적으로 작성 — Constitution II; depends on T001)
- [X] T008 [US1] scripts/sync-tistory-series/index.js에서 드리프트 후보의 제목을 재조회하고 처리 이력을 갱신하는 로직을 구현 (FR-003, FR-004; 001의 기존 `fetchPostTitle`·`decodeHtmlEntities` 재사용; 재조회한 `title`·`lastMod`를 T001이 정의한 필드에 반영; depends on T007)
- [X] T009 [US1] scripts/sync-tistory-series/index.js에서 T008로 갱신된 각 게시글에 대해서만(FR-006) seriesAssignments.js의 배치 갱신 함수(T003)를 호출하도록 연동 (depends on T003, T008)
- [X] T010 [US1] scripts/sync-tistory-series/index.js에서 배치 결정 갱신 후 reconcile.js(T005)를 호출해 시리즈 목차 파일에 반영하고, 반환된 CUD 목록을 이후 커밋 메시지 생성을 위해 보관하도록 연동 (depends on T005, T009)
- [X] T011 [P] [US1] scripts/sync-tistory-series/__tests__/index.test.js에 드리프트 후보 선별·제목 재조회 오케스트레이션 단위 테스트 작성 (lastMod 미변경 게시글은 재조회하지 않는지, lastMod 필드가 없는 기존 레코드가 후보로 잡히는지; covers T007, T008)

**Checkpoint**: 이 시점에서 User Story 1은 완전히 동작하며 quickstart.md 시나리오 1·2로
독립적으로 검증 가능하다.

---

## Phase 4: User Story 2 - 삭제·비공개 전환 자동 반영 (Priority: P2)

**Goal**: 이미 목차에 반영된 게시글이 삭제·비공개로 전환되면 수동 개입 없이 목차에서
제거한다.

**Independent Test**: 목차에 반영된 게시글 하나를 비공개로 전환한 뒤 스크립트를 실행해,
quickstart.md 시나리오 3 결과가 나오는지 확인한다. (구현상 T012는 US1의 T007이 만드는
sitemap URL 집합을 재사용하므로, 완전한 코드 독립성보다는 "US1과 별개로 관찰·검증
가능"이라는 의미의 독립성이다 — Dependencies 절 참고.)

### Implementation for User Story 2

- [X] T012 [US2] scripts/sync-tistory-series/index.js에 삭제·비공개 전환 확정 로직을 구현 (FR-005; 공개 게시글 목록 조회가 성공한 실행에서만 판단하며, T007이 구성한 sitemap URL 집합에 없는 processedPosts 레코드를 즉시 `deletedAt` 설정으로 확정(연속 확인 없음); 목록 조회 자체가 실패하면(001의 기존 조기 종료 경로) 이 로직 자체를 건너뜀; 주석은 한국어로, 구체적으로 작성 — Constitution II; depends on T001, T007)
- [X] T013 [US2] scripts/sync-tistory-series/index.js에서 삭제 확정된 게시글도 T009·T010과 같은 배치 갱신 → 재조정 경로를 타도록 연동 (FR-007, FR-009, FR-013 — 삭제 확정 레코드는 이후 실행에서 T007의 후보 판정에서 자동 제외됨을 T001에서 이미 보장; depends on T003, T005, T012)
- [X] T014 [P] [US2] scripts/sync-tistory-series/__tests__/index.test.js 또는 syncState.test.js에 삭제 확정 로직 단위 테스트 작성 (목록 조회 성공+URL 결측 → 즉시 확정, 목록 조회 실패 → 판단 보류, 이미 확정된 레코드는 다음 실행에서 후보로 다시 잡히지 않는지; covers T012)

**Checkpoint**: 이 시점에서 User Story 1과 2가 모두 독립적으로 동작한다.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: 두 User Story의 변경 내역을 커밋 메시지로 노출하는 작업(FR-012, SC-007)과
전체 검증. 개별 스토리의 독립 테스트(quickstart.md 시나리오 1~3)는 이 Phase 이전에도
파일 diff로 확인 가능하므로, 커밋 메시지 연동은 두 스토리 모두에 공통인 마무리 작업으로
분리한다.

- [X] T015 [P] scripts/sync-tistory-series/index.js가 T010·T013에서 모은 CUD 목록을, 변경이 있을 때만 저장소 루트의 임시 파일(`.sync-commit-summary.txt`, git 추적 대상 아님)에 사람이 읽는 요약으로 써내도록 구현 (research.md §6 "전달 방식", data-model.md "Commit Change Summary" — `Created:`/`Updated:`/`Deleted:` 줄; 변경이 전혀 없으면 파일을 만들지 않음; 주석은 한국어로, 구체적으로 작성 — Constitution II; depends on T010, T013)
- [X] T016 `.gitignore`에 `.sync-commit-summary.txt`를 추가해 실수로 커밋되지 않도록 함
- [X] T017 .github/workflows/tistory-series-sync.yml의 커밋 스텝을 수정해, `.sync-commit-summary.txt`가 존재하면 그 내용을 커밋 메시지 본문으로 사용하고(제목 줄은 기존 `chore: 티스토리 시리즈 목차 동기화` 유지, 본문에 CUD 요약 추가), 커밋 후 그 임시 파일을 삭제 (FR-012, SC-007; depends on T015, T016)
- [X] T018 [P] 전체 단위 테스트 스위트 실행 및 실패 수정 (depends on T001~T014) — Node.js를 `C:\dev\nodejs`(v24.19.0 LTS)에 설치한 뒤 실제로 실행해 **59/59 테스트 전부 통과**를 확인했다(`npm test`, `package.json` 참고). 최초 시도(`node --test scripts/sync-tistory-series`, 부모 디렉터리 통째로 지정)는 Node가 그 경로를 `require()`로 해석해 `index.js`를 직접 실행시키는 바람에 **실제 kenel.tistory.com에 네트워크 요청을 보내고 저장소 파일을 수정하는 사고**로 이어졌다 — 즉시 `git restore`로 전부 되돌리고, `package.json`의 `test` 스크립트를 각 `__tests__/*.test.js` 파일을 명시적으로 나열하는 방식으로 고쳐 재발을 방지했다.
- [X] T019 quickstart.md 시나리오 1~5 검증 — 시나리오 1~4(제목 갱신·재분류·삭제·커밋 요약)는 단위 테스트로 로직 검증 완료. 시나리오 3(GitHub Actions 워크플로우 실행)은 실제로 실행하지 않았다 — T018의 사고를 통해 실제 운영 데이터(추적 중인 331건)로 검증 시도가 곧바로 대량 미스로 이어짐을 확인했고, 그 경험이 아래 Phase 7 F3 발견으로 이어졌다. 실제 워크플로우 실행(`gh workflow run`)은 F3 해결 후 진행을 권장한다.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 없음 — 001의 기존 구조를 그대로 사용
- **Foundational (Phase 2)**: 모든 User Story를 블로킹함
- **User Story 1 (Phase 3)**: Foundational 완료 후 시작 가능. User Story 2에 의존하지 않음
- **User Story 2 (Phase 4)**: Foundational 완료 후 시작 가능하나, `index.js`의 sitemap URL
  집합 구성 로직(T007)을 공유하므로 실질적으로 User Story 1 구현 완료 후 진행 권장
- **Polish (Phase 5)**: User Story 1·2 모두 완료 후 진행(커밋 메시지가 두 스토리의 CUD를
  함께 요약해야 하므로)

### User Story Dependencies

- **User Story 1 (P1)**: Foundational 이후 시작 가능, User Story 2에 의존하지 않음
- **User Story 2 (P2)**: Foundational 이후 시작 가능하나 `index.js`를 공유하는 구현상
  이유로 User Story 1 이후 진행 권장(T012가 T007에 의존 — spec.md가 서술하는 "독립적
  테스트 가능"은 코드 착수 순서의 완전한 독립을 뜻하지 않으며, 결과를 독립적으로
  관찰·검증할 수 있다는 뜻이다)

### Within Each User Story

- 같은 파일(`index.js`)을 다루는 작업은 선언된 순서대로 순차 진행
- 서로 다른 파일을 다루는 작업([P] 표시)은 병렬 진행 가능
- 각 스토리는 Checkpoint에서 quickstart.md 해당 시나리오로 독립 검증 후 다음 스토리로 이동

### Parallel Opportunities

- Foundational Phase의 T001·T002·T004·T006은 서로 다른 파일이므로 병렬 진행 가능
  (T003은 T002 이후, T005는 T002 이후)
- User Story 1의 T011(테스트)는 T007·T008 완료를 검증하므로 그 이후 진행
- User Story 2의 T014(테스트)는 T012 완료 이후 진행
- Polish의 T015·T018은 서로 다른 파일이라 병렬 가능

---

## Parallel Example: Foundational Phase

```bash
Task: "processedPosts 확장과 재확인 후보 판정 헬퍼를 scripts/sync-tistory-series/syncState.js에 구현"
Task: "series-assignments.json 읽기/쓰기를 scripts/sync-tistory-series/seriesAssignments.js에 구현"
```

## Parallel Example: Polish Phase

```bash
Task: "CUD 요약을 임시 파일에 써내는 로직을 scripts/sync-tistory-series/index.js에 구현"
Task: "전체 단위 테스트 스위트 node --test scripts/sync-tistory-series 실행"
```

---

## Implementation Strategy

### MVP First (User Story 1만)

1. Phase 2: Foundational 완료(모든 스토리를 블로킹하므로 필수)
2. Phase 3: User Story 1 완료
3. **STOP and VALIDATE**: quickstart.md 시나리오 1·2로 User Story 1을 독립적으로 검증
4. 이 시점에서 이미 "제목 드리프트 자동 반영"이라는 핵심 가치를 제공(커밋 메시지 CUD
   요약은 아직 없어도 `git diff`로 반영 여부는 확인 가능)

### Incremental Delivery

1. Foundational 완료 → 3계층 기반 준비 완료
2. User Story 1 추가 → 독립 검증 → 배포/데모(MVP!)
3. User Story 2 추가 → 독립 검증 → 배포/데모
4. Polish(커밋 메시지 CUD 요약) 추가 → quickstart.md 시나리오 4로 검증 → 배포/데모
5. 각 단계는 이전 단계를 깨지 않고 가치를 더함

---

## Notes

- [P] 작업 = 서로 다른 파일, 미완료 작업에 대한 의존성 없음
- [Story] 라벨은 추적성을 위해 작업을 특정 User Story에 매핑함
- 각 User Story는 독립적으로 완료·검증 가능해야 함
- `index.js`를 여러 스토리가 이어서 수정하므로, 병렬 작업 시 파일 충돌을 피하려면 해당
  파일을 다루는 작업들은 한 사람/에이전트가 순서대로 처리할 것
- Checkpoint마다 quickstart.md의 해당 시나리오로 검증 후 다음 단계로 이동
- 코드를 작성하는 모든 작업은 Constitution II(주석은 한국어로, 구체적으로)를 따른다
- 모든 변경은 001과 동일하게 병합 검토 없이 기본 브랜치에 직접 커밋·푸시된다(spec.md
  Clarifications). 문제가 있으면 관리자가 `git revert`로 되돌린다.
- `seriesFiles.js`(`collectSiblingCandidates` 포함)는 이 기능에서 손대지 않는다 — 001의
  신규 시리즈 생성 흐름이 계속 쓰고 있음을 `/speckit-analyze`로 재확인했다(research.md §5).
- research.md §3이 문서화한 "서로 다른 실행에서 재분류되는 두 게시글이 서로를 기다리며
  계속 보류될 수 있는" 잔여 리스크는 이번 tasks에서 해결하지 않는다(spec.md Assumptions가
  이미 그런 처리량 급증 시나리오를 재검토 대상으로 남겨둠).

---

## Phase 6: Convergence

`/speckit-converge`가 spec.md·plan.md·tasks.md 대비 실제 코드를 재검토해 발견한 간극.

- [X] T020 재분류 후보를 목표 seriesId별로 배치로 묶어, 배치 전체 합산이 2개 이상인지 한 번에 판단·실행하도록 scripts/sync-tistory-series/seriesAssignments.js와 scripts/sync-tistory-series/index.js를 수정 per US1/AC3 (partial) — 현재는 같은 실행에서 두 게시글이 같은 신생 시리즈로 함께 재분류될 때 각자 "1명뿐"이라고 오판해 둘 다 이동하지 못한다. `resolveReclassifyBatches` 신설로 해결(seriesAssignments.js `updateAssignmentForPost`는 텍스트 갱신·삭제만 전담하도록 축소). 관련 테스트를 scripts/sync-tistory-series/__tests__/seriesAssignments.test.js에 갱신·추가(회귀 방지 케이스 포함).
- [X] T021 001의 기존 흐름(기존 시리즈에 신규 게시글 추가, 신규 시리즈 파일 생성)이 만든 변경도 CUD 항목으로 집계해 scripts/sync-tistory-series/index.js의 커밋 요약에 포함 per FR-012 (partial) — 현재는 드리프트 감지 경로의 변경만 커밋 메시지에 반영되어, 드리프트 없이 001의 신규 게시글 처리만 있었던 실행은 여전히 고정 문구만 남는다(SC-007 미충족). `buildNewPostCud` 신설로 해결. scripts/sync-tistory-series/__tests__/index.test.js에 테스트 추가.

**주의**: T020·T021 작성 시점에는 이 환경에 Node.js가 없어 수동 코드 리뷰로만 검증했으나,
이후 T018에서 Node.js를 설치해 전체 스위트(T020·T021이 추가한 테스트 포함)를 실제로
실행했고 59/59 전부 통과를 확인했다.

---

## Phase 7: Convergence (2차)

Node.js 설치 후 실제 테스트 실행 과정에서 사고로 드러난 실제 운영 리스크(코드 리뷰나
정적 분석으로는 발견되지 않았던 것).

- [X] T022 배포 후 최초 실행(또는 스키마 마이그레이션 직후 실행)에서 `lastMod` 필드가
  없는 기존 처리 이력 레코드 전부가 동시에 재확인 후보로 잡히는 문제를 완화 per SC-004
  (contradicts) — `scripts/sync-tistory-series/syncState.js`의 `isDriftCandidate`가
  `lastMod` 없는 레코드를 무조건 후보로 판정해(FR-002, "변경 여부 불명" 규칙 자체는
  의도된 것), 현재 추적 중인 331건 규모에서는 최초 실행 한 번에 스로틀링 없는 대량
  요청이 kenel.tistory.com으로 나간다. research.md §2가 "일괄 마이그레이션은 SC-004가
  막으려는 바로 그 비용이라 기각하고 점진적 이행을 택한다"고 결정했던 취지와, 실제
  구현의 "즉시 전체" 동작이 어긋난다. `/speckit-converge`가 앞서 두 번의 정적 검토에서
  놓쳤고, 이번에 실제 실행 사고로 드러났다(2026-08-09, 아래 참고).

  **해결**: 사용자 승인 하에 배치 크기를 직접 결정해 구현함(spec.md Assumptions의
  "확인 대상 게시글 수 급증 시 처리량 조절 전략은 이 스펙에서 확정하지 않는다"는
  유보를 이번 건에 한해 실제 구현으로 해소). `scripts/sync-tistory-series/index.js`의
  `selectDriftCandidates`에 `lastMod` 없는 레코드 전용 회당 처리 상한
  `MAX_UNKNOWN_LASTMOD_REFETCH_PER_RUN = 30`을 추가 — `lastMod`가 있는(마이그레이션이
  끝난) 레코드의 정상적인 드리프트 판정에는 영향이 없고(SC-004의 "실제로 변경이
  의심되는 게시글 수에 비례" 요구는 계속 그대로 성립), 오직 "변경 여부 불명"으로
  한꺼번에 몰리는 레거시 후보만 회당 상한을 두어 여러 정기 실행(001의 6시간 주기
  기준 약 3일)에 걸쳐 자연히 소진되도록 함. 새로운 커서·상태 없이 기존 `processedPosts`
  배열 순서만으로 동작(한 번 처리된 레코드는 `lastMod`가 채워져 다음 실행부터 이
  상한에 걸리지 않음). scripts/sync-tistory-series/__tests__/index.test.js에 회귀
  테스트 2건(상한 적용 확인, 정상 드리프트 후보는 상한 영향 없음 확인) 추가.
  research.md §2에 수정 경위와 근거를 반영.

**사고 경위 요약**: `node --test scripts/sync-tistory-series`(부모 디렉터리 지정)를
실행했더니 Node가 그 경로를 `require()`로 해석해 `index.js`를 직접 실행시켰고, 그
결과 처리 이력 331건 전부가 후보로 잡혀 실제 kenel.tistory.com에 순차 요청이
나가면서 일부 응답이 잘려 온 것으로 보이는 제목 손상이 발생했다(`(feat.Kotlin)` →
`(feat.Kotlin`, `(NavBackStackEntry.arguments)` → `(NavBackStackEntry.` 등). 손상된
변경은 커밋 전에 `git restore`로 전부 되돌렸다(T018 참고). 이 사고 자체가 T022가
지적하는 마이그레이션 버스트 문제의 실측 증거다.

---

## Phase 8: Convergence (3차)

`/speckit-converge`가 이번 세션에서 사용자가 직접 지정한 커밋 메시지 형식 요구사항 대비
실제 코드를 재검토해 발견한 간극.

- [X] T023 커밋 메시지 제목 줄에 총 변경 건수를 포함하고 본문 각 줄 앞에 "- " 불릿을 붙이도록 scripts/sync-tistory-series/index.js의 renderCommitSummary와 .github/workflows/tistory-series-sync.yml의 커밋 스텝을 수정 per FR-012 (partial) — 사용자가 이번 세션에서 "chore: 티스토리 시리즈 목차 동기화 (총 4건)" 제목 줄과 "- Updated: swemo_series.json (항목 추가 1건)" 형태의 불릿 본문을 원하는 형식으로 직접 제시했으나, 현재 renderCommitSummary(scripts/sync-tistory-series/index.js:117-121)는 각 CUD 항목을 "Label: file (detail)" 줄로만 개행 연결할 뿐 불릿을 붙이지 않고, .github/workflows/tistory-series-sync.yml:42의 커밋 스텝은 제목 줄을 고정 문구 `chore: 티스토리 시리즈 목차 동기화`로만 써서 총 건수가 드러나지 않는다. renderCommitSummary가 각 줄 앞에 `- `를 붙이도록 수정하고, 커밋 스텝이 `.sync-commit-summary.txt`의 줄 수(현재 렌더링 방식상 CUD 항목 수와 1:1 대응)를 세어 제목 줄에 `(총 N건)`을 추가하도록 수정(건수를 세는 구체적 위치 — 워크플로우 셸에서 줄 수를 세는 방식이든 index.js가 별도로 함께 기록하는 방식이든 — 은 구현 단계 재량). scripts/sync-tistory-series/__tests__/index.test.js의 renderCommitSummary 테스트(현재 불릿 없는 형식을 기대, index.test.js:156-171)를 새 형식에 맞게 갱신.
