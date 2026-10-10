# Implementation Plan: 수정된 게시글 제목이 목차에 반영되지 않는 문제 수정

**Branch**: `004-fix-edited-title-sync` | **Date**: 2026-10-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-fix-edited-title-sync/spec.md`

## Summary

수정된 게시글이 001의 신규 게시글 흐름에 먼저 잡혀 처리 이력(`sync-state.json`)을 덮어쓰는 바람에 002 드리프트 감지가 제목 변경을 영구히 놓치는 버그를 고친다. 접근은 두 가지 최소 변경이다: (1) 신규 게시글 흐름 후보에서 "처리 이력이 있고 이미 목차에 반영된" 게시글을 빼서 드리프트 감지 단계가 전담하게 하고, (2) 신규 게시글 흐름이 목차에 항목을 추가하거나 파일을 만들 때 배치 결정(`series-assignments.json`)에도 같은 내용을 반영해 재조정이 그 항목을 지우지 않게 한다. 이미 어긋난 3건은 일회성으로 복구하고, 원인 재현 회귀 테스트와 저장소 데이터 무결성 테스트를 추가한다.

## Technical Context

**Language/Version**: Node.js 24 (저장소 `.tools/node-v24.18.0-win-x64`, GitHub Actions `ubuntu-latest`의 기본 Node)

**Primary Dependencies**: 없음(Node 내장 모듈만 사용, 001·002 research.md 결정 유지)

**Storage**: 저장소 내 JSON 파일 — `.github/sync-state.json`(처리 이력), `.github/series-assignments.json`(배치 결정), 루트 `*_series.json`(목차)

**Testing**: `node --test` (`npm test`, package.json에 테스트 파일을 명시 나열)

**Target Platform**: GitHub Actions 예약 실행(6시간 주기) + 로컬 Windows 개발 환경

**Project Type**: 단일 CLI 스크립트(`scripts/sync-tistory-series/index.js`)

**Performance Goals**: 실행당 추가 HTTP 요청 0건(SC-004) — 후보에서 빼는 게시글은 드리프트 단계에서 한 번만 조회된다.

**Constraints**: 데이터 스키마 변경 금지(Constitution I), 외부 의존성 추가 금지, 기존 커밋 메시지 형식·커트라인 규칙 유지

**Scale/Scope**: 처리 이력 약 450건, 목차 파일 30개. 코드 변경은 `index.js`와 `seriesAssignments.js` 두 파일에 한정.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 시리즈 데이터 스키마 일관성 | ✅ | `*_series.json`의 `{listName, items[{title,url}]}` 구조 불변. 복구는 `title` 값만 바꾼다. 항목 순서도 바꾸지 않는다. |
| II. 한국어·구체적 주석 | ✅ | 새 분기·헬퍼에 "어떤 조건의 게시글을 왜 빼는지"를 구체적으로 적는다. |
| III. 독립형 바닐라 웹 유틸리티 | N/A | 웹 도구 변경 없음. 의존성 추가 없음. |
| IV. 콘텐츠 한국어 우선 | ✅ | 복구되는 제목은 블로그의 실제 제목 그대로. |
| Development Workflow | ✅ | 여러 파일에 걸친 버그 수정이므로 Spec Kit 절차로 진행. |

Post-design 재확인: 위 판정 그대로 유지(설계가 새 파일·스키마를 도입하지 않음). 위반 없음 → Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/004-fix-edited-title-sync/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

`contracts/`는 만들지 않는다 — 외부에 노출하는 인터페이스가 없는 내부 동기화 스크립트다.

### Source Code (repository root)

```text
scripts/sync-tistory-series/
├── index.js                     # 변경: 후보 제외(excludeAlreadyListed), 배치 결정 동기화, assignments 1회 읽기·쓰기
├── seriesAssignments.js         # 변경: addPostsToGroup 헬퍼 추가
└── __tests__/
    ├── index.test.js            # 추가: excludeAlreadyListed 단위 테스트
    ├── seriesAssignments.test.js# 추가: addPostsToGroup 단위 테스트
    ├── run.test.js              # 신규: run() 통합 회귀 테스트(임시 디렉터리 + fetch 대체)
    └── seriesDataIntegrity.test.js # 추가: 처리 이력↔목차 제목, 배치 결정↔목차 구성 일치

.github/series-assignments.json  # 데이터 복구(swemo 435 추가, 212·412·435 제목)
swemo_series.json, 그래프_series.json, 2026buildwithaihands-oncampus_series.json  # 제목 복구
package.json                     # test 스크립트에 run.test.js 추가
```

**Structure Decision**: 기존 `scripts/sync-tistory-series/` 단일 스크립트 구조를 그대로 쓴다. 새 모듈 파일은 만들지 않고, 통합 테스트 파일 하나만 추가한다.

## Complexity Tracking

해당 없음.
