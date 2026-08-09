# Data Model: 게시글 드리프트(제목 변경·삭제) 감지 및 갱신

**Input**: [spec.md](spec.md) Key Entities, [research.md](research.md)

이 기능은 001의 기존 산출물(`*_series.json`)을 재사용하고, `.github/sync-state.json`을
확장하며, 신규 상태 파일 하나(`.github/series-assignments.json`)를 추가한다.

## Processed Post (처리 이력 레코드, `.github/sync-state.json` 확장)

001의 기존 `processedPosts[]` 엔트리를 확장한다. `rawSeriesName`은 제거하고 `title`로
대체하며, `lastMod`·`deletedAt`을 추가한다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `url` | string | Post.canonicalUrl(001과 동일) |
| `title` | string | 마지막으로 확인한 게시글 제목 전체(신규 — 기존 `rawSeriesName`을 대체). `rawSeriesName`·`seriesId`가 필요하면 이 값에서 그때그때 재계산한다(research.md §2) |
| `lastMod` | string \| undefined | 마지막으로 확인한 sitemap `<lastmod>` 값(ISO 8601, sitemap이 제공하는 원본 오프셋 그대로 파싱한 `Date`의 `toISOString()`). 이 기능 배포 이전 레코드는 이 필드가 없으며, 없으면 "변경 여부 불명"으로 취급한다(research.md §2) |
| `processedAt` | string | 처리 시각, `+09:00` 오프셋 ISO 8601 문자열(001과 동일) |
| `deletedAt` | string \| null | 삭제·비공개 전환이 확정된 시각(`+09:00` 오프셋 ISO 8601). 확정 전에는 `null`이거나 필드 자체가 없음(신규) |

**재확인 후보 판정** (FR-002): `!record.lastMod || currentSitemapPost.lastmod >
new Date(record.lastMod)` 이고 `record.deletedAt`이 없을 때 후보로 선별한다. 이미
`deletedAt`이 설정된 레코드는 후보에서 제외한다(FR-013 — 재확인하지 않음).

**갱신 규칙**: 후보로 선별되어 제목을 재조회한 게시글은 `title`·`lastMod`를 이번 실행
값으로 덮어쓴다. 공개 게시글 목록 조회가 성공했음에도 이 URL이 결과에 없으면
`deletedAt`을 이번 실행 시각으로 설정한다(FR-005). 그 외 필드는 001과 동일하게
`processedAt`을 갱신한다.

## Series Assignment (배치 결정 레코드, `.github/series-assignments.json`, 신규)

| 필드 | 타입 | 설명 |
|---|---|---|
| (최상위) | object | `seriesId`를 키로 하는 맵 |
| `<seriesId>.listName` | string | 001의 FR-013과 동일한 규칙 — 이 seriesId에 속한 posts 중 가장 먼저 발행된(lastMod 가장 이른) 게시글의 원시 시리즈명 |
| `<seriesId>.posts` | array | 이 seriesId에 배치된 게시글 목록, 발행 순서(lastMod 오름차순) |
| `<seriesId>.posts[].url` | string | Post.canonicalUrl |
| `<seriesId>.posts[].title` | string | 배치 결정 시점의 게시글 제목 전체 |

**부분 갱신 규칙** (FR-006, research.md §3): 이번 실행에서 `title`/`lastMod`가 새로
갱신됐거나 `deletedAt`이 새로 설정된 처리 이력 레코드에 대해서만, 해당 게시글의 배치
위치를 재계산한다. 삭제 확정 게시글은 어떤 `posts` 배열에서도 제거되고 어디에도
다시 추가되지 않는다(FR-007). 재분류 대상이 새 seriesId 그룹에서 2개 미만이 되는
경우, 이동을 보류하고 기존 위치에 남긴다(옛 seriesId 아래, 새 `title`로).

**예시**:

```json
{
  "coroutines": {
    "listName": "Coroutines",
    "posts": [
      { "url": "https://kenel.tistory.com/104", "title": "Coroutines - 1. 시작" },
      { "url": "https://kenel.tistory.com/110", "title": "Coroutines - 2. 취소" }
    ]
  }
}
```

## Series File (시리즈 목차 파일, `<seriesId>_series.json`)

Constitution I 스키마를 그대로 유지한다(001과 동일, 이 기능은 필드를 추가하지 않는다).
이 기능의 관점에서는 **배치 결정에 대해 재조정되는 산출물**이다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `listName` | string | 매칭되는 배치 결정 항목의 `listName`(파일이 이미 있으면 기존 값 유지 — 001의 append-only 관행과 동일하게 listName 자체는 재조정 대상이 아님) |
| `items` | array | 배치 결정 `posts`와 재조정된 목록(FR-008~011) |
| `items[].title` | string | 배치 결정 posts[].title |
| `items[].url` | string | 배치 결정 posts[].url |

**재조정 규칙** (research.md §4): 배치 결정에 없는 seriesId의 파일은 건드리지 않는다
(이 기능 범위 밖 — 001이나 다른 미편입 시리즈). 배치 결정에 있는 seriesId는:
- `posts.length < 2`: 파일이 있으면 삭제, 없으면 생성하지 않음(FR-011)
- `posts.length >= 2`, 파일 없음: 새로 생성(FR-010)
- `posts.length >= 2`, 파일 있음: `items`를 `posts`와 diff해 다른 부분만 갱신(FR-008,
  FR-009, FR-010) — url 기준 누락 항목 추가, 더 이상 없는 항목 제거, title 다른 항목 갱신.
  diff가 없으면 파일을 쓰지 않는다(SC-006).

## Commit Change Summary (커밋 변경 요약, 영속화되지 않음)

재조정 단계(§ Series File)가 만드는 CUD 목록을 실행 안에서만 메모리에 들고 있다가
커밋 메시지 생성에 쓴다. 별도 파일로 저장하지 않는다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `type` | "created" \| "updated" \| "deleted" | 시리즈 목차 파일에 대한 조작 유형 |
| `seriesId` | string | 대상 파일의 seriesId |
| `detail` | string | 사람이 읽는 요약(예: "제목 갱신 1건, 항목 추가 1건") |

**사용처**: FR-012 — 워크플로우의 커밋 스텝이 이 목록을 받아 커밋 메시지 본문을 구성한다
(research.md §6, 전달 방식은 tasks 단계에서 확정).

## 상태 전이

```
sitemap 항목 (001의 기존 흐름, 변경 없음)
  → 새 게시글 처리(001) — 이 기능과 무관

이미 처리된 게시글(processedPosts에 기록됨, 이 기능의 대상)
  → (lastMod 없음 또는 최신? FR-002) 아니오 → 재확인 후보 아님 → 배치 결정 그대로
  → 재확인 후보
  → (공개 게시글 목록에 여전히 존재? FR-005)
      아니오 → deletedAt 설정 → 배치 결정에서 제거(FR-007) → 재조정에서 항목 제거/파일 삭제
      예 → 제목 재조회(FR-003) → title·lastMod 갱신(FR-004)
          → 새 seriesId 계산
          → (기존 배치 위치와 seriesId 동일?)
              예 → 같은 위치에서 title만 갱신
              아니오 → (새 seriesId 그룹이 이 게시글 포함 2개 이상?)
                  예 → 기존 위치에서 제거 + 새 위치에 추가(재분류)
                  아니오 → 기존 위치에 유지, title만 갱신(이동 보류)
  → 재조정(FR-008~011): 배치 결정 전체 vs 실제 파일 전체 비교, 다른 부분만 반영
  → 변경 있으면 커밋 메시지에 CUD 요약 포함(FR-012)
```
