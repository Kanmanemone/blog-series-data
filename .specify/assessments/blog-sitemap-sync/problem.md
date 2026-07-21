# Problem Definition: 티스토리 시리즈 목차 JSON 유지보수 자동화

- **Slug**: blog-sitemap-sync
- **Created**: 2026-07-21
- **Inputs used**: intake.md

## Problem Statement

현재 이 저장소의 `*_series.json` 목차 파일들은 새 게시글이 올라올 때마다 사람이 직접 sitemap을 확인하고, 게시글 제목을 보고 어느 시리즈에 속하는지 판단해 수동으로 파일을 갱신해야 한다. 게시글 수가 늘어날수록 sitemap의 모든 게시글을 매번 일일이 확인하는 방식은 시간이 오래 걸리고 반복적이며, 실수(누락·중복)로 이어지기 쉽다.

## Affected Users & Stakeholders

- **Users**: 이 저장소의 관리자(현재 세션 사용자) — kenel.tistory.com에 게시글을 올릴 때마다 `*_series.json`을 수동으로 갱신하는 반복 작업을 직접 수행함
- **Stakeholders**: [NEEDS CLARIFICATION: 이 저장소의 산출물(json, index.html 등)을 소비하는 다른 사람/시스템이 있는지 — 예를 들어 블로그 방문자에게 노출되는 목차 페이지가 있다면 그 페이지의 정확성에 이해관계가 있음]

## Goals

- 새 게시글이 올라올 때마다 사람이 sitemap 전체를 수동으로 확인하지 않아도 되게 한다
- 매 실행(예: GitHub Actions 정기 실행)마다 이미 동기화된 게시글까지 다시 처리하지 않고, 마지막 동기화 시점 이후 `lastmod`가 갱신된 게시글만 처리 대상으로 좁힌다 (불필요한 반복 작업 제거)
- 갱신된 `*_series.json`이 기존 스키마(저장소 헌법에 정의된 `listName`/`items[].title`/`items[].url`, 발행 순서)와 일치하도록 유지한다

## Non-Goals

- "같은 시리즈"를 판별하는 구체적 알고리즘이나 규칙 설계 (이는 해결 방안 단계에서 다룸)
- 실제 스크레이퍼/파서/워크플로우 구현 (스펙·계획 단계에서 다룸)
- 기존 `*_series.json` 스키마 자체의 변경

## Success Metrics

- 새 게시글이 사람의 수동 개입 없이 올바른 시리즈 json에 반영됨 (정성적, 현재 기준선: 100% 수동)
- 한 번의 동기화 실행에서 실제로 상세 확인(제목 등 조회)하는 게시글 수가 "마지막 동기화 이후 `lastmod`가 갱신된 게시글 수"에 근접함 — 즉 매 실행마다 sitemap 전체 게시글을 다시 확인하지 않음 (정량적, 현재 기준선: 매번 전체 게시글)
- 동기화 후 시리즈 json에 누락되거나 중복된 항목이 없음

## Cost of Inaction

관리자가 계속 저장소 헌법에 명시된 수동 워크플로우(파일을 직접 열어 `items` 배열 끝에 항목 추가)로 시리즈 json을 유지해야 한다. 게시글 수가 늘어날수록 sitemap을 매번 전체 확인하는 부담이 커지고, 시리즈 분류 실수나 갱신 누락 위험이 누적된다.

## Open Questions

- [NEEDS CLARIFICATION: "마지막 동기화 시점"을 어디에 저장할 것인지 — 커밋 히스토리에서 추론, 저장소 내 별도 state 파일, GitHub Actions 캐시/아티팩트 등]
- [NEEDS CLARIFICATION: sitemap.xml의 `lastmod` 값이 실제로 게시글 최초 발행일과 별개로 정확하게 갱신되는지 (예: 오탈자 수정 등 사소한 편집에도 `lastmod`가 바뀌어 불필요하게 재처리될 수 있는지)]
- [NEEDS CLARIFICATION: `lastmod`만으로는 "삭제된 게시글"이나 "시리즈에서 제외되어야 하는 게시글"을 감지할 수 없는데, 이런 CRUD의 Delete/일부 Update 케이스를 어떻게 다룰지]
- [NEEDS CLARIFICATION: "같은 시리즈"인지 판별하는 기준은 무엇인지 (제목 패턴, 티스토리 카테고리/태그, 별도 메타데이터 등)]
- [NEEDS CLARIFICATION: "공개된 게시글"의 정확한 의미 — 비공개/발행 예약/삭제된 글을 sitemap.xml만으로 걸러낼 수 있는지]
- [NEEDS CLARIFICATION: 새로운 시리즈를 발견했을 때 새 파일을 자동 생성하는지, 아니면 기존 시리즈 파일 갱신만 담당하는지]
- [NEEDS CLARIFICATION: GitHub Actions의 실행 트리거 — 정기 cron 스케줄인지, 수동 실행(workflow_dispatch)인지, 다른 이벤트인지]
- [NEEDS CLARIFICATION: 자동화 결과를 저장소에 반영하는 방식 — 자동 커밋인지, PR 생성 후 사람이 검토하는 방식인지]
