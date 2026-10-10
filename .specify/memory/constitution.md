<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Rationale for 1.1.0 (MINOR): Principle I의 items 순서 규칙을 "발행 순서로 정렬"에서
  "목차 파일의 현재 순서가 정답이며, 자동 동기화는 기존 순서를 바꾸지 않고 끝에 붙인다"로
  재정의했다. 기존 *_series.json은 모두 새 규칙을 그대로 만족하고(기존 항목 순서를 바꿀
  필요 없음) 원칙을 제거하지 않았으므로 하위 호환 확장으로 본다. 배경:
  005-drop-series-assignments에서 별도 배치 결정 파일(.github/series-assignments.json)을
  없애고 *_series.json을 유일한 진실 공급원으로 삼기로 했다.
- Modified principles: I. 시리즈 데이터 스키마 일관성 — items 순서 규칙 개정(제목 유지)
- Added sections: none
- Removed sections: none
- Templates requiring updates:
  - .specify/templates/plan-template.md — ✅ no change needed (Constitution Check는
    런타임에 이 파일을 읽음)
  - .specify/templates/spec-template.md — ✅ no change needed
  - .specify/templates/tasks-template.md — ✅ no change needed
  - .claude/skills/speckit-*/SKILL.md — ✅ no principle-specific text
- Follow-up TODOs: none
-->

# blog-series-data Constitution

## Core Principles

### I. 시리즈 데이터 스키마 일관성 (Series Data Schema Consistency)

저장소 루트의 모든 `*_series.json` 파일은 아래 구조를 그대로 따른다:

```json
{
  "listName": "시리즈 이름",
  "items": [
    { "title": "게시글 제목", "url": "https://..." }
  ]
}
```

- `listName`과 `items[].title`, `items[].url`은 필수이며 다른 키를 추가하지 않는다.
- `items`의 순서는 목차 파일에 적힌 현재 순서가 정답이다. 자동 동기화는 기존 항목의 순서를
  바꾸지 않고 새 항목을 배열 끝에 붙인다. 한 번의 실행에서 같은 파일에 여러 항목을 붙일
  때만 그 항목들끼리 공개 시각(오래된 것 → 최신 것) 순으로 붙인다.
- 관리자가 `*_series.json`에서 직접 바꾼 항목 순서는 이후 자동 동기화가 그대로 유지한다.
- 기존 필드의 이름이나 구조를 바꿔야 한다면, 그 변경을 소비하는 모든 `*_series.json` 파일과
  `index.html`을 같은 커밋 안에서 함께 수정한다.

**근거**: 이 저장소는 정적 JSON 데이터 모음이다. 파일마다 구조가 달라지면 이 데이터를 읽는
페이지나 도구가 특정 파일에서만 조용히 깨진다.

### II. 주석은 한국어로, 구체적으로 작성 (Concrete Korean Comments)

- 코드 주석은 한국어로 쓴다.
- "효율적으로 처리한다", "우아하게 동작한다"처럼 실제로 무엇을 하는지 알려주지 않는 표현은
  쓰지 않는다. 대신 정규식이 제거하는 문자, 실패 시 대체되는 API, 특정 분기가 처리하는
  정확한 조건처럼 구체적인 사실을 적는다.
- 코드만 읽어도 알 수 있는 내용(변수 선언, 단순 대입 등)에는 주석을 달지 않는다.

**근거**: 이 저장소를 사용하는 사람이 직접 요구한 규칙이다. 모호한 주석은 나중에 코드를 다시
읽어야만 실제 동작을 확인할 수 있게 만들어, 주석이 없는 것과 다를 바 없다.

### III. 독립형 바닐라 웹 유틸리티 (Standalone Vanilla Web Tools)

`keyword_filename_formatter.html`처럼 저장소에 추가하는 도구는 다음을 지킨다:

- 빌드 단계(번들러, 트랜스파일러) 없이 동작하는 순수 HTML/CSS/JS 단일 파일로 작성한다.
- `npm install` 같은 별도 설치 과정 없이, 파일을 브라우저에서 직접 열기만 하면 동작해야 한다.
- 외부 CDN 스크립트나 프레임워크(React, Vue 등)를 추가하지 않는다.

**근거**: 이 저장소에는 빌드 파이프라인이나 패키지 매니저가 없다. 도구 하나를 위해 의존성을
추가하면, 그 의존성의 버전 관리와 보안 패치까지 계속 떠안아야 한다.

### IV. 콘텐츠는 한국어 우선 (Korean-First Content)

- `*_series.json`의 `title`, `listName`과 웹 도구의 사용자 노출 텍스트(레이블, 버튼,
  안내 메시지)는 한국어로 작성한다.
- 코드 식별자(변수명, 함수명, 파일명)는 기존 관행대로 영어를 유지한다.

**근거**: 이 저장소가 다루는 콘텐츠(블로그 게시글 목록)와 실제 사용자는 한국어 화자다.
콘텐츠와 코드의 언어를 분리해야 코드 검색성과 콘텐츠 가독성을 동시에 지킬 수 있다.

## Repository Constraints

- 새 시리즈 데이터 파일은 저장소 루트에 `<키워드>_series.json` 이름으로 추가한다. 파일명은
  `keyword_filename_formatter.html`이 생성하는 값(공백 제거, 소문자 변환, Windows 금지
  문자 제거, `_series.json` 접미사)을 그대로 사용하고 손으로 바꾸지 않는다.
- 기존 시리즈에 게시글을 추가할 때는 해당 `*_series.json`의 `items` 배열 끝에 항목을
  추가한다. 새 파일을 만들지 않는다.

## Development Workflow

- 새 도구 추가, 데이터 스키마 변경처럼 여러 파일에 걸치거나 설계가 필요한 작업은
  `/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement` 순서로
  진행한다.
- 단순히 `*_series.json`에 게시글 항목 하나를 추가하는 작업처럼 스키마 변경이 없는 반복
  작업은 Spec Kit 워크플로우 없이 바로 커밋해도 된다.

## Governance

- 이 헌법은 저장소 내 다른 관행이나 문서보다 우선한다.
- 원칙을 추가·삭제·수정하는 개정(amendment)은 `/speckit-constitution`으로만 수행하고,
  적용 시 아래 규칙에 따라 버전을 올린다:
  - MAJOR: 기존 원칙을 제거하거나 하위 호환되지 않게 재정의할 때
  - MINOR: 원칙이나 섹션을 새로 추가하거나 내용을 크게 확장할 때
  - PATCH: 표현을 다듬거나 오타를 고치는 등 의미 변화가 없는 수정
- 개정할 때마다 이 파일 상단에 Sync Impact Report를 남기고, 영향받는
  `.specify/templates/*`, `.claude/skills/speckit-*` 파일을 함께 점검한다.

**Version**: 1.1.0 | **Ratified**: 2026-07-21 | **Last Amended**: 2026-10-10
