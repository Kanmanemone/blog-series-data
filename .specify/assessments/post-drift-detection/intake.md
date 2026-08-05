# Idea Intake: 게시글 삭제·제목 변경 감지 및 시리즈 json 갱신

- **Slug**: post-drift-detection
- **Created**: 2026-08-05
- **Source**: pasted text (사용자 슬래시 커맨드 입력); 관련 근거로 저장소 경로 `specs/001-tistory-series-sync/spec.md` 확인
- **Type**: new-capability

## Idea (as captured)

> feature1에서 언급했었던, 게시글 제거 또는 제목 변경까지 감지하여 업데이트하게 만들거야

**저장소 확인 결과**: 사용자가 말한 "feature1"은 `specs/001-tistory-series-sync/spec.md`로 보인다. 해당 스펙의 "Out of Scope" 섹션(145–159행)에 다음과 같이 명시되어 있다:

> 1. **게시글 제목 변경 처리** — 이미 시리즈 json에 반영된 게시글의 제목이 나중에 바뀌는 경우(같은 seriesId를 유지한 채 부제만 바뀌는 경우든, seriesId 자체가 바뀌는 경우든 모두 포함). 이번 기능은 게시글을 처음 발견한 시점의 제목만 사용하며, 이후 제목이 바뀌어도 시리즈 json의 `title`을 갱신하지 않는다.
> 2. **게시글 삭제·비공개 전환 처리** — 이미 시리즈 json에 반영된 게시글이 이후 삭제되거나 비공개로 전환되어 sitemap에서 사라지는 경우. 이번 기능은 그런 게시글을 감지하거나 시리즈 json에서 제거하지 않는다.
>
> **두 항목을 하나로 묶을 수도 있다는 점에 주의**: 둘 다 "이미 처리한 게시글이 이후 드리프트(변경·소멸)했는지 감지"라는 같은 문제의 두 가지 사례이며, 감지에 필요한 재료도 동일하다 — 이번 기능이 `.github/sync-state.json`의 `processedPosts`에 남기는 게시글별 URL·원시 시리즈명·마지막 처리 시각 기록(FR-016)이 그 기반이 된다. 다만 감지 이후 취할 조치는 다르다(제목 변경은 기존 항목 갱신, 삭제·비공개는 항목 제거 또는 보류 판단). 다음 기능을 설계할 때 "게시글 드리프트 감지"라는 하나의 기능으로 묶을지, 별도로 나눌지는 그때 결정한다.

즉 이번 아이디어는 001 스펙이 의도적으로 미룬 후속 기능을 지금 시작하는 것이다.

## Restated

001-tistory-series-sync 자동화가 이미 시리즈 json에 반영한 게시글에 대해, 이후 (a) 제목이 바뀌거나 (b) 게시글이 삭제·비공개로 전환되어 sitemap에서 사라지는 경우까지 감지하여, 해당 시리즈 json 항목을 그에 맞게 갱신하도록 만든다.

## Origin & Context

- **Raised by**: 저장소 관리자(현재 대화의 사용자)
- **Trigger**: `specs/001-tistory-series-sync/spec.md`가 이 두 사례를 명시적으로 범위 밖(Out of Scope)에 두면서 "다음 기능의 유력 후보"로 남겨둔 것의 후속 착수

## First-Glance Unknowns

- [NEEDS CLARIFICATION: 제목 변경 중에서도 seriesId 자체가 바뀌는 경우(예: 다른 시리즈로 재분류)는 기존 파일에서 항목을 제거하고 새/다른 시리즈 파일에 추가하는 것으로 처리할지, 아니면 이번 범위에서는 같은 seriesId 내 부제 변경(title 갱신)만 다루고 seriesId 변경은 또 별도로 미룰지]
- [NEEDS CLARIFICATION: 게시글 삭제·비공개 전환 감지 시 시리즈 json에서 항목을 즉시 제거할지, 아니면 관리자 확인을 위해 보류/플래그 처리할지]
- [NEEDS CLARIFICATION: 감지 주기와 워크플로우 구조 — 기존 001 워크플로우(같은 cron/스케줄)에 통합할지, 별도 워크플로우로 분리할지]
- [NEEDS CLARIFICATION: `sync-state.json`의 `processedPosts`를 어떤 방식으로 재검사할지 — 매 실행마다 기록된 게시글 전체를 재확인할지, 아니면 다른 트리거 기준이 있는지]
- [NEEDS CLARIFICATION: 게시글 접근 실패(네트워크 오류, 일시적 5xx 등)와 실제 삭제·비공개 전환을 어떻게 구분할지 — 오탐으로 인한 항목 삭제 방지책]
- [NEEDS CLARIFICATION: 이 기능을 001과 별개의 새 feature 브랜치/스펙으로 분리할지, 001을 확장하는 형태로 다룰지]
