# Phase 1 Data Model: HTML 엔티티 디코딩 누락 수정 (&rarr;)

이 기능은 새로운 엔티티(도메인 객체)를 도입하지 않는다. 기존 두 데이터 구조의 필드 값만
수정 대상이며, 아래는 그 필드와 이번 변경이 지키는 불변식을 정리한 것이다.

## 이름 있는 문자 참조 표 (scripts/sync-tistory-series/htmlNamedEntities.js)

> **갱신(research.md 결정 4)**: 최초에는 이 절이 "관측된 엔티티만 담는 손 관리
> HTML_ENTITIES 맵"을 설명했으나, 화이트리스트가 재발을 막지 못한다는 사용자 지적에
> 따라 HTML 4.01/XHTML1 표준 표 전체를 내장하는 것으로 바뀌었다. 아래는 최종 상태다.

| 필드 | 타입 | 설명 |
|------|------|------|
| key | string | 이름 있는 문자 참조의 이름(예: `rarr`, `amp`, `copy`, `&`/`;` 제외) |
| value | number | 그 이름이 가리키는 유니코드 코드포인트(10진수) |

**불변식**: 이 표의 키 집합은 HTML 4.01/XHTML1 W3C Recommendation이 확정한 이름 있는
문자 참조 전체(252개, 1999년 이후 변경 없음)이며, 이 저장소가 실제로 관측했는지 여부와
무관하다(research.md 결정 4). `decodeHtmlEntities`(index.js)는 숫자 문자 참조(`&#NNN;`/
`&#xHHH;`)도 이 표와 같은 방식(코드포인트 → `String.fromCodePoint`)으로 처리한다. 이
표에도 없는 이름은 `hasUnresolvedNamedEntity`/`extractTitle`이 감지해 그 게시글 처리를
실패시킨다(FR-008, 최후 안전망).

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

## 커밋 이벤트 카운트 (scripts/sync-tistory-series/index.js `run()` 내부 상태)

`.sync-commit-summary.txt`를 만들기 위해 `run()`이 한 실행 동안 누적하는 8개 정수 카운터.
파일이나 게시글 식별자는 담지 않는다 — 순수 집계 숫자다(research.md 결정 5).

| 필드 | 그룹 | 의미 | 누가 증가시키는가 |
|------|------|------|-------------------|
| `postNew` | 게시글 | 새 게시글이 처리 이력엔 기록됐지만 어떤 시리즈에도 반영 안 됨 | `run()`, 001 신규 후보 루프 |
| `postInfoUpdate` | 게시글 | 게시글 메타데이터만 갱신(제목 텍스트 불변, 또는 시리즈 미소속) | `run()`, 001 중복 URL 케이스 + 002 드리프트 루프 |
| `postDeleted` | 게시글 | 시리즈에 속하지 않았던 게시글이 삭제·비공개 확정 | `run()`, 002 삭제 확정 루프 |
| `seriesCreated` | 시리즈 | 새 시리즈 파일 생성 | `run()`(001 직접 생성) + `reconcile()`(002 재분류로 인한 생성) |
| `seriesAdded` | 시리즈 | 기존 시리즈 파일에 항목 추가 | `run()`(001 `appendToSeries`) + `reconcile()`(002 재조정 diff) |
| `seriesRemoved` | 시리즈 | 시리즈 파일에서 항목 제거 | `reconcile()`만(002 전용, 001은 제거하지 않음) |
| `seriesRetitled` | 시리즈 | 시리즈 파일 항목의 제목 텍스트 갱신 | `reconcile()`만(002 전용) |
| `seriesDeleted` | 시리즈 | 항목이 2개 미만으로 줄어 시리즈 파일 자체가 삭제됨 | `reconcile()`만(002 전용) |

**불변식**: 한 게시글은 한 실행에서 이 8개 카운터 중 정확히 0개 또는 1개에만 기여한다
(spec.md Edge Cases의 "게시글 1건당 정확히 한 번" 규칙, FR-016). N(커밋 제목의 총
건수)은 이 8개 값의 합이다.
