# Data Model: 수정된 게시글 제목이 목차에 반영되지 않는 문제 수정

스키마 변경은 없다. 이 문서는 세 데이터 저장소 사이에 이번 기능이 보장해야 하는 **불변식**과 **책임 분담**만 정의한다. 각 엔티티의 필드 정의는 [002 data-model.md](../002-post-drift-detection/data-model.md)를 따른다.

## 엔티티

| 엔티티 | 위치 | 이번 기능과의 관계 |
|---|---|---|
| Processed Post | `.github/sync-state.json` `processedPosts[]` | `lastMod`는 드리프트 감지의 기준값. 목차 반영 판단 전에 덮어쓰면 안 된다. |
| Series Assignment | `.github/series-assignments.json` `{seriesId: {listName, posts[]}}` | 재조정이 목차 파일을 이것과 같게 만든다. |
| Series File | `<seriesId>_series.json` | 공개 결과물. |

## 책임 분담 (게시글 상태별 처리 주체)

| 게시글 상태 | 커트라인 이후 수정됨 | 처리 주체 |
|---|---|---|
| 처리 이력 없음 | 예 | 001 신규 게시글 흐름 |
| 처리 이력 있음, 어떤 목차에도 없음 | 예 | 001 신규 게시글 흐름(기존 동작) |
| 처리 이력 있음(`deletedAt` 없음), 목차에 있음 | 예 | **002 드리프트 감지** (이번 변경: 001에서 제외) |
| 처리 이력 있음, `deletedAt` 있음 | 예 | 001 신규 게시글 흐름(기존 동작, 범위 밖) |

## 불변식

- **INV-1 (처리 이력 보존)**: 목차에 있는 게시글의 Processed Post `title`·`lastMod`는 드리프트 감지 단계에서만 갱신된다.
- **INV-2 (배치 결정 ⊇ 목차)**: 실행이 끝난 시점에, 배치 결정에 그룹이 있는 모든 seriesId에 대해 그 그룹의 URL 집합과 제목은 같은 이름의 목차 파일과 같다. 001이 목차에 쓴 항목은 같은 실행 안에서 배치 결정에도 기록된다.
- **INV-3 (제목 일치)**: 목차의 모든 항목 제목은 해당 Processed Post의 `title`과 같다(`title`이 없는 배포 이전 레코드는 제외).

INV-2, INV-3은 `seriesDataIntegrity.test.js`가 실제 저장소 데이터로 검사한다.

## 일회성 복구 대상

| seriesId | URL | 변경 |
|---|---|---|
| swemo | /435 | 목차·배치 결정 제목 → "Swemo - Iteration 8: Bulleted List 구현", 배치 결정 swemo 그룹에 항목 추가(`publishedAt` = 처리 이력 값) |
| 그래프 | /212 | 목차·배치 결정 제목 → 처리 이력 제목 |
| 2026buildwithaihands-oncampus | /412 | 목차·배치 결정 제목 → 처리 이력 제목 |
