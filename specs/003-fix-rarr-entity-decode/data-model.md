# Phase 1 Data Model: HTML 엔티티 디코딩 누락 수정 (&rarr;)

이 기능은 새로운 엔티티(도메인 객체)를 도입하지 않는다. 기존 두 데이터 구조의 필드 값만
수정 대상이며, 아래는 그 필드와 이번 변경이 지키는 불변식을 정리한 것이다.

## HTML_ENTITIES 맵 (scripts/sync-tistory-series/index.js)

| 필드 | 타입 | 설명 |
|------|------|------|
| key | string | `&entity;` 형태의 HTML named/numeric character reference 원문 |
| value | string | key가 나타내는 실제 문자 1개 |

**추가되는 항목**: `"&rarr;"` → `"→"` (U+2192 RIGHTWARDS ARROW)

**불변식**: 이 맵의 키 집합은 이 저장소가 실제로 관측한 게시글 제목에 등장한 엔티티로만
구성된다(research.md 결정 1). 임의의 HTML 명명 문자 참조를 포괄적으로 지원하지 않는다.

## Series 목차 항목 (`*_series.json` → `items[]`)

Constitution I이 이미 정의한 스키마를 그대로 따르며, 이번 기능은 구조를 바꾸지 않는다.

| 필드 | 타입 | 이번 변경에서의 상태 |
|------|------|----------------------|
| `title` | string | navigation_series.json의 url=`https://kenel.tistory.com/433` 항목만 `&rarr;` → `→`로 값 수정 |
| `url` | string | 변경 없음 |

## 동기화 처리 이력 레코드 (`.github/sync-state.json` → `processedPosts[]`)

| 필드 | 타입 | 이번 변경에서의 상태 |
|------|------|----------------------|
| `url` | string | 변경 없음 (`https://kenel.tistory.com/433`로 대상 식별) |
| `title` | string | `&rarr;` → `→`로 값 수정 (series 목차 항목과 동일한 최종 문자열) |
| `lastMod` | string | 변경 없음 — 게시글 자체가 실제로 수정된 것이 아니라 과거 디코딩 누락을 보정하는 것이므로 드리프트로 취급하지 않는다 |
| `publishedAt` | string \| null | 변경 없음 |
| `processedAt` | string | 변경 없음 |

**주의**: `lastMod`/`processedAt`을 갱신하지 않는 이유는, 이 수정이 002의 드리프트 감지가
포착하는 "게시글이 실제로 다시 수정됨" 이벤트가 아니라 "과거 처리 로직의 버그로 인해
저장된 값이 애초부터 틀렸음"을 보정하는 것이기 때문이다. 이 레코드를 드리프트 이벤트처럼
갱신하면 다음 실행에서 실제 변경이 없었음에도 변경 이력처럼 보이는 혼동을 만든다.
