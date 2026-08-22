"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  decodeHtmlEntities,
  hasUnresolvedNamedEntity,
  extractTitle,
  extractPublishedAt,
  filterCandidates,
  selectDriftCandidates,
  MAX_UNKNOWN_LASTMOD_REFETCH_PER_RUN,
  buildNewPostCud,
  renderCommitSummary,
} = require("../index.js");

test("HTML 4.01/XHTML1 표준 표에 있는 이름 있는 엔티티를 원문 문자로 치환한다(FR-007, 이 저장소에서 실제로 관측된 것들)", () => {
  assert.equal(decodeHtmlEntities("A &amp; B"), "A & B");
  assert.equal(decodeHtmlEntities("&lt;tag&gt;"), "<tag>");
  assert.equal(decodeHtmlEntities("&quot;quoted&quot;"), '"quoted"');
  assert.equal(decodeHtmlEntities("Navigation 2 &rarr; 3"), "Navigation 2 → 3");
  assert.equal(decodeHtmlEntities("2&times;n 타일링"), "2×n 타일링");
});

test("표준 표에 있으면 이 저장소에서 한 번도 등록한 적 없는 이름도 코드 수정 없이 디코딩된다(003-fix-rarr-entity-decode 재발 방지 핵심 — htmlNamedEntities.js를 직접 건드리지 않고도 통과해야 함)", () => {
  assert.equal(decodeHtmlEntities("Copyright &copy; 2026"), "Copyright © 2026");
  assert.equal(decodeHtmlEntities("A&ndash;Z"), "A–Z");
  assert.equal(decodeHtmlEntities("100&euro;"), "100€");
});

test("숫자 문자 참조는 표에 없어도(코드포인트 자체가 곧 답이므로) 항상 디코딩된다 — decimal과 hex 모두", () => {
  assert.equal(decodeHtmlEntities("It&#39;s"), "It's"); // decimal, 이름 있는 표에는 apos가 없음
  assert.equal(decodeHtmlEntities("&#169; 2026"), "© 2026"); // decimal
  assert.equal(decodeHtmlEntities("Navigation 2 &#x2192; 3"), "Navigation 2 → 3"); // hex
});

test("hasUnresolvedNamedEntity는 HTML 4.01/XHTML1 표준 표에도 없는 진짜 예외적인 이름만 감지한다", () => {
  // &checkmark;(U+2713)는 HTML5에서 새로 생긴 이름으로 HTML 4.01/XHTML1 표에는 없다.
  assert.equal(hasUnresolvedNamedEntity(decodeHtmlEntities("A &amp; &checkmark; B")), true);
  assert.equal(hasUnresolvedNamedEntity(decodeHtmlEntities("A &amp; &copy; B")), false);
  assert.equal(hasUnresolvedNamedEntity(decodeHtmlEntities("숫자 참조만 있음 &#169;")), false);
});

test("extractTitle은 표준 표에도 없는 이름이 남으면 그 게시글을 저장하지 않도록 예외를 던진다(재발 방지 최후 안전망)", () => {
  const html = "<title>[공지] 완료 &checkmark; 안내</title>";
  assert.throws(
    () => extractTitle(html, "https://kenel.tistory.com/999"),
    /처리하지 못한 HTML 엔티티가 남아있음.*999.*완료 &checkmark; 안내/s,
  );
});

test("extractTitle은 알려진 엔티티만 있으면 정상적으로 디코딩된 제목을 반환한다(회귀)", () => {
  const html = "<title>[Android] Navigation - Navigation 2 &rarr; 3</title>";
  assert.equal(extractTitle(html, "https://kenel.tistory.com/433"), "[Android] Navigation - Navigation 2 → 3");
});

test("extractPublishedAt은 <span class=\"date\">의 공개 시각을 KST 기준 ISO 문자열로 변환한다(T024, 2026-08-09 kenel.tistory.com 실측 형식)", () => {
  const html = '<div class="box-info"><span class="writer">interfacer_han</span><span class="date">2025. 12. 9. 14:40</span></div>';
  // "2025. 12. 9. 14:40"은 KST(+09:00) 기준이므로 UTC로는 9시간 이전인 05:40.
  assert.equal(extractPublishedAt(html), "2025-12-09T05:40:00.000Z");
});

test("extractPublishedAt은 앞자리 0 없는 한 자리 월·일도 정확히 파싱한다", () => {
  const html = '<span class="date">2026. 8. 7. 22:15</span>';
  assert.equal(extractPublishedAt(html), "2026-08-07T13:15:00.000Z");
});

