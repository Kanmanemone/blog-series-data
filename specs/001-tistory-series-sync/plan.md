# Implementation Plan: 티스토리 시리즈 목차 JSON 동기화 자동화

**Branch**: `001-tistory-series-sync` | **Date**: 2026-07-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-tistory-series-sync/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

GitHub Actions(예약 실행 + 수동 실행)에서 의존성 없는 Node.js 스크립트를 실행해
`kenel.tistory.com/sitemap.xml`을 조회하고, 저장된 커트라인 이후 `lastmod`가 갱신된
게시글만 골라 제목을 확인한다. 제목에서 추출한 원시 시리즈명 → seriesId로 기존
`<seriesId>_series.json`과 매칭되면 항목을 추가하고, 매칭되는 파일이 없고 같은 seriesId를
공유하는 공개 게시글이 2개 이상이면 새 파일을 만든다. 스크립트가 워킹 트리 파일을 갱신한
직후, 같은 워크플로우 단계에서 `git commit`·`git push`로 저장소 기본 브랜치에 바로 반영한다
(병합 전 검토 단계 없이 즉시 반영, 문제가 있으면 관리자가 `git revert`로 되돌림). 커트라인·
게시글별 처리 기록은 `.github/sync-state.json`에 저장하고, 이 역시 같은 커밋으로 즉시
다음 실행에 반영된다.

## Technical Context

**Language/Version**: Node.js (GitHub Actions `ubuntu-latest` 기본 제공 버전, 내장 `fetch` 사용). 외부 npm 의존성 없음 — [research.md](research.md) §1

**Primary Dependencies**: 없음(스크립트 자체는 Node 내장 모듈만 사용). 워크플로우 수준에서도 별도 GitHub Action 없이 `git commit`/`git push`만 사용 — [research.md](research.md) §6

**Storage**: 파일 기반. 시리즈 데이터는 저장소 루트 `*_series.json`(기존 스키마 유지), 동기화 상태는 `.github/sync-state.json`(신규) — [research.md](research.md) §7, [data-model.md](data-model.md)

**Testing**: Node.js 내장 테스트 러너(`node --test`), 별도 프레임워크 의존성 없음 — [research.md](research.md) §8

**Target Platform**: GitHub Actions `ubuntu-latest` 러너 (cron 스케줄 + `workflow_dispatch`)

**Project Type**: single — 저장소 루트에 소스/빌드 구조가 없는 데이터 저장소이므로, 자동화 스크립트를 위한 최소 디렉터리(`scripts/`, `.github/workflows/`)만 신규 추가하는 단일 구조

**Performance Goals**: 명시적 목표 없음. 한 번의 실행에서 실제로 처리하는 게시글 수는 마지막 커트라인(직전 실행 후 최대 실행 주기) 이후 변경분으로 한정되어 소규모(실측: 전체 게시글 654개 URL 중 최근 변경분만)이므로 별도 최적화가 필요하지 않음

**Constraints**: 모든 시각 계산·기록은 실행 환경 기본 시간대와 무관하게 KST(+09:00) 고정(FR-002) — [research.md](research.md) §5. 인증 없이 공개 페이지만 접근(Assumptions)

**Scale/Scope**: 시리즈 파일 약 20개, 게시글 URL 약 327개(모바일 포함 654개) 수준의 기존 저장소 규모 — 실측(2026-07-21, `curl`로 sitemap 직접 조회)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 게이트 판정 | 근거 |
|---|---|---|
| I. 시리즈 데이터 스키마 일관성 | PASS | data-model.md의 Series File 스키마가 `listName`/`items[].title`/`items[].url` 외 필드를 추가하지 않음(FR-017) |
| II. 주석은 한국어로, 구체적으로 | PASS (구현 단계에 적용) | 이후 `/speckit-tasks`·`/speckit-implement`에서 작성할 스크립트 주석은 한국어로, 정규식이 제거하는 문자·정규화 규칙 출처처럼 구체적으로 작성 |
| III. 독립형 바닐라 웹 유틸리티 | PASS (해당 범위 밖이지만 취지 준수) | 이 원칙은 브라우저에서 여는 도구를 대상으로 하나, 신규 스크립트도 같은 취지로 빌드 도구·npm 의존성 없이 작성(research.md §1) |
| IV. 콘텐츠는 한국어 우선 | PASS | PR로 생성되는 `listName`/`title`은 게시글 원문(대부분 한국어)을 그대로 사용하며 가공하지 않음 |
| Repository Constraints(파일명 규칙, 기존 시리즈에는 새 파일 생성 금지) | PASS | seriesId 산출에 `keyword_filename_formatter.html`과 동일한 정규화 로직 재사용(research.md §4); 기존 시리즈 갱신은 파일 생성 없이 `items`만 추가(FR-011) |
| Development Workflow(스키마 변경/여러 파일 작업은 Spec Kit 경유) | PASS | 이 기능은 신규 워크플로우·스크립트·상태 파일을 추가하는 여러 파일 작업이라 Spec Kit 절차(`/speckit-specify` → `/speckit-plan` → ...)를 따르고 있음 |

위반 사항 없음 → Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/001-tistory-series-sync/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

`contracts/`는 생성하지 않는다. 이 기능은 외부에 노출하는 API/CLI 인터페이스가 없는
내부 CI 자동화이며, 유일한 "계약"인 `*_series.json`·`.github/sync-state.json` 스키마는
data-model.md에서 이미 다룬다.

### Source Code (repository root)

```text
.github/
├── workflows/
│   └── tistory-series-sync.yml   # cron + workflow_dispatch 트리거, sync 스크립트 실행 후 git commit/push로 기본 브랜치에 직접 반영
└── sync-state.json               # Sync State (신규, 이 기능이 처음 생성)

scripts/
└── sync-tistory-series/
    ├── index.js                  # 진입점: sitemap 조회 → 커트라인 필터 → 제목 조회 → 매칭/생성 판정 → 파일 갱신
    ├── sitemap.js                # sitemap.xml fetch·파싱, 게시글 URL 판별(FR-006), 데스크톱/모바일 병합(FR-005)
    ├── seriesName.js             # 원시 시리즈명 추출(FR-008), seriesId 정규화(FR-009)
    ├── seriesFiles.js            # 저장소 루트 *_series.json 조회·매칭·갱신·신규 생성(FR-010~013, FR-017)
    ├── syncState.js              # .github/sync-state.json 읽기/쓰기, KST 포맷팅(FR-002, FR-003, FR-016)
    └── __tests__/
        ├── sitemap.test.js
        ├── seriesName.test.js
        ├── seriesFiles.test.js
        └── syncState.test.js

# 기존 파일(변경 없음, 참고용)
keyword_filename_formatter.html   # seriesId 정규화 로직의 출처(research.md §4)
*_series.json                     # 갱신·생성 대상 데이터 파일(저장소 루트, 기존 위치 유지)
```

**Structure Decision**: 이 저장소는 빌드 구조가 없는 정적 데이터 저장소이므로(Constitution
III), 새 소스는 최소 침습적으로 `scripts/sync-tistory-series/`(스크립트 본체)와
`.github/workflows/`(트리거)로만 추가한다. `src/`, `tests/` 같은 범용 옵션 구조는 이
저장소 관행과 맞지 않아 사용하지 않는다. 테스트는 Node 내장 러너 관행에 따라 소스 옆
`__tests__/`에 둔다.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

해당 없음 — Constitution Check 전 항목 PASS.
