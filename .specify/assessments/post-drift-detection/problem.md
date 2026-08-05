# Problem Definition: 이미 반영된 게시글의 제목 변경·삭제(드리프트) 감지

- **Slug**: post-drift-detection
- **Created**: 2026-08-05
- **Inputs used**: intake.md, research.md

## Problem Statement

001-tistory-series-sync 자동화는 게시글을 처음 발견한 시점의 제목만 시리즈 json에 기록하고 이후 다시 확인하지 않는다. 그 결과 이미 `*_series.json`에 반영된 게시글의 제목이 나중에 바뀌거나, 게시글이 삭제·비공개로 전환되어 sitemap에서 사라지더라도, 시리즈 json에는 옛 제목이나 죽은 링크가 자동화가 개입할 방법 없이 무기한 남는다. 001 스펙이 이 두 경우를 의도적으로 범위 밖에 두면서 후속 기능 후보로 남겨두었기 때문에(research.md "Prior Art"), 지금 이 간극을 메울지 판단해야 한다.

## Affected Users & Stakeholders

- **Users**: `index.html`을 통해 시리즈 목차를 읽는 블로그 방문자 — 제목이 바뀐 게시글은 목차와 실제 페이지 제목이 어긋나 보이고, 삭제·비공개 전환된 게시글은 클릭 시 깨진 링크로 이어진다. [source: research.md "Cost of Inaction" 근거]
- **Stakeholders**: 저장소 관리자(`kenel.tistory.com` 운영자, 이번 대화의 사용자) — 시리즈 json의 정확성을 유지할 책임과 결정 권한을 모두 가진 유일한 이해관계자. [source: intake.md "Origin & Context", research.md "Users & Demand"]

## Goals

- 이미 시리즈 json에 반영된 게시글의 제목이 바뀌면, 그 변경이 수동 개입 없이도 결국 시리즈 json에 반영된다.
- 이미 시리즈 json에 반영된 게시글이 삭제되거나 비공개로 전환되면, 그 사실이 최소한 감지되어 관리자가 인지할 수 있다(즉시 자동 삭제까지 할지는 별도 판단 — Non-Goals·Open Questions 참고).
- 001이 남긴 `.github/sync-state.json`의 `processedPosts` 기록(FR-016)을 실제로 활용해, 새 데이터 구조를 새로 설계하지 않고 기존 기반 위에서 동작한다. [source: research.md "Prior Art"]

## Non-Goals

- **삭제·비공개 전환 감지 즉시 자동 삭제 여부를 이번 문서에서 확정하지 않는다** — research.md가 지적한 위험 등급 불일치(001의 "추가만 하는" 안전 모델과 "항목 제거"라는 파괴적 작업의 차이) 때문에, 자동 삭제로 할지 보류/플래그로 할지는 `/speckit-assess-shape` 이후 설계 단계의 판단으로 남긴다.
- seriesId 자체가 바뀌는 재분류(다른 시리즈로 이동)까지 다루는지는 이번 문제 정의에서 확정하지 않는다 — intake.md가 이미 별도 NEEDS CLARIFICATION으로 남겨둔 항목이다.
- 001 워크플로우 자체의 구조(예약 주기, 커밋 방식)를 바꾸는 것은 목표가 아니다 — 드리프트 감지가 어떤 워크플로우/스케줄로 도는지는 설계 단계의 문제다.
- 새로운 사용자 대상 기능(예: 삭제된 게시글에 대한 안내 페이지)을 만드는 것은 범위 밖이다 — 이번 문제는 데이터 정확성 유지에 관한 것이다.

## Success Metrics

- 시리즈 json에 반영된 게시글 중, 실제 게시글 제목과 시리즈 json의 `title`이 어긋난 상태로 남아있는 기간이 있다면 그 기간이 유한하게 줄어든다(현재는 무한정 — 001은 재확인 로직이 없음). (baseline: 현재 재확인 메커니즘 없음 — research.md "Cost of Inaction")
- 삭제·비공개 전환된 게시글이 시리즈 json에 죽은 링크로 남아있는 상태가 관리자에게 감지되지 않은 채 무기한 지속되는 일이 없어진다. (baseline: 현재 감지 메커니즘 없음 — `seriesFiles.js`가 계산은 하지만 버리고 있음, research.md "Prior Art")
- [NEEDS CLARIFICATION: "정확성 유지"를 정성적 관찰(001의 SC-004처럼 별도 계측 없이 체감)로 둘지, 아니면 구체적 수치(예: 재확인 주기 N시간 이내)로 못박을지는 결정되지 않음]

## Cost of Inaction

001이 만든 자동화는 앞으로도 계속 새 게시글만 append하고, 이미 반영된 331건(그중 시리즈 json에 실제로 들어간 것은 201건)의 항목은 재확인 없이 방치된다. research.md가 확인한 대로 삭제 감지에 필요한 계산(`seriesFiles.js`의 sitemap 결측 확인)은 이미 매 실행마다 이루어지고 있지만 결과가 버려지고 있어, "아무것도 안 만들어도 이미 계산 중인 신호를 그냥 흘려보내는" 특이한 상태다. 다만 research.md가 지적했듯, 001이 배포된 뒤(2026-07-21/22) 실제로 제목이 바뀌었거나 삭제된 게시글이 있었다는 증거는 저장소 안에 없다 — 방치 비용은 이론적으로는 존재하지만, 현재까지 실측된 피해는 확인되지 않았다.

## Open Questions

- [NEEDS CLARIFICATION: 001 배포 이후 실제로 드리프트(제목 변경·삭제)가 발생한 게시글이 있는가? research.md가 제안한 대로, 설계에 들어가기 전에 수동으로 한 번 sitemap diff를 떠보는 것이 이 문제의 긴급성을 검증하는 가장 빠른 방법이다.]
- [NEEDS CLARIFICATION: 삭제·비공개 전환 감지 시 즉시 자동 삭제할지, 보류·플래그 처리할지 — 001의 "추가 전용 자동 push" 안전 모델과 "항목 제거"라는 파괴적 작업 사이의 위험 등급 불일치를 어떻게 해소할지(research.md "Evidence Against the Idea")]
- [NEEDS CLARIFICATION: seriesId 자체가 바뀌는 재분류까지 다룰지, 같은 seriesId 내 부제 변경만 다룰지 (intake.md)]
- [NEEDS CLARIFICATION: 감지 주기와 워크플로우 구조 — 기존 001 워크플로우에 통합할지 분리할지 (intake.md)]
- [NEEDS CLARIFICATION: 게시글 접근 실패(네트워크 오류, 일시적 5xx)와 실제 삭제·비공개 전환을 어떻게 구분할지 — 현재 스크립트는 fetch 실패를 "이번 실행만 건너뜀"으로 처리하며 삭제로 결론짓지 않음(research.md "Data & Constraints"). 이 구분 신호를 명확히 설계해야 오탐으로 인한 항목 삭제를 막을 수 있다.]
- [NEEDS CLARIFICATION: 전체 재확인(331건 또는 201건) 방식이 kenel.tistory.com에 매 6시간마다 가하는 요청량 증가를 감안할 때, sitemap 결측 확인(이미 계산되는 값, 저비용)과 제목 재조회(게시글당 fetch 필요, 고비용)를 분리해서 단계적으로 설계할지(research.md "Gaps & Open Questions")]

