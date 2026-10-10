# Implementation Plan: 배치 결정 파일 제거 — 목차 파일을 유일한 기준으로

**Branch**: `005-drop-series-assignments` | **Date**: 2026-10-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-drop-series-assignments/spec.md`

## Summary

`.github/series-assignments.json`(배치 결정)과 그것으로 목차 파일을 통째로 다시 쓰는 `reconcile.js`를 없애고, 동기화가 `*_series.json`을 직접 최소 수정하도록 바꾼다. 목차 파일 편집은 네 가지 연산만 쓴다: 묶음 끝에 붙이기(묶음 안에서만 공개 시각 순), 제목 그 자리 바꾸기, 항목 빼기, 항목이 1개 이하가 된 파일 지우기. 기존 항목 순서는 어떤 경로로도 바뀌지 않는다. 002의 재분류 판단(2개 이상 규칙, 배치 단위 판단)과 커밋 요약 8개 카테고리는 그대로 옮긴다. 새 목차 생성 정렬을 lastmod에서 공개 시각으로 바꾸고, 처리 이력이 없는 목차 항목의 제목 변경도 그 자리에서 반영한다.

## Technical Context

**Language/Version**: Node.js 24 (로컬 `.tools/node-v24.18.0-win-x64`, GitHub Actions `ubuntu-latest`)

**Primary Dependencies**: 없음(Node 내장 모듈만)

**Storage**: `.github/sync-state.json`(처리 이력, 변경 없음), 루트 `*_series.json`(목차, 유일한 기준). `.github/series-assignments.json`은 삭제.

**Testing**: `node --test` (`npm test`, package.json에 테스트 파일 명시 나열)

**Target Platform**: GitHub Actions 예약 실행(6시간 주기) + 로컬 Windows

**Project Type**: 단일 CLI 스크립트(`scripts/sync-tistory-series/index.js`)

**Performance Goals**: 실행당 추가 HTTP 요청 0건(SC-005)

**Constraints**: 목차 스키마 변경 금지(Constitution I), 외부 의존성 금지, 커밋 메시지 형식·커트라인·드리프트 후보 선정 규칙 유지

**Scale/Scope**: 처리 이력 약 450건, 목차 파일 30개. 코드 삭제 2개 모듈(`seriesAssignments.js`, `reconcile.js`) + 테스트 2개, 수정 `seriesFiles.js`·`index.js`·워크플로우 2개.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 원칙 | 판정 | 근거 |
|---|---|---|
| I. 시리즈 데이터 스키마 일관성 (v1.1.0) | ✅ | 스키마(`listName`, `items[].title/url`) 그대로. 순서 규칙 "기존 순서 불변, 끝에 붙이기, 함께 붙일 때만 공개 시각 순, 수동 순서 유지"가 이 기능의 핵심 요구(FR-002, FR-003)와 같다. |
| II. 구체적인 한국어 주석 | ✅ | 새 함수·분기에 "무엇을 왜"를 구체적으로 적는다(예: 파일이 지워지면 제거 건수 대신 삭제로 센다). |
| III. 독립형 바닐라 웹 유틸리티 | N/A | 웹 도구 변경 없음. |
| IV. 한국어 우선 콘텐츠 | ✅ | 콘텐츠 변경 없음. 로그 메시지 한국어 유지. |
| Repository Constraints | ✅ | "기존 시리즈에 게시글을 추가할 때는 items 끝에 추가" — 봇 동작과 수동 추가 모두 이 규칙과 일치. |
| Development Workflow | ✅ | 여러 파일·설계 변경이라 Spec Kit 절차로 진행. |

**Post-design re-check**: 위 판정 유지. 위반 없음 → Complexity Tracking 불필요.

## Project Structure

### Documentation (this feature)

```text
specs/005-drop-series-assignments/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code (repository root)

```text
scripts/sync-tistory-series/
├── index.js                 # 수정: 배치 결정·reconcile 제거, 목차 파일 직접 편집으로 001/002 단계 재작성
├── seriesFiles.js           # 수정: findSeriesIdForUrl 이전, appendBatch/retitleItem/removeItem/orderByPublishedAt 추가,
│                            #       createSeriesFile 공개 시각 정렬, collectSiblingCandidates가 publishedAt 전달
├── seriesAssignments.js     # 삭제
├── reconcile.js             # 삭제
└── __tests__/
    ├── seriesFiles.test.js          # 수정: 새 편집 함수·정렬 테스트, findSeriesIdForUrl 테스트 이전
    ├── run.test.js                  # 수정: 배치 결정 제거, US1~US4 통합 시나리오 추가
    ├── seriesDataIntegrity.test.js  # 수정: INV-2(배치 결정 비교) 제거, 중복 URL 검사 추가
    ├── seriesAssignments.test.js    # 삭제
    └── reconcile.test.js            # 삭제
.github/
├── series-assignments.json  # 삭제
└── workflows/tistory-series-sync.yml, tistory-series-sync-manual.yml  # series-assignments git add 3줄 제거
package.json                 # 테스트 목록에서 삭제된 두 파일 제거
```

**Structure Decision**: 단일 스크립트 구조 유지. 목차 편집 연산은 이미 목차 파일 입출력을 맡는 `seriesFiles.js`에 모은다(새 모듈을 만들지 않음).

## Complexity Tracking

해당 없음.
