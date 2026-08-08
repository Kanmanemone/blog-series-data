# Decision: 게시글 드리프트(제목 변경·삭제) 감지 및 갱신

- **Slug**: post-drift-detection
- **Decided**: 2026-08-08
- **Verdict**: go
- **Artifacts reviewed**: intake.md, research.md, problem.md, concept.md

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | adequate | 001 스펙이 이 두 사례를 명시적으로 범위 밖에 두면서 "다음 기능 후보"로 남겨둔 실제 간극이며, 저장소의 유일한 이해관계자(관리자 본인)가 직접 요청함. 다만 001 배포(2026-07-21/22) 이후 실제 드리프트 발생 사례는 저장소 안에서 확인되지 않아, 문제 자체는 실재하지만 긴급도는 아직 실측되지 않음(problem.md "Cost of Inaction", "Open Questions"). |
| Evidence strength | adequate | 실현 가능성 근거는 강함 — 삭제 감지 신호(`seriesFiles.js`의 sitemap 결측 계산)와 제목 재조회 패턴(`index.js`)이 이미 코드에 존재함이 직접 확인됨(research.md "Prior Art"). 특히 concept.md 논의 중 가장 큰 미검증 가정이었던 "Tistory가 게시글 수정 시 sitemap lastmod를 갱신하는가"가 저장소 관리자에 의해 직접 확인되어(concept.md "Assumptions to Validate"), Option B의 핵심 메커니즘(lastmod diff)이 가정이 아닌 확인된 사실 위에 서게 됨. 다만 수요/긴급성 쪽 증거는 n=1 이해관계자의 선제적 요청뿐(research.md "Users & Demand")이라 이 축은 여전히 약함. |
| Value vs. inaction | adequate | 방치 시 제목 불일치·죽은 링크가 무기한 남는다는 비용은 실재하지만 현재까지 실측된 피해는 없음(problem.md "Cost of Inaction"). 반면 Option B로 얻는 수정 비용은 낮음 — 이미 계산 중인 신호 재사용 + lastmod diff로 좁힌 소수 재조회뿐이라 가치 대비 비용이 유리함. |
| Feasibility / appetite | strong | concept.md Option B가 medium appetite의 구체적 메커니즘(lastmod diff)까지 정의되어 있고, 새 데이터 구조 없이 `sync-state.json`의 기존 `processedPosts`를 확장하는 선에서 동작함(problem.md Goal 3, research.md "Schema constraint"). 가장 큰 기술적 리스크였던 "331건 전체 재조회로 인한 요청량 급증"이 lastmod diff로 사실상 해소됨. |
| Strategic fit | strong | 001 스펙이 스스로 남긴 후속 과제이며, `processedPosts`의 FR-016 설계 의도(URL·원시 시리즈명·처리 시각 기록)와 정확히 맞물림. 단일 관리자의 "시리즈 json 정확성 유지"라는 목표에도 직접 부합. |
| Risk posture | adequate | research.md가 지적한 핵심 위험(001의 "파괴적 조작 없는 무검토 자동 push" 모델 위에 삭제라는 파괴적 조작을 얹는 위험 등급 불일치)을 Option B는 "삭제는 플래그만, 자동 제거 안 함"으로 정면 회피함. 남은 리스크(접근 실패 vs 실제 삭제 구분, 플래그 노출 지점)는 묻히지 않고 concept.md "Assumptions to Validate"·"Rabbit holes"에 명시적으로 남아 스펙 단계로 이월됨. |

## Verdict & Rationale

