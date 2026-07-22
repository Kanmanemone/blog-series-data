# Quickstart: 티스토리 시리즈 목차 JSON 동기화 자동화

**Input**: [spec.md](spec.md), [plan.md](plan.md), [data-model.md](data-model.md)

이 문서는 구현이 끝난 뒤 이 기능이 실제로 동작하는지 검증하는 절차다. 스키마와 필드
세부 내용은 [data-model.md](data-model.md)를, 각 규칙의 근거는 [spec.md](spec.md)의
Functional Requirements를 참고한다.

## 사전 준비

- Node.js가 설치되어 있어야 한다(버전은 [plan.md](plan.md) Technical Context 참고).
- 저장소 루트에서 실행한다.
- 최초 실행 전에는 `.github/sync-state.json`이 존재하지 않을 수 있다 — 이 경우 커트라인이
  없는 것으로 간주해 구현 시 정한 기본 동작(예: 전체 sitemap을 대상으로 최초 1회 처리)을
  따른다.

## 시나리오 1 — 로컬에서 스크립트 단독 실행 (User Story 1 검증)

```sh
node scripts/sync-tistory-series/index.js
```

**기대 결과**:
- 마지막 커트라인 이후 `lastmod`가 갱신된 게시글만 콘솔에 로그로 표시된다(FR-004).
- 기존 시리즈와 seriesId가 일치하는 게시글이 있다면, 해당 `<seriesId>_series.json`의
  `items` 배열 끝에 새 항목이 추가된 상태로 워킹 트리가 변경된다(FR-011).
- `.github/sync-state.json`의 `cutoff`가 이번 실행 시작 시각 − 5분(KST, `+09:00` 오프셋)으로
  갱신되고, `processedPosts`에 이번에 처리한 게시글이 추가된다(FR-003, FR-016).
- 변경 대상 게시글이 없으면 워킹 트리에 아무 diff도 생기지 않는다(User Story 1 시나리오 2).

```sh
git status
git diff -- '*_series.json' .github/sync-state.json
```

위 diff가 예상한 시리즈 파일·상태 파일에만 존재하는지 확인한다.

## 시나리오 2 — 신규 시리즈 생성 (User Story 2 검증)

1. 기존 어떤 `*_series.json`의 seriesId와도 겹치지 않는 seriesId를 공유하는 게시글이
   sitemap상 몇 개인지 사전에 확인한다(1개뿐이면 이 시나리오를 재현할 수 없다 — SC-005).
2. 위 스크립트를 실행한다.

**기대 결과**:
- 공개 게시글이 2개 이상인 seriesId에 대해서만 `<seriesId>_series.json`이 새로 생성된다
  (FR-012). `listName`은 가장 먼저 발견된 게시글의 원시 시리즈명이고, `items`는 발행
  순서(오래된 것 → 최신 것)로 정렬되어 있다(FR-013).
- 1개뿐인 seriesId에 대해서는 어떤 파일도 생성되지 않는다(SC-005).

## 시나리오 3 — GitHub Actions 워크플로우 수동 실행 (FR-014)

```sh
gh workflow run tistory-series-sync.yml
gh run watch
```

**기대 결과**:
- 워크플로우가 성공적으로 종료된다.
- 변경 사항이 있었다면 워크플로우가 병합 검토 단계 없이 기본 브랜치에 직접 커밋·푸시한다.

```sh
git fetch origin
git log origin/main -3 --oneline
git show --stat origin/main
```

- 방금 워크플로우가 만든 커밋에 예상한 시리즈 파일 변경(또는 신규 파일)과
  `.github/sync-state.json` 변경만 포함되어 있는지 확인한다.

## 시나리오 4 — 재실행 시 커트라인 갱신 확인 (FR-015)

1. 시나리오 3에서 워크플로우가 커밋·푸시한 것을 확인한다.
2. 워크플로우를 다시 수동 실행한다.

**기대 결과**:
- 방금 반영된 게시글이 다시 처리 대상에 포함되지 않는다(이미 `items`에 URL이
  있으므로 FR-011에 의해 건너뜀, 또한 새로 갱신된 `cutoff` 이전 `lastmod`이므로 FR-004에
  의해 애초에 후보에도 들지 않음).

## 테스트 실행

```sh
node --test scripts/sync-tistory-series
```

**기대 결과**: [data-model.md](data-model.md)의 상태 전이 흐름(경로 패턴 판별 → 커트라인
필터 → 시리즈명 추출 → 매칭/생성 판정)을 다루는 단위 테스트가 모두 통과한다.
