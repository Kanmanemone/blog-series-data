# Data Model: 티스토리 시리즈 목차 JSON 동기화 자동화

**Input**: [spec.md](spec.md) Key Entities, [research.md](research.md)

## Post (게시글)

sitemap 조회 및 제목 확인 과정에서 스크립트가 메모리에 구성하는 값. 별도 파일로
영속화되지 않으며, 처리 결과만 Series File과 Sync State에 반영된다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | string | URL 경로의 숫자 부분(예: `"104"`). 데스크톱/모바일 URL을 같은 게시글로 병합하는 키(FR-005) |
| `canonicalUrl` | string | 시리즈 json에 기록할 데스크톱 URL(`https://kenel.tistory.com/<id>`) |
| `lastmod` | Date | sitemap의 `<lastmod>`를 파싱한 값. 오프셋 포함 ISO 문자열이므로 타임존 무관하게 정확한 순간을 가리킴(research.md §5) |
| `title` | string \| null | 게시글 페이지 `<title>` 태그 원문. FR-004 커트라인을 통과한 게시글만 조회함(FR-007) |
| `rawSeriesName` | string \| null | `title`에서 추출한 원시 시리즈명(FR-008). 추출 불가 시 `null`이며, 이 게시글은 이후 매칭·생성 대상에서 제외 |
| `seriesId` | string \| null | `rawSeriesName`을 정규화한 값(research.md §4). `rawSeriesName`이 `null`이면 `null` |

**도출 규칙**: `id` → (sitemap 병합) → `lastmod` → (커트라인 필터) → `title` 조회 →
`rawSeriesName` 추출 → `seriesId` 정규화. 각 단계는 spec.md 배경 섹션의 용어 표와
1:1로 대응한다.

## Series File (시리즈 파일, `<seriesId>_series.json`)

Constitution I(시리즈 데이터 스키마 일관성)에 정의된 기존 스키마를 그대로 따르며, 이번
기능은 필드를 추가하지 않는다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `listName` | string | 사람이 읽는 시리즈 이름. 기존 파일 갱신 시 유지, 신규 파일 생성 시 가장 먼저 발견된 게시글의 `rawSeriesName`(FR-013) |
| `items` | array | 발행 순서(오래된 것 → 최신 것)로 정렬된 게시글 목록 |
| `items[].title` | string | Post.title |
| `items[].url` | string | Post.canonicalUrl |

**파일명**: `<seriesId>_series.json` (저장소 루트, 기존 파일과 동일 위치).

**갱신 규칙**:
- 기존 매칭(FR-010, FR-011): `items`에 같은 `url`이 있으면 건너뛰고, 없으면 배열 끝에
  추가. 기존 항목 순서는 보존.
- 신규 생성(FR-012, FR-013): 매칭되는 기존 파일이 없고, 같은 `seriesId`를 공유하는
  sitemap상 게시글이 2개 이상일 때만 생성. `items`는 해당 seriesId를 공유하는 모든
  게시글을 `lastmod` 오름차순으로 채움.

## Sync State (동기화 상태, `.github/sync-state.json`)

| 필드 | 타입 | 설명 |
|---|---|---|
| `cutoff` | string | 다음 실행의 기준이 될 커트라인 시각. `+09:00` 오프셋 포함 ISO 8601 문자열(FR-002, FR-003) |
| `processedPosts` | array | 지금까지 처리한 게시글별 기록(FR-016) |
| `processedPosts[].url` | string | Post.canonicalUrl |
| `processedPosts[].rawSeriesName` | string \| null | 처리 시점의 Post.rawSeriesName |
| `processedPosts[].processedAt` | string | 처리 시각. `+09:00` 오프셋 포함 ISO 8601 문자열 |

**갱신 규칙**: 이번 실행에서 계산한 `cutoff`와 새로 처리한 게시글 기록은 워킹 트리에
반영되어 PR에 포함되지만, **PR이 병합되기 전까지는 다음 실행이 참조하는 저장소 상태에
반영되지 않는다**(FR-015) — 이는 스크립트가 아니라 "PR 병합"이라는 Git 동작 자체로
보장된다.

**예시**:

```json
{
  "cutoff": "2026-07-21T14:55:00+09:00",
  "processedPosts": [
    {
      "url": "https://kenel.tistory.com/104",
      "rawSeriesName": "Coroutines",
      "processedAt": "2026-07-21T15:00:03+09:00"
    }
  ]
}
```

## 상태 전이

Post는 별도 상태 필드를 갖지 않지만, 한 번의 실행 안에서 다음 판정 흐름을 거친다.

```
sitemap 항목
  → (경로가 게시글 패턴인가? FR-006) 아니오 → 제외
  → (같은 id의 데스크톱/모바일 병합 FR-005)
  → (lastmod > 저장된 cutoff? FR-004) 아니오 → 제외
  → 제목 조회(FR-007)
  → (" - " 존재? FR-008) 아니오 → 제외(매칭·생성 대상 아님, 처리 기록에는 남길지는
     구현 시 FR-016 범위 내에서 결정)
  → rawSeriesName, seriesId 계산
  → (기존 <seriesId>_series.json 존재? FR-010)
      예 → (url이 items에 이미 있는가? FR-011) 아니오 → items에 추가
      아니오 → (같은 seriesId를 공유하는 sitemap상 게시글 ≥ 2? FR-012) 예 → 신규 파일 생성(FR-013)
```