test("extractPublishedAt은 마크업을 찾지 못하면 null을 반환한다(테마 변경 등, 실행 중단 없음)", () => {
  assert.equal(extractPublishedAt("<html><body>no date here</body></html>"), null);
});

test("extractPublishedAt은 형식이 예상과 다르면 null을 반환한다", () => {
  assert.equal(extractPublishedAt('<span class="date">2025-12-09</span>'), null);
});

test("엔티티가 없는 원문은 그대로 유지한다", () => {
  assert.equal(decodeHtmlEntities("[Kotlin] Coroutines - 기초"), "[Kotlin] Coroutines - 기초");
});

test("여러 엔티티가 섞인 제목도 모두 치환한다", () => {
  assert.equal(decodeHtmlEntities("A&amp;B &lt;C&gt; &quot;D&quot; It&#39;s E"), 'A&B <C> "D" It\'s E');
});

test("filterCandidates는 cutoff보다 lastmod가 최신인 게시글만 남긴다(FR-004)", () => {
  const cutoff = new Date("2026-07-21T14:55:00+09:00");
  const posts = [
    { id: "1", canonicalUrl: "https://kenel.tistory.com/1", lastmod: new Date("2026-07-21T14:00:00+09:00") },
    { id: "2", canonicalUrl: "https://kenel.tistory.com/2", lastmod: new Date("2026-07-21T15:00:00+09:00") },
  ];

  const candidates = filterCandidates(posts, cutoff);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, "2");
});

test("filterCandidates는 cutoff가 null이면(최초 실행) 전체를 후보로 삼는다", () => {
  const posts = [
    { id: "1", canonicalUrl: "https://kenel.tistory.com/1", lastmod: new Date("2020-01-01T00:00:00+09:00") },
  ];

  assert.equal(filterCandidates(posts, null).length, 1);
});

