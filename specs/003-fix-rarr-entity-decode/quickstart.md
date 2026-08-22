# Quickstart: HTML 엔티티 디코딩 누락 수정 (&rarr;) 검증

## 사전 준비

- Node.js (외부 npm 의존성 설치 불필요, package.json 참고)
- 저장소 루트에서 실행

## 1. 버그 재현 확인 (구현 전)

```powershell
Select-String -Path navigation_series.json -Pattern '&rarr;'
Select-String -Path .github/sync-state.json -Pattern '&rarr;'
```

구현 전에는 두 파일 모두 `&rarr;`가 포함된 줄이 출력되어야 한다.

## 2. 단위 테스트로 디코더 검증

```powershell
npm test
```

`scripts/sync-tistory-series/__tests__/index.test.js`의 `decodeHtmlEntities` 테스트에
새로 추가된 `&rarr;` → `→` 케이스와 기존 다섯 엔티티 회귀 케이스가 모두 통과해야 한다.
`__tests__/seriesDataIntegrity.test.js`(신규)도 함께 실행되어, 모든 `*_series.json`의
`title`에 미해석 HTML named entity가 없음을 확인한다.

## 3. 데이터 보정 확인 (구현 후)

```powershell
Select-String -Path navigation_series.json -Pattern '&rarr;'
Select-String -Path .github/sync-state.json -Pattern '&rarr;'
Select-String -Path navigation_series.json -Pattern '→'
```

첫 두 명령은 결과 없음(매치 없음), 세 번째 명령은 게시글 433 title이 매치되어야 한다.

## 예상 결과

- `npm test` 전체 통과 (기존 테스트 파일 + 신규 파일 회귀 없음).
- navigation_series.json과 .github/sync-state.json에 `&rarr;` 문자열이 더 이상 존재하지
  않는다.
- 저장소 내 다른 `*_series.json` 파일에는 애초에 매치가 없었으므로(사전 grep 확인) 변화
  없이 통과한다.

## 4. 커밋 메시지 카테고리 집계 검증 (User Story 4)

```powershell
node -e "
const { buildCommitMessageBody } = require('./scripts/sync-tistory-series/index.js');
console.log(buildCommitMessageBody({
  postNew: 1, postInfoUpdate: 1, postDeleted: 0,
  seriesCreated: 0, seriesAdded: 1, seriesRemoved: 0, seriesRetitled: 1, seriesDeleted: 0,
}));
"
```

예상 출력(0건 카테고리 줄과, 이번 예시엔 없지만 그룹 전체가 0일 때의 헤더 생략 동작은
단위 테스트로 별도 확인):

```text
- 게시글
  - 새 글: 1건
  - 정보 갱신: 1건
- 시리즈
  - 항목 추가: 1건
  - 제목 갱신: 1건
```

`npm test`가 `index.test.js`의 `buildCommitMessageBody` 케이스(0건 생략, 빈 그룹 헤더
생략, N=합)를 포함해 전체 통과하는지로도 검증한다.
