# Implementation Plan: HTML 엔티티 디코딩 누락 수정 (&rarr;)

**Branch**: `003-fix-rarr-entity-decode` | **Date**: 2026-08-21 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/003-fix-rarr-entity-decode/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

`decodeHtmlEntities()`(scripts/sync-tistory-series/index.js)가 다섯 개 기본 엔티티만 치환하도록
만들어져 있어 게시글 433 제목의 `&rarr;`가 디코딩되지 않고 navigation_series.json과
.github/sync-state.json에 그대로 저장됐다. 이번 계획은 (1) 목록에 `&rarr;` → `→` 매핑을
추가하고, (2) 이미 잘못 저장된 값을 직접 수정하고, (3) 저장소 전체 `*_series.json`에
미해석 엔티티가 없음을 검증하는 회귀 테스트를 추가하는 것으로 범위를 한정한다. 새 의존성,
새 빌드 단계, 새 스크립트 파일은 필요하지 않다.

**설계 갱신 1(사용자 피드백 반영, research.md 결정 3)**: 위 계획대로 `&rarr;`를 고친 뒤
speckit-converge 1차 실행에서 같은 클래스의 두 번째 사례(`&times;`)가 실제로 또 발견됐다.
"실측되는 대로 하나씩 등록"하는 방식은 등록되지 않은 이름이 나타날 때마다 재발한다는
사용자 지적에 따라, decodeHtmlEntities를 (a) 숫자 문자 참조는 표 없이 항상 디코딩하고
(b) 화이트리스트에 없는 이름 있는 엔티티가 남으면 그 게시글 처리 자체를 실패시켜 조용한
데이터 오염을 막는 구조로 다시 설계했다(FR-007, FR-008).

**설계 갱신 2(사용자 피드백 반영, research.md 결정 4)**: 설계 갱신 1의 6개짜리 손 관리
화이트리스트에 대해, 사용자가 "이름 있는 엔티티도 결국 표가 있어야 하는 거면, 왜 그
표를 직접 손으로 관리하냐"고 재차 지적했다. HTML 4.01/XHTML1이 1999년에 확정한 뒤 바뀐
적 없는 이름 있는 문자 참조 표 전체(252개)를 `htmlNamedEntities.js`로 내장해, 화이트리스트
자체를 없앴다. FR-008의 실패 감지는 이 표에도 없는 진짜 예외를 위한 최후 안전망으로
유지한다. "완전한 범용 HTML5 엔티티 디코더(수천 개, living standard)까지는 가지 않는다"는
원래 범위 제약은 여전히 유지한다.

## Technical Context

**Language/Version**: Node.js (repo 기존 스크립트와 동일, `node --test` 사용, 버전 고정 없음)

**Primary Dependencies**: 없음 (package.json에 명시된 대로 외부 npm 의존성 없음)

**Storage**: 저장소 루트 및 `.github/`의 정적 JSON 파일 (navigation_series.json, .github/sync-state.json)

**Testing**: Node.js 내장 `node:test` + `node:assert`, `npm test`로 scripts/sync-tistory-series/__tests__/*.test.js 전체 실행

**Target Platform**: GitHub Actions에서 실행되는 Node.js 스크립트 (`.github/workflows/tistory-series-sync*.yml`)

**Project Type**: 단일 Node.js 자동화 스크립트 모음 + 정적 JSON 데이터 저장소

**Performance Goals**: N/A (동기적 문자열 치환, 데이터 규모상 성능 목표 불필요)

**Constraints**: Constitution I(시리즈 데이터 스키마 — title/url/listName 외 키 추가 금지), 001 research.md §3 정책의 정신(완전한 범용 named-entity 표 직접 구현 금지)은 유지하되, research.md 결정 3에 따라 숫자 문자 참조는 범용 디코딩하고 이름 있는 엔티티는 화이트리스트+실패 감지로 처리

**Scale/Scope**: decodeHtmlEntities/extractTitle 수정(숫자 참조 범용화 + 미등록 이름 있는 엔티티 감지), 데이터 파일 2곳 값 수정, 신규 테스트 파일 1개 추가

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. 시리즈 데이터 스키마 일관성**: PASS — title 필드의 *값*만 수정하며 `listName`/`items[].title`/`items[].url` 구조나 다른 파일과의 스키마 일관성에는 영향 없음.
- **II. 주석은 한국어로, 구체적으로**: PASS — decodeHtmlEntities 수정 시 기존 주석 스타일(구체적 사실 기술)을 유지.
- **III. 독립형 바닐라 웹 유틸리티**: N/A — 이 기능은 `keyword_filename_formatter.html` 같은 브라우저 도구가 아니라 Node.js 동기화 스크립트를 다룬다.
- **IV. 콘텐츠는 한국어 우선**: PASS — 수정 후 title 값("→" 포함)은 여전히 한국어 제목 문자열이며 콘텐츠 언어에 영향 없음.

Gate 위반 없음 — Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-rarr-entity-decode/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

`contracts/`는 생략한다 — 이 기능은 외부에 노출하는 API/CLI 인터페이스를 추가하거나
변경하지 않는, 내부 데이터 보정 + 순수 함수 확장이다.

### Source Code (repository root)

```text
scripts/sync-tistory-series/
├── index.js                          # decodeHtmlEntities(숫자 참조 + 표준 표 통합 디코딩),
│                                      # hasUnresolvedNamedEntity, extractTitle(실패 감지)
├── htmlNamedEntities.js              # 신규: HTML 4.01/XHTML1 이름 있는 문자 참조 표 전체(252개)
└── __tests__/
    ├── index.test.js                 # 표준 표 기반 디코딩, 숫자 참조 일반화, extractTitle 실패 감지 케이스
    └── seriesDataIntegrity.test.js   # 신규: 모든 *_series.json title에 미해석 엔티티 없음을 검증

navigation_series.json                # title 값 직접 수정
.github/sync-state.json               # processedPosts[].title 값 직접 수정
package.json                          # scripts.test에 신규 테스트 파일 추가
```

**Structure Decision**: 기존 `scripts/sync-tistory-series/` 단일 프로젝트 구조를 그대로
따른다. 새 모듈이나 디렉터리를 만들지 않고, 기존 `index.js`와 `__tests__/`에 각각 수정·추가만
한다. 데이터 파일 수정은 스크립트 실행이 아니라 이번 구현 단계에서 직접 값을 고치는 일회성
보정이다(001/002가 만든 자동 동기화 파이프라인 자체를 바꾸는 것이 아님).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Constitution Check에서 위반 사항 없음 — 이 섹션은 해당 없음.
