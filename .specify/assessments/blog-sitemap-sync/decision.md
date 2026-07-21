# Decision: 티스토리 시리즈 목차 JSON 유지보수 자동화

- **Slug**: blog-sitemap-sync
- **Decided**: 2026-07-21
- **Verdict**: needs-clarification
- **Artifacts reviewed**: intake.md, problem.md, concept.md (research.md 없음)

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | adequate | 저장소 관리자 본인이 자신의 반복적인 수동 유지보수 작업을 문제로 직접 제기함(problem.md). 다만 이 저장소는 개인 블로그 데이터 저장소로 규모가 크지 않아, 문제의 시급성/규모는 외부 검증 없이 본인 진술에만 의존함. |
| Evidence strength | weak | `research.md`가 존재하지 않는다 — kenel.tistory.com/sitemap.xml을 실제로 가져와 `lastmod` 필드 존재 여부, 게시글 제목·URL 구조, 접근 가능성(로그인/robots.txt 등)을 확인한 적이 없다. concept.md의 "Assumptions to Validate" 항목 전부가 아직 검증되지 않은 가정 상태다. |
| Value vs. inaction | adequate | 자동화하지 않아도 저장소 헌법에 정의된 수동 워크플로우로 계속 운영 가능(problem.md의 Cost of Inaction). 급박한 비용은 아니지만 게시글이 늘수록 누적되는 비용은 실재한다. |
| Feasibility / appetite | adequate | concept.md에서 medium appetite의 구체적 옵션(Option B)을 추천했고, small/large 대안과 트레이드오프도 함께 제시함. |
| Strategic fit | adequate | 저장소 헌법의 "Development Workflow" 원칙("여러 파일에 걸치거나 설계가 필요한 작업은 Spec Kit으로 진행")과 부합하며, 기존 `*_series.json` 스키마를 바꾸지 않는다는 비목표와도 충돌하지 않는다. |
| Risk posture | weak | concept.md가 스스로 지목한 리스크(“Rabbit holes”, “Assumptions to Validate”)가 다수이며 — `lastmod` 신뢰도, 시리즈 판별 기준, 상태 파일 저장 방식, 삭제/수정 감지 — 그 중 어느 것도 아직 조사·검증되지 않았다. |

## Verdict & Rationale

Evidence strength가 `weak`로 평가되어 `go` 기준(“evidence strength adequate 이상, 절대 weak/unknown 아님”)을 충족하지 못한다. 문제 자체는 타당하고(`problem validity: adequate`) 방향성 있는 개념(`Option B`)도 마련되어 있지만, 그 개념이 의존하는 핵심 가정 — 특히 sitemap.xml에 `lastmod`와 게시글 제목이 실제로 어떤 형태로 노출되는지 — 을 실제로 확인한 적이 없다. 확인 없이 `/speckit-specify`로 넘기면, 스펙 작성 중간에 "sitemap에 필요한 정보가 없다"거나 "`lastmod`가 기대와 다르게 동작한다"는 사실이 드러나 처음부터 다시 정의해야 할 위험이 크다. 따라서 `needs-clarification`으로 판정하고, 리서치 단계로 되돌린다.

## If needs-clarification

- **Blocking questions**:
  - [NEEDS CLARIFICATION: kenel.tistory.com/sitemap.xml을 실제로 가져왔을 때 `<lastmod>` 필드가 각 게시글 URL마다 존재하는지, 그리고 그 값이 게시글의 실질적인 변경(신규 발행 포함)을 신뢰성 있게 반영하는지]
  - [NEEDS CLARIFICATION: sitemap.xml이 게시글 제목까지 제공하는지, 아니면 URL만 제공해서 별도로 각 게시글 페이지에 접근해 제목을 읽어야 하는지 — 후자라면 "매번 일일이 들어가 확인"하는 부담을 얼마나 줄일 수 있는지 재검토 필요]
  - [NEEDS CLARIFICATION: 기존 `*_series.json` 파일들의 실제 제목 목록을 바탕으로, 신규 게시글의 시리즈 소속을 자동으로 판별할 수 있을 만한 패턴(제목 접두어, 키워드 등)이 실제로 존재하는지]
  - [NEEDS CLARIFICATION: "마지막 동기화 시점" 상태를 저장소 내 어떤 방식(state 파일, 커밋 히스토리 등)으로 저장하는 것이 GitHub Actions 환경에서 안전하고 충돌 없이 동작하는지]
- **Revisit stage**: research

## If go — Handoff to `/speckit-specify`

(해당 없음 — 이번 판정은 `needs-clarification`이며, 위 리서치 질문이 해소된 뒤 `/speckit-assess-research` → 필요시 `/speckit-assess-define`/`/speckit-assess-shape` 갱신 → `/speckit-assess-decide` 재실행을 거쳐야 한다.)