**go.** Problem validity와 evidence strength가 모두 `adequate` 이상이고(evidence strength가 `weak`/`unknown`이 아님), concept.md가 명확한 권장 옵션(Option B)을 제시하고 있어 go의 두 가지 필수 조건을 충족한다. 결정적으로, 이전에 evidence strength를 끌어내리던 가장 큰 미검증 가정(Tistory의 sitemap lastmod 갱신 동작)이 이번 shape 단계에서 관리자에 의해 직접 확인되면서, Option B의 핵심 메커니즘이 가정이 아닌 검증된 사실 위에 서게 되었다. 또한 Option B는 research.md가 강하게 경고한 위험 등급 불일치(파괴적 삭제를 001의 무검토 자동 push 모델에 얹는 것)를 "삭제는 감지·플래그만, 자동 제거는 별도 후속 판단"으로 명확히 피해가므로, risk posture도 `adequate`로 평가할 수 있다. 남은 약점(수요 증거가 n=1 선제 요청뿐, 실측된 드리프트 사례 부재)은 문제의 실재성 자체를 흔들지 않으며, 수정 비용이 낮은 점(기존 신호 재사용)을 고려하면 지금 스펙 단계로 넘기는 것이 합리적이다.

## If go — Handoff to `/speckit-specify`

- **Problem**: 001-tistory-series-sync가 이미 시리즈 json에 반영한 게시글의 제목 변경·삭제(비공개 전환)를 재확인하지 않아, 옛 제목과 죽은 링크가 수동 개입 없이는 무기한 남는다.
- **Chosen approach**: concept.md Option B — `processedPosts`에 처리 시점의 sitemap `lastmod`를 저장해두고, 매 실행마다 새로 받은 sitemap의 현재 `lastmod`와 비교(추가 요청 없음)해 마지막 처리 이후 실제로 바뀐 게시글만 골라 그 소수에 대해서만 title을 재조회, 시리즈 json의 `title`을 자동 갱신한다(001과 동일한 "추가 성격" 안전 모델 유지). sitemap에서 URL이 사라진 게시글은 같은 diff 과정에서 함께 드러나되, 시리즈 json에서 자동으로 제거하지 않고 플래그·리포트로 남겨 관리자가 직접 판단한다.
- **In scope / out of scope**:
  - In: 같은 seriesId 내에서 남아있는 게시글의 제목 변경 자동 반영; sitemap 결측(삭제·비공개 전환) 감지 및 플래그.
  - Out (concept.md "Out of Scope"): 삭제·비공개 전환 게시글의 시리즈 json 자동 제거; seriesId 자체가 바뀌는 재분류; 001 워크플로우의 예약 주기·커밋 방식 자체 변경; 삭제된 게시글용 신규 사용자 대상 기능; title 재조회 대상이 예상보다 많아질 때(대량 재발행 등)의 배치·스로틀링 전략 구체안.
- **Success metrics** (problem.md, 정성적 — 정량화는 스펙 단계 판단):
  - 시리즈 json의 `title`이 실제 게시글 제목과 어긋난 채로 남아있는 기간이 유한해진다(현재는 무한정).
  - 삭제·비공개 전환된 게시글이 관리자에게 감지되지 않은 채 무기한 방치되는 일이 없어진다.
- **Carried-forward open questions**:
  - [NEEDS CLARIFICATION: 접근 실패(네트워크 오류, 일시적 5xx)와 실제 삭제·비공개 전환을 구분할 구체적 판정 로직 — 오탐으로 인한 잘못된 플래그 방지]
  - [NEEDS CLARIFICATION: 삭제 플래그를 어디에 남길지 — GitHub 이슈, 워크플로우 실행 요약, 별도 리포트 파일 중 이 저장소의 운영 방식과 맞는 것]
  - [NEEDS CLARIFICATION: `processedPosts`에 `lastmod` 필드를 추가하는 구체적 스키마 형태와, 기존 레코드(마이그레이션 이전 데이터)와의 호환 처리]
  - [NEEDS CLARIFICATION: 감지 주기·워크플로우 구조 — 기존 001 워크플로우에 통합할지 별도로 분리할지]
  - [NEEDS CLARIFICATION: title 재조회 대상이 예상보다 많아지는 경우(대량 재발행 등)의 배치·순차 처리 전략]
  - [참고: seriesId 자체가 바뀌는 재분류 처리는 이번 기능의 범위 밖으로 확정(Non-Goal)이며, 별도 아이디어로 취급]