test("selectDriftCandidates는 lastMod가 변하지 않은 게시글은 재조회 후보로 잡지 않는다(FR-005 음성 케이스)", () => {
  const processedPosts = [
    { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초", lastMod: "2026-07-21T05:00:00.000Z" },
  ];
  const sitemapByUrl = new Map([
    ["https://kenel.tistory.com/104", { canonicalUrl: "https://kenel.tistory.com/104", lastmod: new Date("2026-07-21T05:00:00.000Z") }],
  ]);

  const { toRefetch, toMarkDeleted } = selectDriftCandidates(processedPosts, sitemapByUrl);

  assert.deepEqual(toRefetch, []);
  assert.deepEqual(toMarkDeleted, []);
});

test("selectDriftCandidates는 lastMod 필드가 없는 기존 레코드를 항상 후보로 잡는다(변경 여부 불명)", () => {
  const processedPosts = [
    { url: "https://kenel.tistory.com/104", title: "옛 방식 기록" },
  ];
  const sitemapByUrl = new Map([
    ["https://kenel.tistory.com/104", { canonicalUrl: "https://kenel.tistory.com/104", lastmod: new Date("2020-01-01T00:00:00Z") }],
  ]);

  const { toRefetch } = selectDriftCandidates(processedPosts, sitemapByUrl);

  assert.deepEqual(toRefetch, ["https://kenel.tistory.com/104"]);
});

test("selectDriftCandidates는 lastMod 없는 레코드를 회당 상한까지만 후보로 잡는다(마이그레이션 버스트 완화, `/speckit-converge` T022)", () => {
  const total = MAX_UNKNOWN_LASTMOD_REFETCH_PER_RUN + 5; // 상한보다 5건 많게 준비
  const processedPosts = [];
  const sitemapByUrl = new Map();
  for (let i = 0; i < total; i += 1) {
    const url = `https://kenel.tistory.com/${i}`;
    processedPosts.push({ url, title: `제목 ${i}` }); // lastMod 없음 = 마이그레이션 이전 레코드
    sitemapByUrl.set(url, { canonicalUrl: url, lastmod: new Date("2020-01-01T00:00:00Z") });
  }

  const { toRefetch } = selectDriftCandidates(processedPosts, sitemapByUrl);

  assert.equal(toRefetch.length, MAX_UNKNOWN_LASTMOD_REFETCH_PER_RUN);
  // 남은 5건은 이번 실행에서 건너뛰어야 다음 실행에서 처리될 여지가 생긴다.
  assert.deepEqual(toRefetch, processedPosts.slice(0, MAX_UNKNOWN_LASTMOD_REFETCH_PER_RUN).map((r) => r.url));
});

test("selectDriftCandidates는 lastMod가 있는 진짜 드리프트 후보는 상한과 무관하게 모두 포함한다", () => {
  const processedPosts = [];
  const sitemapByUrl = new Map();
  // lastMod 있는(마이그레이션 완료된) 레코드가 상한보다 많아도, 실제로 바뀐 것만 후보가 된다.
  for (let i = 0; i < MAX_UNKNOWN_LASTMOD_REFETCH_PER_RUN + 5; i += 1) {
    const url = `https://kenel.tistory.com/${i}`;
    processedPosts.push({ url, title: `제목 ${i}`, lastMod: "2026-01-01T00:00:00.000Z" });
    sitemapByUrl.set(url, { canonicalUrl: url, lastmod: new Date("2026-02-01T00:00:00Z") }); // 전부 실제로 갱신됨
  }

  const { toRefetch } = selectDriftCandidates(processedPosts, sitemapByUrl);

  assert.equal(toRefetch.length, processedPosts.length); // 상한에 걸리지 않고 전부 포함
});

test("selectDriftCandidates는 sitemap에 없는 URL을 즉시 삭제 확정 대상으로 분류한다(FR-005)", () => {
  const processedPosts = [
    { url: "https://kenel.tistory.com/104", title: "제목", lastMod: "2026-07-21T05:00:00.000Z" },
  ];
  const sitemapByUrl = new Map(); // 이 URL이 더 이상 sitemap에 없음

  const { toRefetch, toMarkDeleted } = selectDriftCandidates(processedPosts, sitemapByUrl);

  assert.deepEqual(toRefetch, []);
  assert.deepEqual(toMarkDeleted, ["https://kenel.tistory.com/104"]);
});

test("selectDriftCandidates는 이미 삭제 확정된 레코드는 두 목록 어디에도 넣지 않는다(FR-013)", () => {
  const processedPosts = [
    { url: "https://kenel.tistory.com/104", title: "제목", deletedAt: "2026-07-25T00:00:00+09:00" },
  ];
  const sitemapByUrl = new Map(); // 여전히 sitemap에 없더라도

  const { toRefetch, toMarkDeleted } = selectDriftCandidates(processedPosts, sitemapByUrl);

  assert.deepEqual(toRefetch, []);
  assert.deepEqual(toMarkDeleted, []);
});

test("buildNewPostCud는 신규 생성 파일과 기존 파일에 항목이 추가된 경우를 구분한다(FR-012, SC-007)", () => {
  const createdFile = { seriesId: "newseries", data: { items: [{}, {}] } }; // 2건
  const appendedFile = { seriesId: "coroutines", data: { items: [{}, {}, {}] } };
  const changedFiles = new Set([createdFile, appendedFile]);
  const appendCountsByFile = new Map([[appendedFile, 2]]); // createdFile은 이 Map에 없음 = 신규 생성

  const cud = buildNewPostCud(changedFiles, appendCountsByFile);

  assert.equal(cud.length, 2);
  assert.deepEqual(
    cud.find((e) => e.seriesId === "newseries"),
    { type: "created", seriesId: "newseries", detail: "2건" },
  );
  assert.deepEqual(
    cud.find((e) => e.seriesId === "coroutines"),
    { type: "updated", seriesId: "coroutines", detail: "항목 추가 2건" },
  );
});

test("buildNewPostCud는 변경된 파일이 없으면 빈 배열을 반환한다", () => {
  assert.deepEqual(buildNewPostCud(new Set(), new Map()), []);
});

test("renderCommitSummary는 CUD 목록을 '- ' 불릿이 붙은 텍스트로 렌더링한다(research.md §6, /speckit-converge T023)", () => {
  const text = renderCommitSummary([
    { type: "created", seriesId: "coroutines", detail: "2건" },
    { type: "updated", seriesId: "flow", detail: "제목 갱신 1건, 항목 추가 1건" },
    { type: "deleted", seriesId: "legacy", detail: "항목 부족으로 파일 삭제" },
  ]);

  assert.equal(
    text,
    [
      "- Created: coroutines_series.json (2건)",
      "- Updated: flow_series.json (제목 갱신 1건, 항목 추가 1건)",
      "- Deleted: legacy_series.json (항목 부족으로 파일 삭제)",
    ].join("\n"),
  );
});
