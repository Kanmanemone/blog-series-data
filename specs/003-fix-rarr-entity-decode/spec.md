# Feature Specification: HTML 엔티티 디코딩 누락 수정 (&rarr;)

**Feature Branch**: `003-fix-rarr-entity-decode`

**Created**: 2026-08-21

**Status**: Draft

**Input**: User description: "navigation_series.json의 Navigation 시리즈 게시글(https://kenel.tistory.com/433) 제목에 \"&rarr;\"가 화살표(→) 대신 그대로 노출되는 버그를 고친다. 근본 원인은 decodeHtmlEntities()가 001 스펙 시점에 실측된 다섯 개 기본 엔티티만 방어적으로 치환하도록 만들어져 있어, 이후 실제 게시글 제목에 등장한 &rarr; 같은 다른 HTML named entity가 디코딩되지 않고 원문 그대로 저장된 것. decodeHtmlEntities 개선(범용 디코더로 오버엔지니어링 금지), navigation_series.json과 .github/sync-state.json의 기존 잘못된 값 수정, 다른 series 파일에 동일 패턴이 없는지 재현 가능한 테스트로 확인."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 시리즈 목차에서 실제 화살표를 본다 (Priority: P1)

블로그 독자가 kenel.tistory.com의 시리즈 목차(navigation_series.json 기반 네비게이션)를 볼 때, "Navigation 2 &rarr; 3"처럼 인코딩된 문자열이 아니라 "Navigation 2 → 3"처럼 실제 게시글 제목과 동일한 화살표 문자를 봐야 한다.

**Why this priority**: 이 저장소가 존재하는 목적 자체가 게시글 제목을 정확히 반영한 시리즈 목차를 제공하는 것이며, 현재 이 목적이 이미 깨져 있는 상태다.

**Independent Test**: navigation_series.json을 열어 해당 게시글의 title 필드가 "→" 문자를 포함하고 "&rarr;" 문자열을 포함하지 않는지 확인하는 것만으로 완전히 검증 가능하다.

**Acceptance Scenarios**:

1. **Given** navigation_series.json에 저장된 게시글 433의 title, **When** 파일을 읽는다, **Then** title은 "[Android] Navigation - Navigation 2 → 3"이며 "&rarr;"라는 부분 문자열을 포함하지 않는다.
2. **Given** .github/sync-state.json의 processedPosts 중 url이 "https://kenel.tistory.com/433"인 레코드, **When** 레코드를 읽는다, **Then** title은 동일하게 "→"를 포함하고 "&rarr;"를 포함하지 않는다.

---

### User Story 2 - 앞으로 같은 종류의 문제가 다시 나타나도 목차가 조용히 깨지지 않는다 (Priority: P2)

동기화 파이프라인을 운영하는 사람 입장에서, 게시글 제목에 새로운 HTML 엔티티가 등장했을 때
(a) 숫자로 지정된 문자(예: `&#39;`, `&#x2192;`)는 별도 등록 없이 항상 올바르게 디코딩되고,
(b) 이름으로 지정된 문자(예: `&amp;`, `&rarr;`) 중 아직 등록되지 않은 것이 나타나면, 그
게시글의 제목이 원문 그대로 시리즈 목차나 동기화 이력에 조용히 저장되는 대신 이번 실행에서
건너뛰어지고 원인을 알 수 있는 에러가 남아야 한다.

**Why this priority**: `&rarr;`를 고친 뒤 `&times;`가 같은 방식으로 또 발견된 것(003의
speckit-converge 1차 실행)이 실제로 증명하듯, "실측되는 대로 하나씩 이름을 등록"하는 방식은
등록되지 않은 이름이 나타날 때마다 원문이 조용히 저장되는 문제를 구조적으로 반복시킨다. 이
User Story가 목표로 하는 건 이번 두 개의 엔티티를 고치는 것이 아니라, 세 번째·네 번째
엔티티가 나타나도 **같은 종류의 눈에 보이는 버그가 다시는 발생하지 않는 것**이다. 사용자
피드백에 따라, "관측된 것만 하나씩 등록"하는 화이트리스트 대신 HTML 4.01/XHTML1이 확정한
이름 있는 문자 참조 표 **전체**(1999년 이후 변경 없음, 약 250개, FR-002)를 내장해 이름 있는
엔티티도 숫자 문자 참조와 동일하게 "표에서 코드포인트를 찾아 변환"하는 하나의 경로로
처리한다. 이 표에조차 없는 이름(HTML5에서 새로 생긴 것 등 진짜 예외적인 경우)에 한해서만
"모르면 조용히 넘어가지 않고 실패를 눈에 보이게 만드는" 최후 안전망(FR-008)이 작동한다.

