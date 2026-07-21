# Idea Intake: 티스토리 sitemap 기반 시리즈 목차 JSON 자동화

- **Slug**: blog-sitemap-sync
- **Created**: 2026-07-21
- **Source**: pasted text
- **Type**: new-capability

## Idea (as captured)

> https://kenel.tistory.com/sitemap.xml 에서 공개된 게시글들을 추리고, 그 중에서 같은 시리즈인 것들을 모아 목차 형태로 json 파일 crud 자동화하는 프로그램. github actions를 통해 실행할거야

## Restated

티스토리 블로그(kenel.tistory.com)의 sitemap.xml에서 공개된 게시글 목록을 가져와 같은 시리즈에 속한 게시글들을 모으고, 이를 목차 형태의 json 파일로 생성·갱신·삭제(CRUD)하는 프로그램을 만들어 GitHub Actions로 자동 실행하자는 아이디어다.

## Origin & Context

- **Raised by**: 현재 세션 사용자 (이 저장소의 관리자로 보임)
- **Trigger**: [NEEDS CLARIFICATION: 이 아이디어를 지금 제안하게 된 계기 — 예: 기존에 `*_series.json` 파일들을 수동으로 추가/관리하던 작업을 자동화하려는 목적인지, 다른 계기가 있는지]

## First-Glance Unknowns

- [NEEDS CLARIFICATION: kenel.tistory.com이 사용자 본인이 소유/운영하는 블로그인지, 그리고 sitemap.xml 외에 인증이 필요한 API 접근이 필요한지]
- [NEEDS CLARIFICATION: "같은 시리즈"인지 판별하는 기준은 무엇인지 (제목 패턴, 티스토리 카테고리/태그, 별도 메타데이터 등)]
- [NEEDS CLARIFICATION: "공개된 게시글"의 정확한 의미 — 비공개/발행 예약/삭제된 글을 sitemap.xml만으로 걸러낼 수 있는지]
- [NEEDS CLARIFICATION: 생성되는 json 파일이 이 저장소의 기존 `*_series.json` 스키마(`listName`, `items[].title`, `items[].url`, 저장소 헌법에 정의된 발행 순서 규칙)를 그대로 따르는지]
- [NEEDS CLARIFICATION: 새로운 시리즈를 발견했을 때 새 파일을 자동 생성하는지, 아니면 기존 시리즈 파일 갱신만 담당하는지]
- [NEEDS CLARIFICATION: GitHub Actions의 실행 트리거 — 정기 cron 스케줄인지, 수동 실행(workflow_dispatch)인지, 다른 이벤트인지]
- [NEEDS CLARIFICATION: 자동화 결과를 저장소에 반영하는 방식 — 자동 커밋인지, PR 생성 후 사람이 검토하는 방식인지]
- [NEEDS CLARIFICATION: 기존 항목을 삭제하거나 수정해야 하는 경우(CRUD의 U/D)를 어떻게 감지하고 처리할지]
