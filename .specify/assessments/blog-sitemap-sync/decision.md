# Decision: 티스토리 시리즈 목차 JSON 유지보수 자동화

- **Slug**: blog-sitemap-sync
- **Decided**: 2026-07-21
- **Verdict**: go
- **Artifacts reviewed**: intake.md, research.md, problem.md, concept.md

## Scorecard

| Criterion | Rating | Justification |
|-----------|--------|----------------|
| Problem validity | strong | 관리자 본인이 반복적 수동 유지보수 부담을 문제로 제기했고(problem.md), research.md에서 실제로 sitemap의 최신 게시글(`/415`~`/418`)이 아직 어떤 `*_series.json`에도 반영되지 않은 상태임을 직접 확인해 문제가 지금 실재함을 입증했다. |
| Evidence strength | adequate | 핵심 가정(`lastmod` 필드 존재, 제목 미포함, 파일명 규칙, 기존 제목 패턴)을 직접 sitemap fetch와 저장소 파일 확인으로 검증했다(research.md). 다만 robots.txt/크롤링 제약, state 파일의 동시성 처리 방식 등 일부는 여전히 미검증(low confidence)이다. |
| Value vs. inaction | adequate | 자동화하지 않아도 헌법에 정의된 수동 워크플로우로 계속 운영 가능하지만, 미반영 게시글이 이미 쌓이고 있다는 구체적 증거로 방치 비용이 실재함이 확인됐다. |
| Feasibility / appetite | adequate | concept.md의 Option B(lastmod 기반 부분 자동화 + PR 검토)가 medium appetite로 구체적이며, research.md의 신규 리스크(데스크톱/모바일 URL 중복, 카테고리 페이지 혼입)도 같은 lastmod-diff 접근 안에서 다룰 수 있는 범위의 문제다. |
| Strategic fit | adequate | 저장소 헌법의 Development Workflow 원칙(설계가 필요한 작업은 Spec Kit으로 진행) 및 기존 `*_series.json` 스키마·파일명 규칙과 충돌 없이 부합한다. |
| Risk posture | adequate | research.md가 주요 리스크(제목 미제공에 따른 개별 페이지 fetch 필요, URL 중복, 카테고리 페이지 혼입, 제목 패턴의 불균일성, state 파일 동시성)를 구체적으로 식별했다. 아직 전부 완화되지는 않았지만, 막연한 미지수가 아니라 스펙 단계에서 다룰 수 있는 구체적 설계 과제로 좁혀졌다. |

## Verdict & Rationale

Evidence strength가 `weak`에서 `adequate`로 올라섰다 — research.md에서 sitemap을 직접 fetch해 핵심 가정(lastmod 존재, 제목 미제공, 파일명 규칙 일치, 기존 제목 패턴)을 검증했고, 문제가 방치되면 실제로 게시글이 누락된다는 사실까지 확인했다. `go` 기준(문제 타당성 adequate 이상, 증거 강도 adequate 이상, 추천 concept 존재)을 모두 충족한다. 다만 research.md가 새로 드러낸 리스크들(데스크톱/모바일 URL 중복 제거, 카테고리 페이지 필터링, state 파일 저장 방식과 동시성 처리, 제목 패턴이 어긋나는 예외 케이스 처리) 중 어느 것도 아직 설계로 확정되지 않았으므로, 이는 killer가 아니라 `/speckit-specify` 단계에서 반드시 명시적으로 다뤄야 할 요구사항으로 넘긴다.

## If needs-clarification

(해당 없음 — 이번 판정은 `go`)

## If go — Handoff to `/speckit-specify`

- **Problem**: 새 게시글이 올라올 때마다 사람이 sitemap 전체를 수동으로 확인하고 시리즈를 판단해 `*_series.json`을 갱신해야 하며, 이 방식은 게시글이 늘수록 반복 부담과 누락 위험이 커진다.
- **Chosen approach**: concept.md의 Option B — GitHub Actions가 주기적/수동 실행으로 kenel.tistory.com/sitemap.xml을 가져와, 저장소에 저장된 "마지막 동기화 시점" 상태와 비교해 `lastmod`가 그 이후로 갱신된 게시글만 골라내고, 해당 게시글 페이지에서 제목을 읽어 시리즈 매칭이 명확한 경우에만 자동으로 PR을 생성한다(애매한 경우는 사람이 판단하도록 표시).
- **In scope**:
  - sitemap.xml에서 `lastmod` 기준으로 마지막 동기화 이후 변경된 게시글만 골라내는 필터링
  - 데스크톱/모바일 URL 쌍의 중복 제거, 게시글이 아닌 카테고리 페이지 제외
  - 필터링된 게시글 페이지에서 제목을 읽어 기존 시리즈와 매칭
  - 기존 `keyword_filename_formatter.html`의 파일명 규칙(공백 제거, 소문자화, Windows 금지 문자 제거, `_series.json` 접미사)을 그대로 재사용한 파일명 결정
  - 매칭이 명확한 경우 해당 `*_series.json`의 `items`에 항목 추가(GitHub Actions → PR)
  - 마지막 동기화 시점을 기록하는 별도 state 파일
- **Out of scope** (concept.md의 Out of Scope 계승):
  - 완전 무인 자동 커밋(Option C 영역)
  - 기존 `*_series.json` 스키마 자체의 변경
  - 게시글 삭제·제목 수정에 대한 완전 자동 처리(최초 버전은 신규/변경 게시글의 추가·갱신 위주)
  - 시리즈 매칭이 애매한 경우의 완전 자동 판별(사람 검토로 남김)
- **Success metrics**:
  - 새 게시글이 사람의 수동 sitemap 전수 확인 없이 올바른 시리즈 json에 반영됨
  - 한 실행에서 상세 확인(개별 페이지 fetch)하는 게시글 수가 "마지막 동기화 이후 `lastmod`가 갱신된 게시글 수"에 근접(중복 URL 제외 후)
  - 동기화 후 시리즈 json에 누락·중복 항목 없음
- **Carried-forward open questions**:
  - [NEEDS CLARIFICATION: kenel.tistory.com sitemap/게시글 페이지에 로그인 없이 항상 접근 가능한지, robots.txt·rate limit 등 크롤링 제약]
  - [NEEDS CLARIFICATION: 데스크톱(`/418`)·모바일(`/m/418`) 중복 URL을 어떤 기준으로 하나로 취급할지]
  - [NEEDS CLARIFICATION: sitemap의 카테고리 페이지 등 비게시글 URL을 게시글과 구분할 URL 패턴 기준]
  - [NEEDS CLARIFICATION: `[태그] 시리즈명 - 부제` 패턴에서 벗어나는 제목을 만났을 때의 처리 방식]
  - [NEEDS CLARIFICATION: state 파일(마지막 동기화 시점)의 정확한 저장 위치·포맷, 그리고 워크플로우 동시 실행/PR 머지 타이밍에 따른 충돌 방지 방법]
  - [NEEDS CLARIFICATION: GitHub Actions 실행 트리거(cron 주기 또는 workflow_dispatch) 및 결과 반영 방식(자동 커밋 vs PR)의 최종 확정]
