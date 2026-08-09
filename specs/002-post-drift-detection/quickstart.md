# Quickstart: 게시글 드리프트(제목 변경·삭제) 감지 및 갱신

**Input**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md)

이 문서는 구현이 끝난 뒤 이 기능이 실제로 동작하는지 검증하는 절차다. 001의
`node scripts/sync-tistory-series/index.js` 실행 흐름 안에 이어서 동작한다(FR-014).

## 사전 준비

- Node.js가 설치되어 있어야 한다(001과 동일 버전, [plan.md](plan.md) Technical Context 참고).
- 저장소 루트에서 실행한다.
- `.github/sync-state.json`에 이미 `processedPosts`가 채워져 있고(001이 실행된 이력이
  있는 저장소), 그중 최소 하나는 실제로 `*_series.json`에 반영되어 있어야 아래 시나리오를
  재현할 수 있다.
- 이 기능 배포 이전의 `processedPosts` 레코드는 `lastMod` 필드가 없다 — 첫 실행에서는
  그 레코드들이 전부 재확인 후보로 잡힌다는 점을 감안한다(data-model.md "재확인 후보 판정").

## 시나리오 1 — 제목 변경 자동 반영 (User Story 1, FR-001~004)

1. 이미 어떤 `*_series.json`에 반영된 게시글 하나를 고른다.
2. 그 게시글의 실제 제목을 바꾼다(Tistory 관리자 화면에서, 시리즈 구분자 앞부분은
   그대로 두고 부제만 바꾼다 — 재분류 없는 순수 텍스트 변경 케이스).
3. 스크립트를 실행한다.

```sh
node scripts/sync-tistory-series/index.js
```

**기대 결과**:
- sitemap의 해당 게시글 `lastmod`가 처리 이력의 `lastMod`보다 최신이므로 재확인 후보로
  선별된다(FR-002).
- 제목이 재조회되어 처리 이력의 `title`이 갱신된다(FR-004).
- 배치 결정에서 같은 seriesId 아래 title만 갱신된다(seriesId 자체는 안 바뀜).
- 해당 `<seriesId>_series.json`의 `items[].title`이 새 제목으로 바뀐다(FR-008). 다른
  파일·항목은 diff에 없으므로 건드려지지 않는다(SC-006).

```sh
git status
git diff -- '*_series.json' .github/sync-state.json .github/series-assignments.json
```

## 시나리오 2 — 재분류(시리즈 구분 기준 변경) (User Story 1 시나리오 3~5)

1. 이미 반영된 게시글 하나의 제목을 바꾸되, 시리즈 구분자 앞부분(원시 시리즈명)까지
   다른 시리즈 이름으로 바꾼다.
2. 새 시리즈 이름을 공유하는 다른 공개 게시글이 있는지(2개 이상 조건, FR-010) 미리
   확인해 둔다 — 있는 경우와 없는 경우 두 갈래를 각각 검증할 수 있다.
3. 스크립트를 실행한다.

**기대 결과 (대상 시리즈가 이미 2개 이상 조건을 만족)**:
- 게시글이 기존 `<oldSeriesId>_series.json`에서 제거된다(남은 항목이 1개 이하면 그
  파일 자체가 삭제된다, FR-011).
- 새 `<newSeriesId>_series.json`에 새 제목으로 추가된다(파일이 없었다면 새로 생성,
  FR-010).

**기대 결과 (대상 시리즈가 아직 1개뿐)**:
- 게시글은 기존 `<oldSeriesId>_series.json`에 그대로 남되, `title`은 새 값으로
  갱신된다(이동 보류, data-model.md 상태 전이 참고).
- `<newSeriesId>_series.json`은 생성되지 않는다.

## 시나리오 3 — 삭제·비공개 전환 자동 반영 (User Story 2, FR-005~007, FR-009)

1. 이미 반영된 게시글 하나를 비공개로 전환한다(또는 sitemap에서 빠지는 것을 확인할 수
   있는 다른 방법).
2. 스크립트를 실행한다.

**기대 결과**:
- sitemap 조회가 성공했음에도 그 URL이 결과에 없으므로 즉시 삭제로 확정된다(FR-005,
  연속 확인 없음).
- 처리 이력의 해당 레코드에 `deletedAt`이 설정된다.
- 배치 결정에서 이 게시글이 제거된다(FR-007) → 재조정에서 해당
  `<seriesId>_series.json`의 항목이 제거된다(남은 항목이 1개 이하면 파일째 삭제,
  FR-009, FR-011).
- 다시 스크립트를 실행해도 같은 게시글이 재확인 후보로 다시 잡히지 않는다(FR-013 —
  `deletedAt`이 설정된 레코드는 후보 판정에서 제외).

## 시나리오 4 — 커밋 메시지 CUD 요약 확인 (FR-012, SC-007)

시나리오 1~3 중 하나를 GitHub Actions 워크플로우로 실행한다.

```sh
gh workflow run tistory-series-sync.yml
gh run watch
git fetch origin
git log origin/main -1
```

**기대 결과**:
- 커밋 메시지가 001의 고정 문구(`chore: 티스토리 시리즈 목차 동기화`)가 아니라, 이번
  실행에서 실제로 생성·갱신·삭제된 시리즈 목차 파일을 요약한 내용을 담고 있다
  (research.md §6 형식 참고).
- 시나리오 1(제목만 갱신)과 시나리오 3(삭제)을 각각 다른 실행에서 돌렸다면, 두 커밋
  메시지의 본문이 서로 다르다(SC-007).
- 변경 사항이 전혀 없는 실행에서는 커밋 자체가 생성되지 않는다(001과 동일).

## 시나리오 5 — 목록 조회 실패 시 판단 보류 (Edge Cases, SC-003)

sitemap 조회가 실패하는 상황을 재현하기 어렵다면, 이 시나리오는 코드 리뷰 또는 단위
테스트(아래 "테스트 실행")로 대체 검증한다.

**기대 결과**: sitemap 조회 자체가 실패한 실행에서는 어떤 게시글도 삭제로 확정되지
않고, 어떤 제목도 갱신되지 않으며, 워킹 트리에 변경이 생기지 않는다(001의 기존
"sitemap 조회 실패 시 실행 중단"과 동일한 조기 종료 경로를 탄다).

## 테스트 실행

```sh
node --test scripts/sync-tistory-series
```

**기대 결과**: [data-model.md](data-model.md)의 상태 전이(재확인 후보 판정 → 삭제 확정
→ 배치 결정 갱신 → 재조정 → CUD 요약)를 다루는 단위 테스트가 모두 통과한다. 특히
`reconcile.js`(재조정)와 `seriesAssignments.js`(배치 결정 부분 갱신) 테스트는 다음을
반드시 포함한다: 순수 텍스트 갱신, 임계값 충족 재분류, 임계값 미충족으로 인한 이동
보류, 고아 파일 삭제, 배치 결정과 실제 파일이 이미 일치할 때 파일을 쓰지 않는지(SC-006).
