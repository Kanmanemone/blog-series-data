# Research: 티스토리 시리즈 목차 JSON 동기화 자동화

**Input**: [spec.md](spec.md)의 Technical Context에서 남은 미확정 항목

이 문서는 `/speckit-plan` Phase 0에서 실제 `kenel.tistory.com` sitemap과 게시글 페이지를
직접 조회해 확인한 사실, 그리고 그로부터 도출한 기술 결정을 기록한다.

## 1. 실행 언어/런타임

- **Decision**: 별도 의존성 없는 Node.js 스크립트(`node:fs`, `node:path`, 내장 `fetch`만 사용).
  GitHub Actions 워크플로우에서 `node scripts/sync-tistory-series/index.js`로 직접 실행한다.
- **Rationale**: 저장소에 이미 `package.json`이나 빌드 파이프라인이 없고(Constitution III:
  독립형 바닐라 웹 유틸리티), 기존 `keyword_filename_formatter.html`도 순수 JS로 작성되어
  있다. `ubuntu-latest` 러너에는 Node.js가 기본 설치되어 있어 `actions/setup-node` 외에
  추가 설치 단계가 필요 없고, `npm install` 자체가 없으므로 의존성 버전 관리 부담이 없다.
- **Alternatives considered**: Python(표준 라이브러리만으로도 가능하나, 저장소에 Python
  코드/관행이 전혀 없어 새 언어를 들여오는 셈이 된다) — 기각.

## 2. sitemap.xml 파싱

- **확인한 사실**: `https://kenel.tistory.com/sitemap.xml`은 아래와 같은 단순 반복 구조다.

  ```xml
  <url>
    <loc>https://kenel.tistory.com/104</loc>
    <lastmod>2024-09-17T17:15:40+09:00</lastmod>
  </url>
  ```

  - 루트(`/`)에만 `<priority>`가 붙고, `<lastmod>`가 아예 없는 `<url>` 항목(카테고리 페이지,
    `/guestbook`, `/tag`)도 존재한다.
  - 게시글 URL은 `https://kenel.tistory.com/<숫자>`(데스크톱)와
    `https://kenel.tistory.com/m/<숫자>`(모바일) 두 형태로 **항상 쌍으로** 존재하며, 실제
    조회 결과 같은 게시글의 두 `<lastmod>` 값은 동일했다(예: `/104`, `/m/104` 모두
    `2024-09-17T17:15:40+09:00`).
  - `lastmod`는 sitemap이 이미 `+09:00`(KST) 오프셋을 포함해 내려준다.
- **Decision**: 외부 XML 파서 라이브러리를 추가하지 않고, `<url>...</url>` 블록 단위 정규식으로
  `<loc>`과 `<lastmod>`만 추출한다. `<lastmod>`가 없는 `<url>` 블록은 처리 대상에서 자연히
  제외된다(FR-004의 비교 대상 자체가 없으므로).
- **URL 정규화(FR-005)**: 경로가 `^/(m/)?[0-9]+$` 패턴에 맞는 것만 게시글로 간주하고(FR-006),
  게시글 식별자는 숫자 ID로 삼는다. `/m/<id>`와 `/<id>`가 모두 나타나면 같은 ID로 병합하고,
  시리즈 json에는 기존 데이터 관행과 동일하게 데스크톱 형태(`https://kenel.tistory.com/<id>`)
  URL만 기록한다. 두 lastmod가 실측상 항상 같으므로 충돌 해소 규칙은 필요 없다(만약 다르면
  더 최신 값을 채택).
- **Alternatives considered**: `fast-xml-parser` 등 npm 패키지 도입 — sitemap 구조가
  단순하고 자체 블로그가 생성하는 신뢰 가능한 소스라 정규식으로 충분하며, 의존성을 추가하지
  않는 편이 Constitution III의 취지에 맞음. 기각.

## 3. 게시글 제목 조회

- **확인한 사실**: 게시글 페이지(`https://kenel.tistory.com/<id>`, 모바일도 동일)의
  `<title>` 태그 내용이 시리즈 json의 `items[].title`과 **완전히 동일한 원문**이다. 사이트명
  접미사가 붙지 않으며, 작은따옴표(`'`)처럼 HTML 엔티티로 인코딩될 수 있는 문자도 실측
  결과 원문 그대로(`'`) 내려온다.

  ```
  <title>[Kotlin] Coroutines - 기초</title>
  ```