**Independent Test**: (a) 지금까지 이 저장소가 한 번도 등록한 적 없지만 표준 표에는 있는
이름 있는 엔티티(예: `&copy;`)를 decodeHtmlEntities에 넣었을 때 코드 수정 없이 올바르게
디코딩되는지, (b) 등록되지 않은 숫자 문자 참조(예: `&#169;`)도 마찬가지인지, (c) 표준
표에도 없는 이름(예: HTML5에서 새로 생긴 `&checkmark;`)이 포함된 `<title>` HTML을 게시글
제목 추출 함수에 넣었을 때 그 결과가 시리즈 목차에 저장되는 대신 명확한 에러로 실패하는지를
단위 테스트로 확인한다.

**Acceptance Scenarios**:

1. **Given** "Navigation 2 &rarr; 3"라는 원문 제목, **When** decodeHtmlEntities를 호출한다, **Then** "Navigation 2 → 3"을 반환한다.
2. **Given** 기존에 지원되던 엔티티(&amp; &lt; &gt; &quot; &#39; &rarr; &times;)를 포함한 제목, **When** decodeHtmlEntities를 호출한다, **Then** 기존과 동일하게 정상 치환된다(회귀 없음).
3. **Given** 지금까지 한 번도 등록된 적 없는 숫자 문자 참조(예: `&#169;`, `&#x2192;`)를 포함한 제목, **When** decodeHtmlEntities를 호출한다, **Then** 코드 수정 없이 올바른 문자로 치환된다.
4. **Given** 지금까지 한 번도 등록된 적 없지만 HTML 4.01/XHTML1 표준 표에는 있는 이름 있는 엔티티(예: `&copy;`, `&ndash;`, `&euro;`)를 포함한 제목, **When** decodeHtmlEntities를 호출한다, **Then** 코드 수정 없이 올바른 문자로 치환된다.
5. **Given** `<title>`에 표준 표에도 없는 이름 있는 엔티티(예: `&checkmark;`)가 포함된 게시글 HTML, **When** 게시글 제목을 추출한다, **Then** 그 제목은 어떤 파일에도 저장되지 않고, 어떤 게시글의 어떤 엔티티가 문제인지 알 수 있는 에러가 발생한다.

---

### User Story 3 - 저장소 전체에 같은 패턴의 미해석 엔티티가 남아있지 않음을 확인한다 (Priority: P3)

이 저장소를 유지보수하는 사람 입장에서, 이번에 발견된 것과 같은 패턴(디코딩되지 않은 HTML named entity)이 다른 *_series.json 파일에도 숨어 있지 않은지 재현 가능한 방식으로 확인하고 싶다.

**Why this priority**: 근본 원인 수정과 데이터 수정만으로는 "다른 곳에도 같은 문제가 없는가"라는 질문에 답하지 못한다. 이 확인 자체는 테스트로 남겨 반복 가능해야 한다.

**Independent Test**: 모든 *_series.json 파일의 title 필드에 대해 미해석 HTML named entity(`&[a-zA-Z][a-zA-Z0-9]*;` 패턴)가 없는지 검사하는 테스트를 실행해 통과를 확인한다.

**Acceptance Scenarios**:

1. **Given** 저장소의 모든 *_series.json 파일, **When** 미해석 HTML entity 패턴 검사를 실행한다, **Then** 어떤 title에서도 매치가 발견되지 않는다.

---

### Edge Cases

- decodeHtmlEntities가 내장한 HTML 4.01/XHTML1 표준 표에도 없는 새로운 이름 있는 엔티티(named entity, 예: HTML5 전용 `&checkmark;`)가 향후 등장하면 어떻게 되는가? → FR-008에 따라 그 게시글은 이번 실행에서 건너뛰어지고 에러가 남는다(원문이 조용히 저장되지 않음). 사람이 로그를 보고 htmlNamedEntities.js에 새 항목을 등록하면, 다음 실행부터 정상 처리된다. 다만 그 게시글이 이미 sync-state에 다른 이력으로 등록돼 있고 이번 실행에서 cutoff가 그 게시글의 lastmod를 지나쳐 버리면(기존 001/002 설계의 알려진 특성 — 신규 후보 중 일부만 실패해도 cutoff는 전진함) 다음 lastmod 변경 전까지 재시도되지 않을 수 있다. 이 재시도 타이밍 문제는 이번 기능이 새로 만든 것이 아니라 001/002가 모든 fetch 실패에 대해 이미 갖고 있던 특성이므로 이번 수정 범위 밖으로 남긴다. 표준 표 전체를 내장했으므로 이 경로가 실제로 발동할 일은 매우 드물 것으로 예상된다.
- 새로운 **숫자** 문자 참조(numeric character reference, `&#NNN;`/`&#xHHH;`)가 등장하면 어떻게 되는가? → FR-007에 따라 어떤 값이든 코드 등록 없이 항상 디코딩되므로 해당 없음.
- `&rarr;`/`&times;`가 이미 두 번 이상 디코딩되어 다른 형태(예: 이중 인코딩)로 저장된 레코드가 존재하는가? → grep으로 저장소 전체를 확인한 결과 각각 한 곳(navigation_series.json/sync-state.json의 게시글 433, sync-state.json의 백준 11726 게시글)에서만 발견되었으므로 해당하지 않는다.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: decodeHtmlEntities는 기존에 지원하던 엔티티(&amp; &lt; &gt; &quot;)에 더해 `&rarr;`와 `&times;`를 각각 "→", "×"로 치환해야 한다.
- **FR-002**: decodeHtmlEntities는 HTML 4.01/XHTML1이 정의한 이름 있는(named) 문자 참조 표 전체(1999년 확정 이후 변경 없음, 약 250개)를 내장해 지원해야 하며, 이 표에 있는 이름은 이 저장소가 실제로 관측했는지 여부와 무관하게 별도 등록 없이 항상 디코딩되어야 한다. 다만 HTML5에서 새로 추가된 것을 포함한 그 이후 표준의 확장 명명 엔티티(수천 개 규모)까지 전부 지원하는 완전한 범용 디코더로는 확장하지 않는다.
- **FR-003**: navigation_series.json 중 url이 "https://kenel.tistory.com/433"인 항목의 title은 "&rarr;"를 "→"로 치환한 값으로 수정되어야 한다.
- **FR-004**: .github/sync-state.json의 processedPosts 중 url이 "https://kenel.tistory.com/433"인 레코드와, url이 백준 11726 게시글인 레코드의 title이 각각 "&rarr;"→"→", "&times;"→"×"로 치환된 값으로 수정되어야 한다.
- **FR-005**: 저장소의 모든 *_series.json 파일에 대해, title 필드에 미해석 HTML named entity가 존재하지 않음을 확인하는 자동화된 테스트가 있어야 한다.
- **FR-006**: decodeHtmlEntities의 엔티티 치환 테스트는 `&rarr;`, `&times;` 케이스를 포함해야 하며, 기존 엔티티에 대한 회귀 테스트는 계속 통과해야 한다.
- **FR-007**: decodeHtmlEntities는 숫자 문자 참조(`&#NNN;` decimal, `&#xHHH;` hex)를 해당 유니코드 코드포인트로 범용 변환해야 한다 — 특정 코드포인트를 사전에 등록할 필요가 없어야 한다.
- **FR-008**: 게시글 제목을 디코딩한 결과에 FR-002의 화이트리스트에 없는 이름 있는 엔티티가 남아있으면, 시스템은 그 결과를 어떤 시리즈 목차 파일이나 동기화 이력에도 저장하지 않고, 해당 게시글과 남은 엔티티를 식별할 수 있는 에러를 발생시켜야 한다.

### Key Entities

- **Series 목차 파일 (`*_series.json`)**: 시리즈별 게시글 목록. 각 항목은 게시글 제목(title)과 URL을 가진다. 제목은 게시글 `<title>` 태그 원문에서 HTML 엔티티를 디코딩한 값이어야 한다.
- **동기화 상태 (`.github/sync-state.json`)**: 이미 처리된 게시글의 이력. 각 레코드는 URL, title(마지막으로 확인된 디코딩된 제목), lastMod 등을 가진다.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: navigation_series.json과 sync-state.json 어디에도 "&rarr;"·"&times;"라는 미해석 문자열이 남아있지 않다.
- **SC-002**: 저장소 내 모든 *_series.json 파일의 title 필드에 미해석 HTML named entity가 하나도 없다.
- **SC-003**: decodeHtmlEntities 단위 테스트가 `&rarr;`, `&times;`, 등록되지 않은 숫자 문자 참조 케이스를 포함해 100% 통과하며, 기존 테스트 스위트 전체(`npm test`)도 회귀 없이 통과한다.
- **SC-004**: HTML 4.01/XHTML1 표준 표에도 없는 이름 있는 엔티티가 포함된 게시글 제목은, 코드를 수정하지 않은 상태에서도 시리즈 목차나 동기화 이력에 원문 그대로 저장되지 않는다(단위 테스트로 검증).
- **SC-005**: HTML 4.01/XHTML1 표준 표에 있지만 이 저장소가 지금까지 한 번도 등록한 적 없는 이름 있는 엔티티(예: `&copy;`, `&euro;`)는 코드를 수정하지 않은 상태에서도 올바르게 디코딩된다(단위 테스트로 검증) — 화이트리스트를 매번 손으로 넓힐 필요가 없다는 것이 이번 재설계의 핵심 성과다.

## Assumptions

- 이번에 발견된 "&rarr;"와 "&times;"는 Tistory 에디터가 제목에 특수 문자를 입력할 때 HTML 문자 참조로 인코딩해 `<title>` 태그에 그대로 노출한 결과이며, 별도의 시스템 오류나 인코딩 손상이 아니다.
- 숫자 문자 참조(`&#NNN;`/`&#xHHH;`)는 유니코드 코드포인트로 결정적으로 변환 가능하므로 범용 디코딩이 안전하다. 이름 있는 엔티티(named entity)는 이름 자체에 코드포인트 정보가 없어(`String.fromCodePoint`만으로는 풀 수 없음, 사용자 확인 완료) 대응표가 반드시 필요하지만, 그 표를 이 저장소가 손으로 채우는 대신 HTML 4.01/XHTML1이 이미 확정해 놓은 표 전체를 내장한다(FR-002) — 표준이 고정돼 있으므로 이후 유지보수가 사실상 필요 없다. 그 표에도 없는 진짜 예외적인 이름에 한해서만 FR-008의 실패 감지가 최후 안전망으로 작동한다.
- 이미 저장된 navigation_series.json 및 sync-state.json의 해당 값들은 라이브 사이트에 다시 접속하지 않고, 알려진 정답(원본 게시글 제목에 대응하는 디코딩된 값)으로 직접 수정한다.
- .github/series-assignments.json에는 해당 게시글들의 title 필드가 없으므로(확인 결과 url만 포함, 혹은 애초에 등록되지 않음) 수정 대상에서 제외한다.
- FR-008이 게시글을 건너뛰게 만들었을 때, 그 게시글이 다음 실행에서 다시 후보로 잡히는지는 001/002가 이미 갖고 있던 재시도 특성(Edge Cases 참고)에 따르며, 이번 기능은 그 특성을 바꾸지 않는다.
