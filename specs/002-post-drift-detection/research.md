# Research: 게시글 드리프트(제목 변경·삭제) 감지 및 갱신

**Input**: [spec.md](spec.md) Clarifications, Assumptions, Key Entities

spec.md의 Clarifications 세션이 이미 3계층 구조(처리 이력 → 배치 결정 → 재조정)와 핵심
정책(재분류·삭제 모두 무검토 자동 반영, 변경 내역은 커밋 메시지에 기록)을 확정해 두었으므로,
이 문서는 남은 "어떻게"를 구체화한다: 저장 형식, 부분 갱신·재조정 알고리즘, 기존 코드
재사용 범위, 커밋 메시지 형식.

## §1. 배치 결정 레코드의 저장 위치와 스키마

**Decision**: `.github/series-assignments.json`을 신규로 둔다. `seriesId`를 키로 하는
객체이며, 각 항목은 `{ listName, posts: [{ url, title }] }`을 갖는다. `posts`는
001의 `*_series.json` 정렬 규칙과 동일하게 발행 순서(lastMod 오름차순)로 정렬한다.

**Rationale**: spec.md Clarifications가 "새로 만들어"라고 명시했고, 이 파일은 순수하게
자동화 내부 상태(재조정의 입력)이지 사용자 대상 콘텐츠가 아니므로 Constitution I(시리즈
데이터 스키마 일관성)의 적용 대상이 아니다. `.github/sync-state.json`과 같은 디렉터리에
둬서 "자동화 내부 상태는 `.github/`에 있다"는 기존 관행(001)을 그대로 따른다. `posts`가
`*_series.json`의 `items`와 거의 같은 모양(url+title)인 것은 의도적 — 재조정 단계에서
"배치 결정 posts"와 "실제 items"를 바로 비교할 수 있어야 하기 때문이다(FR-008).

**Alternatives considered**:
- `.github/sync-state.json`에 필드로 얹기 — 기각. 처리 이력(변경 감지, lastMod 기준)과
  배치 결정(시리즈 소속, 제목 기준)은 갱신 주기와 책임이 다르다(Clarifications 세션의
  3계층 구분 취지). 한 파일에 섞으면 "이번 실행에서 바뀐 부분만 갱신"이라는 부분 갱신
  규칙(FR-006)을 두 레코드에 각각 다르게 적용하기 어려워진다.
- seriesId별로 별도 파일(`<seriesId>_assignment.json`)로 쪼개기 — 기각. 재조정(FR-008)이
  매 실행마다 배치 결정 "전체"와 실제 파일 "전체"를 비교해야 하므로, 조회를 위해 매번
  디렉터리 전체를 스캔해야 하는 분산 파일보다 단일 파일이 단순하다. 001 규모(시리즈 26개)에서
  단일 JSON 파일 크기는 문제가 되지 않는다.

## §2. 처리 이력 레코드 필드 확장과 기존 레코드 마이그레이션

**Decision**: `.github/sync-state.json`의 `processedPosts[]`에서 `rawSeriesName`
필드를 `title`(게시글 제목 전체)로 대체하고, `lastMod`(마지막으로 확인한 sitemap의
`<lastmod>` 값, ISO 8601 UTC 문자열)와 `deletedAt`(삭제·비공개 전환이 확정된 시각,
`+09:00` 오프셋 ISO 문자열 또는 `null`)을 추가한다. `rawSeriesName`·`seriesId`가
필요한 곳(배치 결정 계산)은 `title`로부터 그때그때 다시 계산한다(`extractRawSeriesName`
→ `toSeriesId`는 이미 순수 함수라 재계산 비용이 없음).

이 기능 배포 이전에 기록된 기존 331건은 `lastMod`·`title`·`deletedAt` 필드가 없다.
필드가 없는 레코드는 "변경 여부 불명"으로 간주해(spec.md Assumptions) 다음 실행에서
무조건 재확인 후보에 포함시킨다 — 즉 `!record.lastMod || sitemapPost.lastmod >
new Date(record.lastMod)`를 후보 판정 조건으로 쓰면, 필드가 없는 레코드는 조건의
앞쪽 절에서 항상 참이 되어 자연히 첫 실행에서 한 번씩 재확인된다. 재확인이 끝나면
그 레코드는 `title`·`lastMod`가 채워져 이후 정상적인 diff 대상이 된다.

**Rationale**: `title`이 `rawSeriesName`의 상위 호환(제목 전체 → 시리즈명 부분은
언제든 재추출 가능)이라 정보 손실이 없다. 필드 존재 여부만으로 마이그레이션 여부를
판별하는 방식은 별도의 스키마 버전 필드나 일괄 마이그레이션 스크립트 없이, 스크립트
로직만으로 자연스러운 점진적 이행을 만든다(001의 "cutoff가 없으면 전체 대상" 패턴과
동일한 스타일).

