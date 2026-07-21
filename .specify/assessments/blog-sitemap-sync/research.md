# Idea Research: 티스토리 시리즈 목차 JSON 유지보수 자동화

- **Slug**: blog-sitemap-sync
- **Created**: 2026-07-21
- **Evidence confidence (overall)**: medium

## Users & Demand

- 이 저장소의 유일한 사용자는 저장소 관리자(현재 세션 사용자) 본인이며, 문제 제기도 본인의 직접 진술에 근거한다 — [ASSUMPTION] (confidence: medium; 외부 수요 검증 없음, 다만 1인 운영 개인 블로그 저장소이므로 외부 수요가 애초에 요구되는 성격의 문제가 아님)

## Prior Art

- 저장소에 이미 `keyword_filename_formatter.html`이라는 도구가 존재하며, 그 안의 `formatKeyword()` 함수가 사용자가 이번에 설명한 파일명 규칙(공백 제거 + 소문자 변환 + Windows 금지 문자 `[\/:*?"<>|]` 제거 + `_series.json` 접미사)을 정확히 그대로 구현하고 있다 — [source: keyword_filename_formatter.html:128-142] (confidence: high, cited). 즉 이번에 사용자가 말한 규칙은 새로 만드는 규칙이 아니라 이미 저장소에 코드로 존재하는 규칙이다.
- 기존 `*_series.json` 25개 파일을 확인한 결과, `listName`을 파일명 규칙에 그대로 적용하면 실제 파일명과 일치한다 — 예: `listName: "2026 Build with AI: Hands-on Campus"` → `2026buildwithaihands-oncampus_series.json` (공백 제거, 소문자화, `:` 제거) — [source: 2026buildwithaihands-oncampus_series.json, keyword_filename_formatter.html] (confidence: high, cited)
- 기존 게시글 제목들은 대체로 `[선택적 대괄호 태그] <시리즈명> - <부제>` 패턴을 따른다 — 예: `"[Kotlin] Coroutines - 기초"`, `"[콘퍼런스] 2026 Build with AI: Hands-on Campus - 참석 후기"` — [source: coroutines_series.json, 2026buildwithaihands-oncampus_series.json] (confidence: medium; 패턴이 우세하지만 대괄호 태그 유무나 구분자가 완전히 균일하지는 않음)
- 이 저장소에는 GitHub Actions 워크플로우가 아직 하나도 없다 (`.github/workflows/` 디렉터리 없음) — [source: repo file listing] (confidence: high, cited). 즉 "마지막 동기화 시점을 기록하는 state 파일" 접근은 이 저장소에서 검증된 선례가 없는 새로운 패턴이다.

## Market & Context

- 대안은 사실상 하나뿐이다: 저장소 헌법(`Development Workflow`)에 명시된 대로 사람이 직접 `*_series.json`의 `items` 배열 끝에 항목을 추가하는 수동 방식 — [source: .specify/memory/constitution.md] (confidence: high, cited)

## Data & Constraints

- kenel.tistory.com/sitemap.xml을 직접 가져와 확인한 결과 (사용자 동의 하에 fetch, host: kenel.tistory.com, policy: confirmed-by-user):
  - 각 `<url>` 항목은 `<loc>`과 `<lastmod>`(ISO 8601)를 모두 포함한다 — 사용자의 진술과 일치 (confidence: high, cited)
  - 게시글 제목은 sitemap에 포함되어 있지 않다 — 사용자의 진술과 일치, 시리즈 판별을 위해서는 각 게시글 URL에 개별적으로 접근해 제목을 읽어야 한다는 가정이 확인됨 (confidence: high, cited)
  - sitemap 항목 수는 전체 약 430개, 데스크톱/모바일(`/418` vs `/m/418`) 쌍이 중복 존재하여 실질 게시글 수는 약 215개로 추정된다 — [source: 직접 fetch한 sitemap.xml] (confidence: medium; 정확한 총 게시글 수는 도구가 자동 요약한 것으로 오차 가능)
  - 카테고리 페이지 등 게시글이 아닌 URL도 sitemap에 함께 포함되어 있다 — [source: 직접 fetch한 sitemap.xml] (confidence: high, cited)
  - sitemap 상 가장 최근 게시글은 `/418`(lastmod 2026-07-20)이며, 현재 저장소의 어떤 `*_series.json`에도 아직 `/415`~`/418` 게시글은 포함되어 있지 않다 — [source: 직접 fetch한 sitemap.xml, 저장소 내 `*_series.json` 전체 확인] (confidence: high, cited) — 즉 실제로 미반영된 게시글이 현재 존재한다.
