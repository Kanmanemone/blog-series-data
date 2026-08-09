# Implementation Plan: 게시글 드리프트(제목 변경·삭제) 감지 및 갱신

**Branch**: `002-post-drift-detection` | **Date**: 2026-08-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-post-drift-detection/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

001-tistory-series-sync가 처음 발견한 시점의 제목만 기록하고 다시 확인하지 않던 간극을
메운다. `.github/sync-state.json`의 `processedPosts`를 확장해 제목 전체와 sitemap
`lastMod`를 보유하는 변경 감지 계층으로 삼고, 이번 실행에서 실제로 바뀐 게시글에 대해서만
신규 `.github/series-assignments.json`(배치 결정 — 게시글의 현재 시리즈 소속)을 부분
갱신한 뒤, 매 실행마다 배치 결정 전체와 실제 `*_series.json` 구조 전체를 비교해 다른
부분만 고치는 재조정을 수행한다. 제목 갱신·재분류(파일 간 이동, 필요 시 파일 생성·삭제)·
삭제 확정(항목 제거)이 모두 이 재조정 원칙 하나로 통합되며, 001과 동일하게 무검토 자동
push로 반영되고 실제 변경 내역은 커밋 메시지에 요약된다(research.md §6).

## Technical Context

**Language/Version**: Node.js (GitHub Actions `ubuntu-latest` 기본 제공 버전, 내장
`fetch` 사용). 외부 npm 의존성 없음 — 001과 동일(specs/001-tistory-series-sync/research.md §1)

**Primary Dependencies**: 없음. 001과 동일하게 Node 내장 모듈만 사용하며 워크플로우
수준에서도 별도 GitHub Action을 추가하지 않는다

**Storage**: 파일 기반, 001을 확장. `.github/sync-state.json`(`processedPosts` 필드
확장 — `rawSeriesName` 대신 `title`, 신규 `lastMod`·`deletedAt`), 신규
`.github/series-assignments.json`(배치 결정 레코드), 기존 `*_series.json`(반영
대상, 스키마 불변) — [data-model.md](data-model.md)

**Testing**: Node.js 내장 테스트 러너(`node --test`), 001과 동일

**Target Platform**: GitHub Actions `ubuntu-latest` 러너, 001의 기존 워크플로우
(`tistory-series-sync.yml`) 안에서 이어서 실행(FR-014, 별도 워크플로우 분리 없음)

**Project Type**: single — 001이 이미 만든 `scripts/sync-tistory-series/` 구조를 확장

**Performance Goals**: SC-004 — sitemap 조회는 실행당 1회 공유, 게시글별 제목 재조회는
lastMod diff로 좁혀진 후보에만 수행(추적 중인 전체 게시글 수에 비례하지 않음)

**Constraints**: 001과 동일하게 모든 시각은 KST(+09:00) 고정, 무인증 공개 페이지만
접근. 재조정은 배치 결정 전체 vs 실제 파일 전체를 매 실행마다 비교하되 다른 부분만
쓴다(SC-006). 커밋 메시지는 실행마다 실제 변경 내용을 반영해야 한다(FR-012, SC-007)

**Scale/Scope**: 001 실측 규모 계승 — `processedPosts` 331건, 그중 실제로
`*_series.json`에 반영된(이 기능의 대상) 약 201건, 시리즈 파일 26개
(.specify/assessments/post-drift-detection/research.md에서 재확인한 수치)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 게이트 판정 | 근거 |
|---|---|---|
| I. 시리즈 데이터 스키마 일관성 | PASS | `*_series.json`은 여전히 `listName`/`items[].title`/`items[].url`만 사용한다(data-model.md "Series File"). 신규 `.github/series-assignments.json`은 자동화 내부 상태이지 시리즈 데이터가 아니므로 이 원칙의 적용 대상이 아니다(research.md §1) |
| II. 주석은 한국어로, 구체적으로 | PASS (구현 단계에 적용) | `/speckit-tasks`·`/speckit-implement`에서 작성할 `seriesAssignments.js`·`reconcile.js` 주석은 한국어로, 임계값 판정 조건·재조정 diff 규칙처럼 구체적인 사실을 적는다 |
| III. 독립형 바닐라 웹 유틸리티 | N/A | 이 기능은 브라우저에서 여는 도구가 아닌 CI 자동화 확장이다(001과 동일한 예외) |
| IV. 콘텐츠는 한국어 우선 | PASS | 재조정으로 반영되는 `title`은 게시글 원문(대부분 한국어)을 그대로 사용하며 가공하지 않는다 |
| Repository Constraints (파일명 규칙, 기존 시리즈에는 항목 추가만) | PASS (조건부 — 아래 참고) | 파일명 규칙(seriesId 정규화)은 001의 기존 로직을 그대로 재사용한다. 다만 "기존 시리즈에는 items 끝에 추가만, 새 파일 생성 금지"라는 문구는 001 당시 "추가"만 상정했던 것으로, 이 기능이 도입하는 "항목 제거"·"파일 삭제"라는 새로운 종류의 조작까지 다루지는 않는다. 헌법을 위반하는 것은 아니지만(스키마 자체는 불변), 헌법이 미처 예상하지 못한 파괴적 조작을 이번 기능이 새로 도입한다는 점은 spec.md Clarifications에서 이미 사용자 확인을 거쳤음을 밝혀 둔다 |
| Development Workflow (스키마 변경/여러 파일 작업은 Spec Kit 경유) | PASS | 여러 파일(스크립트 3개 확장, 신규 모듈 2개, 워크플로우 커밋 스텝)에 걸친 설계 변경이라 Spec Kit 절차를 따르고 있다 |