- **Decision**: 페이지 HTML을 fetch한 뒤 `<title>([^<]*)<\/title>` 정규식으로 첫 번째
  매치를 그대로 사용한다. 별도 HTML 엔티티 디코딩은 하지 않되, 혹시 모를 `&amp;`류 인코딩에
  대비해 `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;` 다섯 개 기본 엔티티만 방어적으로
  치환한다.
- **Alternatives considered**: `og:title` 메타 태그 — 확인 결과 `<title>`과 값이 동일해
  이점이 없고, 정규식이 하나 더 늘어나므로 기각.

## 4. seriesId 정규화 규칙

- **확인한 사실**: 기존 `keyword_filename_formatter.html`이 이미 아래 규칙으로 파일명을
  만들고 있다(저장소의 사실상 표준).

  ```js
  const seriesId = rawSeriesName
    .replace(/\s+/g, "")      // 공백 전부 제거
    .toLowerCase()            // 소문자 변환
    .replace(/[\\/:*?"<>|]/g, ""); // Windows 파일명 금지 문자 제거
  ```

- **Decision**: 이 로직을 그대로 스크립트에 이식해 FR-009("기존 파일명 규칙과 동일해야
  한다")를 만족시킨다. 새 정규식을 고안하지 않는다.

## 5. 시각/시간대(KST) 처리

- **Decision**: GitHub Actions 러너의 기본 시간대(UTC)나 Node의 ICU 설정에 의존하지 않고,
  모든 시각을 `Date` 객체(내부적으로 UTC epoch ms)로 계산하되, **저장·기록할 때만** 명시적으로
  `+09:00` 오프셋 문자열로 포맷한다(`Intl`/로컬 타임존 API 대신 9시간을 직접 더하는 수동
  계산). sitemap의 `lastmod`는 이미 오프셋 포함 ISO 문자열이라 `new Date(lastmod)` 비교만으로
  정확한 순서 비교가 가능하다(오프셋이 있는 ISO 문자열은 타임존 무관하게 올바른 순간을
  가리키므로).
- **Rationale**: FR-002가 "실행 환경의 기본 시간대와 무관하게 KST로 고정"을 명시했으므로,
  환경 의존적인 `Intl.DateTimeFormat` 기본 타임존이나 `process.env.TZ`에 기대지 않는 것이
  가장 안전하다.
- **커트라인 계산(FR-003)**: `cutoff = new Date(Date.now() - 5 * 60 * 1000)`, 저장 시
  `+09:00` 오프셋 문자열로 직렬화.

## 6. Pull Request 생성

- **Decision**: 스크립트는 워킹 트리의 `*_series.json`과 동기화 상태 파일만 갱신하고, PR
  생성 자체는 워크플로우에서 `peter-evans/create-pull-request` GitHub Action에 위임한다.
- **Rationale**: 스크립트 안에 GitHub API 호출/Octokit 의존성을 넣지 않아도 되고, 이
  액션은 변경된 파일이 없으면 자동으로 아무 것도 하지 않아 "변경 없음 → 정상 종료"(User
  Story 1 시나리오 2)를 별도 분기 없이 만족한다. 커밋 대상에 시리즈 json과 동기화 상태
  파일을 함께 포함해, PR이 병합되기 전까지는 실제 저장소가 바뀌지 않는다(User Story 3).
- **Alternatives considered**: 스크립트 내부에서 `@octokit/rest`로 직접 PR 생성 — 의존성
  추가 및 인증 처리 로직이 늘어나 기각.

## 7. 동기화 상태 저장 위치/형식

- **Decision**: `.github/sync-state.json`에 저장한다(자동화 내부 상태이므로, 콘텐츠
  데이터인 저장소 루트의 `*_series.json`과 위치를 분리). PR로 제안되므로 병합 전까지는
  갱신되지 않는다(FR-015).
- **Alternatives considered**: 저장소 루트에 다른 `*_series.json` 파일들과 나란히 두는
  방안 — 콘텐츠 데이터가 아닌 자동화 내부 상태를 섞어 두면 루트 디렉터리를 스캔하는
  기존/향후 도구(`index.html` 등)가 이 파일을 시리즈 파일로 오인할 위험이 있어 기각.

## 8. 테스트 방식

- **Decision**: Node.js 내장 테스트 러너(`node --test`)를 사용한다. `package.json` 없이도
  Node 18+에서 바로 동작한다.
- **Rationale**: 외부 테스트 프레임워크(Jest 등) 의존성을 추가하지 않아도 되어 Constitution
  III의 취지와 일치한다.

## 해소된 NEEDS CLARIFICATION 목록

Technical Context에 있던 모든 미확정 항목이 위 1~8 결정으로 해소되었다.