**Alternatives considered**:
- `rawSeriesName`을 유지하고 `title`을 추가 필드로 병행 — 기각. 두 값이 어긋날 경우(예:
  과거에 기록된 `rawSeriesName`이 실제로는 오래된 제목에서 추출된 것) 어느 쪽이 신뢰할
  수 있는 값인지 모호해진다. `title` 하나만 진실 공급원으로 두는 편이 명확하다.
- 배포 시 일괄 마이그레이션 스크립트로 기존 331건의 `lastMod`를 한 번에 채우기 — 기각.
  이러려면 331건 전부를 즉시 재조회해야 하는데, 이는 SC-004("추적 중인 전체 게시글 수를
  매번 다시 조회하지 않는다")가 막으려는 바로 그 비용이다. 점진적 이행이 스펙의 성능
  목표와 일치한다.

## §3. 배치 결정 부분 갱신과 재분류 대기 상태

**Decision**: 배치 결정 갱신은 이번 실행에서 title·lastMod가 새로 갱신됐거나
`deletedAt`이 새로 설정된 처리 이력 레코드에 대해서만 수행한다(FR-006 그대로). 갱신
대상 게시글마다:

1. 현재 배치 결정에서 이 게시글이 속한 seriesId를 찾는다(역방향 조회 — posts 배열들을
   훑어 url이 일치하는 항목을 찾음. 시리즈 26개 규모에서 선형 탐색으로 충분하다).
2. 삭제 확정(`deletedAt` 설정)이면 찾은 위치에서 제거하고 끝낸다(FR-007). 새 위치에는
   추가하지 않는다.
3. 삭제가 아니면 새 `title`로 새 seriesId를 계산한다.
   - 새 seriesId가 기존 위치와 같으면 같은 자리의 `title`만 갱신한다(순수 텍스트 갱신,
     User Story 1 시나리오 1).
   - 새 seriesId가 다르면(재분류), **새 seriesId 그룹이 이 게시글을 포함해 2개 이상이
     될 때만** 실제로 옮긴다(기존 위치에서 제거 + 새 위치에 추가, `title`도 새 값으로).
     아직 2개 미만이면 기존 위치에 그대로 두되 `title`은 새 값으로 갱신한다(User Story 1
     시나리오 5 — 목차 자체는 옛 시리즈 밑에 남지만 최소한 제목 텍스트는 최신 상태 유지).

**Rationale**: 이 조건부 이동 규칙이 "재분류 대상 게시글이 어느 목차에도 없는 상태를
만들지 않는다"(spec.md Edge Cases)를 만족하는 가장 단순한 방법이다. 이동 여부 판단은
이미 메모리에 올라온 배치 결정 파일만 보면 되므로 추가 네트워크 요청이 없다.

**Known limitation (문서화하고 넘어감)**: 재분류 대상 게시글 A와, A가 합류해야 새
시리즈의 2개 임계값을 채워줄 게시글 B가 서로 다른 실행에서 각각 lastMod 변경으로
감지되면, A가 먼저 감지된 실행에서는 대상 그룹이 아직 1명(A 자신)뿐이라 이동을 보류한다.
이후 B가 감지되는 실행에서 B의 이동 로직은 "새 seriesId 그룹에 A가 이미 있는가"를 배치
결정 파일에서 확인하므로(A는 여전히 옛 위치에 남아있음) B 혼자로는 여전히 1명으로
보여 B도 보류될 수 있다 — 즉 A와 B가 같은 실행에서 함께 감지되지 않는 한, 임계값을
스스로 채우지 못하고 계속 보류될 수 있다. 이는 대량 재발행처럼 흔치 않은 경우에만
발생하며(제목을 바꾸는 편집은 보통 한 세션에 몰려 일어나 같은 실행에서 같은 lastMod
구간에 잡힐 가능성이 높음), spec.md Assumptions가 이미 "대량 재발행 등 처리량 급증
시나리오는 이 스펙에서 확정하지 않고 실제로 관찰되면 재검토한다"고 여지를 둔 범위와
같은 종류의 잔여 리스크로 취급한다. 완전한 해결(예: 배치 결정 전체를 매 실행마다
재계산)은 FR-006의 "부분 갱신" 요구와 충돌하므로 채택하지 않는다.

**Alternatives considered**:
- 이동 여부와 무관하게 즉시 배치 결정을 옮기고, 2개 미만 그룹은 재조정 단계에서만
  파일 생성을 보류 — 기각. 이러면 게시글이 옛 파일에서도 빠지고 새 파일도 아직 없어
  "어느 목차에도 없는 상태"가 실제로 발생한다(spec.md Edge Cases가 명시적으로 금지).
- 배치 결정을 매 실행마다 전체 재계산 — 기각. 사용자가 명시적으로 요청한 "매번 전부
  갱신하지 않는다"(FR-006)를 위반한다.

## §4. 재조정 알고리즘 (배치 결정 vs 실제 파일)

**Decision**: 매 실행마다(부분 갱신된 배치 결정 파일 전체를 대상으로) 다음을 수행한다.

```
for each seriesId in 배치 결정:
  posts = 배치 결정[seriesId].posts
  file = <seriesId>_series.json (있으면 읽음)
  if posts.length < 2:
    if file exists: file 삭제 (CUD: Deleted)
    continue
  if !file exists:
    file 생성, listName = 배치 결정[seriesId].listName, items = posts 그대로 (CUD: Created)
    continue
  diff = file.items 와 posts 비교 (url 기준)
  누락된 url → 추가 (CUD: Updated - 항목 추가)
  더 이상 없는 url → 제거 (CUD: Updated - 항목 제거)
  title이 다른 url → title 갱신 (CUD: Updated - 제목 갱신)
  diff가 비어있으면 파일 쓰지 않음 (SC-006)

for each 실제 *_series.json 파일:
  if 파일의 seriesId가 배치 결정에 없음: 이 파일은 이번 기능 대상 밖(예: 001만 다루는
  신규 시리즈이거나 아직 어떤 게시글도 이번 기능의 처리 이력에 없는 시리즈) → 건드리지 않음
```

**Rationale**: 배치 결정에 없는 seriesId의 실제 파일을 건드리지 않는 것이 중요하다 —
이번 기능은 "이미 목차에 반영된" 게시글만 대상으로 하므로(spec.md Edge Cases 첫 항목),
001이 새로 만든 시리즈나 아직 이 기능의 처리 이력에 편입되지 않은 파일까지 재조정
대상으로 삼으면 범위를 벗어난다. `listName`은 001의 FR-013 규칙(새로 발견된 게시글 중
가장 먼저 발행된 것의 rawSeriesName)을 그대로 이어받아, 배치 결정 안에서 가장 오래된
post의 title로부터 추출한다.

**Alternatives considered**:
- 재조정을 seriesId 단위가 아니라 파일 시스템 diff(전체 `*_series.json` 나열 후 배치
  결정과 대조)로 시작 — 기각. 배치 결정에 없는 기존 시리즈 파일까지 순회 대상에 들어가면
  "이 파일을 왜 건드리지 않는지"를 매번 판별하는 조건이 필요해져 오히려 복잡해진다.
  배치 결정을 순회의 기준점으로 삼으면 범위가 코드 구조로 자연히 제한된다.

## §5. 기존 `collectSiblingCandidates` 재사용 여부

**Decision**: 건드리지 않는다 — 확장하지도, 제거하지도 않는다. `seriesFiles.js`의
`collectSiblingCandidates`는 `index.js:123`에서 001의 "매칭되는 기존 파일이 없는
seriesId는 형제 게시글이 2개 이상일 때만 새 파일 생성"이라는 **여전히 살아있는, 이번
기능과 무관한** 로직(001 FR-012/013 — 아직 한 번도 목차에 반영되지 않은 신규 게시글을
대상으로 함)에 계속 쓰이고 있다. 이번 기능은 "이미 목차에 반영된" 게시글만 다루므로
(spec.md Edge Cases 첫 항목), 이 함수의 책임과는 애초에 겹치지 않는다 — 새 모듈
(`seriesAssignments.js`, `reconcile.js`)로 분리해 별도로 구현하며, `collectSiblingCandidates`는
그대로 남긴다.

**Rationale**: 이 함수가 계산하는 "sitemap 결측"은 001의 신규 시리즈 임계값 판단이라는
전혀 다른 목적으로 쓰이는 것이지, 이번 기능의 FR-005 삭제 확정 로직이 흡수하거나
대체할 대상이 아니다(초안에서 이 둘을 같은 계산으로 오인해 제거를 검토했으나, 재확인
결과 서로 다른 책임임을 확인했다 — `/speckit-analyze` 발견 사항 I1). 새 모듈로 분리하는
편이 001의 기존 동작(신규 시리즈 생성)에 대한 회귀 위험이 없다는 점은 원래 판단과 같다.

**Alternatives considered**:
- `collectSiblingCandidates`를 이번 기능에 맞게 확장 — 기각. "이번 실행 후보"와 "배치
  결정 파일" 두 가지 서로 다른 입력을 받아야 해서 함수 책임이 불명확해지고, 001의 신규
  시리즈 생성 경로에도 영향을 줄 위험이 있다.
- `collectSiblingCandidates`를 제거하고 그 계산을 이번 기능 쪽으로 이동 — 기각(최초
  검토했던 안). `index.js`의 001 신규 시리즈 생성 호출부가 이 함수에 의존하고 있어
  제거하면 그 경로가 즉시 깨진다.

## §6. 커밋 메시지 CUD 요약 형식

**Decision**: 001이 이미 확립한 한국어 단일 스타일(`chore: ...`)을 유지하되, 제목 줄
아래에 실제 변경 내역을 나열한다.

```
chore: 티스토리 시리즈 목차 드리프트 반영

Created: coroutines_series.json (2건)
Updated: flow_series.json (제목 갱신 1건, 항목 추가 1건)
Deleted: legacy-topic_series.json (항목 부족으로 파일 삭제)
```

변경 유형이 하나도 없으면(선별된 후보도 없고 배치 결정과 실제 파일이 이미 일치하면)
커밋 자체를 만들지 않는다(001의 기존 `git status --porcelain` 판단과 동일, spec.md
Assumptions).

**전달 방식**: 동기화 스크립트 실행 스텝과 커밋 스텝은 `tistory-series-sync.yml` 안의
서로 다른 `run:` 스텝(별도 프로세스)이라 메모리를 공유하지 않지만, 같은 job의 작업
디렉터리(워크스페이스)는 공유한다. 따라서 스크립트가 변경이 있을 때만 저장소 루트에
git 추적 대상이 아닌 임시 파일(`.sync-commit-summary.txt`)로 CUD 요약을 써 두고,
커밋 스텝이 그 파일이 있으면 내용을 커밋 메시지 본문으로 쓴 뒤 삭제한다(tasks.md 참고).
data-model.md "Commit Change Summary"의 "별도 파일로 저장하지 않는다"는 초기 서술은
이 전달 방식과 모순되어 수정했다(`/speckit-analyze` 발견 사항 I2).

**Rationale**: `.github/workflows/tistory-series-sync.yml`의 커밋 스텝은 지금
`git status --porcelain`만으로 "변경이 있는지"를 판단하고 고정 문구를 쓴다. CUD 요약을
만들려면 동기화 스크립트(`index.js`)가 재조정 단계(§4)에서 만든 CUD 목록을 표준출력이나
임시 파일로 워크플로우 스텝에 넘겨줘야 한다 — 구체적 전달 방식(stdout 캡처 vs. 임시
파일)은 tasks 단계의 구현 세부사항으로 남긴다. CLAUDE.md의 영어 제목 + 한국어 설명
커밋 컨벤션은 이 세션(Claude Code)이 만드는 커밋에 적용되는 규칙이며, 001의 자동화가
스스로 만드는 커밋은 별도로 이미 한국어 단일 스타일을 확립해 두었으므로 그 관행을
그대로 잇는다.

**Alternatives considered**:
- 영어 conventional-commit + 한국어 설명(CLAUDE.md 스타일)로 전환 — 기각. 001의 기존
  커밋 메시지(`chore: 티스토리 시리즈 목차 동기화`)와 다른 스타일을 자동화 산출물에
  섞으면 `git log`를 봤을 때 "이 커밋은 Claude Code 세션이 만든 건지 자동화가 만든
  건지" 구분이 오히려 흐려진다. 자동화 커밋은 자동화가 이미 정한 관행을 따른다.
- 커밋 메시지 대신 커밋 트레일러(`Series-Changes: ...`)로 구조화된 데이터를 남기기 —
  기각. spec.md SC-007이 요구하는 건 "커밋 메시지만 보고도 무엇이 바뀌었는지 안다"는
  가독성이지, 기계 파싱 가능한 구조가 아니다. 사람이 읽는 요약이면 충분하다.

## Sources

- `scripts/sync-tistory-series/*.js`, `.github/workflows/tistory-series-sync.yml`
  (internal repo code, read directly — not a URL fetch)
- `specs/001-tistory-series-sync/{plan,data-model,research}.md` (internal repo files,
  read directly — not a URL fetch)
- `specs/002-post-drift-detection/spec.md` Clarifications (internal repo file, read
  directly — not a URL fetch)
- `.specify/memory/constitution.md` (internal repo file, read directly — not a URL fetch)

No external web hosts were fetched for this research.