위반 사항 없음 → Complexity Tracking 불필요.

## Post-Design Constitution Check

*GATE: Phase 1 설계(data-model.md, quickstart.md) 완료 후 재확인.*

Phase 0/1 설계 결과가 위 판정을 바꾸지 않는다 — 신규 파일(`series-assignments.json`)은
여전히 `*_series.json` 스키마 밖에 있고, 재조정 로직(research.md §4)도 배치 결정에
없는 seriesId의 기존 파일은 건드리지 않도록 설계되어 001의 "새 시리즈에는 새 파일만"
관행과 충돌하지 않는다. 재확인 결과: 위반 없음, 변경 없음.

## Project Structure

### Documentation (this feature)

```text
specs/002-post-drift-detection/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

`contracts/`는 만들지 않는다. 001과 동일하게 이 기능도 외부에 노출하는 API/CLI
인터페이스가 없는 내부 CI 자동화이며, 유일한 "계약"인 `*_series.json`·
`.github/sync-state.json`·`.github/series-assignments.json` 스키마는 이미
data-model.md에서 다룬다.

### Source Code (repository root)

```text
.github/
├── workflows/
│   └── tistory-series-sync.yml   # 확장: 커밋 스텝이 스크립트가 만든 CUD 요약을 받아 동적 커밋 메시지를 구성(FR-012)
├── sync-state.json               # 확장: processedPosts에 title(rawSeriesName 대체)·lastMod·deletedAt 추가
└── series-assignments.json       # 신규: 배치 결정 레코드(seriesId → listName·posts)

scripts/
└── sync-tistory-series/
    ├── index.js                  # 확장: 001의 기존 흐름 뒤에 재확인 후보 선별 → 배치 결정 갱신 → 재조정 → CUD 요약 생성을 이어붙임
    ├── sitemap.js                 # 변경 없음(lastmod 파싱은 이미 제공)
    ├── seriesName.js               # 변경 없음(extractRawSeriesName/toSeriesId 재사용)
    ├── seriesFiles.js             # 변경 없음 — collectSiblingCandidates는 001의 신규 시리즈 생성 흐름이 계속 사용하므로 유지(research.md §5); listSeriesFiles·writeSeriesFile은 reconcile.js가 재사용
    ├── syncState.js               # 확장: processedPosts 필드 확장, 재확인 후보 판정·삭제 확정 헬퍼 추가
    ├── seriesAssignments.js       # 신규: series-assignments.json 읽기/쓰기, 배치 결정 부분 갱신(research.md §3)
    ├── reconcile.js               # 신규: 배치 결정 vs 실제 *_series.json 비교·반영, CUD 요약 생성(research.md §4)
    └── __tests__/
        ├── sitemap.test.js
        ├── seriesName.test.js
        ├── seriesFiles.test.js
        ├── syncState.test.js
        ├── seriesAssignments.test.js   # 신규
        └── reconcile.test.js            # 신규

# 기존 파일(변경 없음, 참고용)
keyword_filename_formatter.html   # seriesId 정규화 로직의 원 출처
*_series.json                     # 재조정 대상 데이터 파일(저장소 루트, 기존 위치 유지)
```

**Structure Decision**: 001이 이미 `scripts/sync-tistory-series/`와
`.github/workflows/`로 최소 침습적 구조를 확립해 두었으므로, 이 기능도 같은
디렉터리 안에서 확장한다. 새 책임(배치 결정 관리, 재조정)은 001의 기존 모듈에
욱여넣지 않고 `seriesAssignments.js`·`reconcile.js` 두 모듈로 분리해, 001이
이미 검증된 동작(신규 시리즈 생성, append-only 매칭)에 대한 회귀 위험을 줄인다.
`src/`, `tests/` 같은 범용 옵션 구조는 이 저장소 관행과 맞지 않아 사용하지 않는다.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

해당 없음 — Constitution Check 전 항목 PASS(Repository Constraints는 조건부 PASS이나
스키마 위반이 아니므로 정당화가 필요한 위반으로 보지 않는다).