- 티스토리 sitemap.xml 접근에 로그인이나 인증이 필요한지는 이번 fetch로 확인되지 않았다(공개적으로 fetch 가능했다는 사실 자체가 로그인 불필요를 시사하지만, robots.txt 등 크롤링 제약은 별도로 확인하지 않았다) — [ASSUMPTION] (confidence: low)

## Evidence Against the Idea

- Sitemap이 제목을 제공하지 않으므로, "매번 게시글에 일일이 들어가 확인하는 부담을 줄인다"는 원래 문제의식이 `lastmod` 필터링만으로는 절반만 해결된다 — 필터링된 각 게시글에 대해서는 여전히 개별 페이지 fetch가 필요하다. 다만 전체 sitemap이 아닌 "변경된 것만" 방문하면 되므로 부담 자체는 크게 줄어든다.
- 데스크톱/모바일 URL 쌍이 동일한 `lastmod`로 중복 존재하므로, 단순히 "lastmod가 최신인 항목"만 필터링하면 같은 게시글이 두 번 처리될 위험이 있다 — 이는 problem.md/concept.md 작성 시점에는 드러나지 않았던 새로운 리스크다.
- 카테고리 페이지 등 게시글이 아닌 URL도 섞여 있어, URL 패턴(예: 숫자 slug 여부)으로 게시글과 비게시글을 구분하는 로직이 별도로 필요하다 — 이 역시 이전 단계에서는 고려되지 않았다.
- 기존 게시글 제목 패턴(`[태그] 시리즈명 - 부제`)이 우세하긴 하지만 완전히 균일하지는 않아, 시리즈 자동 판별이 단순한 규칙만으로 항상 정확하지는 않을 수 있다.
- "마지막 동기화 시점을 기록하는 state 파일" 접근은 이 저장소에서 시도된 적 없는 새로운 패턴이며, GitHub Actions 실행 중 커밋 충돌(동시 실행, PR 머지 타이밍 등)을 다루는 구체적 방법은 아직 검증되지 않았다.

## Gaps & Open Questions

- [NEEDS CLARIFICATION: kenel.tistory.com/sitemap.xml 또는 개별 게시글 페이지에 대한 접근이 로그인 없이 항상 가능한지, robots.txt나 rate limit 등 크롤링 제약이 있는지]
- [NEEDS CLARIFICATION: 데스크톱(`/418`)과 모바일(`/m/418`) 중복 URL을 어떻게 하나로 취급할지 (둘 중 하나만 처리, 또는 둘 다 무시하고 정규화된 게시글 번호 기준으로 처리)]
- [NEEDS CLARIFICATION: sitemap에 섞여 있는 카테고리 페이지 등 비게시글 URL을 게시글과 구분할 URL 패턴 기준]
- [NEEDS CLARIFICATION: `[태그] 시리즈명 - 부제` 패턴에서 벗어나는 제목(태그 없음, 다른 구분자 등)을 만났을 때 시리즈를 어떻게 판별할지]
- [NEEDS CLARIFICATION: state 파일(마지막 동기화 시점)의 정확한 저장 위치·포맷과, 워크플로우 동시 실행/커밋 충돌 방지 방법]

## Sources

- keyword_filename_formatter.html (repo file, read directly)
- 2026buildwithaihands-oncampus_series.json, coroutines_series.json 등 기존 `*_series.json` 25개 (repo files, read directly)
- .specify/memory/constitution.md (repo file, read directly)
- https://kenel.tistory.com/sitemap.xml (host: kenel.tistory.com, policy: confirmed-by-user)
