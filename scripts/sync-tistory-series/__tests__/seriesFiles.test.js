"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  listSeriesFiles,
  findMatchingFile,
  findSeriesIdForUrl,
  orderByPublishedAt,
  appendBatch,
  retitleItem,
  removeItem,
  collectSiblingCandidates,
  createSeriesFile,
} = require("../seriesFiles.js");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "series-files-test-"));
}

test("루트의 *_series.json만 seriesId로 목록화한다(FR-010)", () => {
  const root = makeTempRoot();
  try {
    fs.writeFileSync(
      path.join(root, "coroutines_series.json"),
      JSON.stringify({ listName: "Coroutines", items: [] }),
    );
    fs.writeFileSync(path.join(root, "index.html"), "<html></html>");

    const files = listSeriesFiles(root);

    assert.equal(files.length, 1);
    assert.equal(files[0].seriesId, "coroutines");
    assert.equal(files[0].data.listName, "Coroutines");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("seriesId가 일치하는 파일을 찾는다", () => {
  const root = makeTempRoot();
  try {
    fs.writeFileSync(
      path.join(root, "coroutines_series.json"),
      JSON.stringify({ listName: "Coroutines", items: [] }),
    );

    const files = listSeriesFiles(root);

    assert.notEqual(findMatchingFile(files, "coroutines"), null);
    assert.equal(findMatchingFile(files, "nomatch"), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const url = (id) => `https://kenel.tistory.com/${id}`;
const makeFile = (ids) => ({
  seriesId: "coroutines",
  filePath: "coroutines_series.json",
  data: { listName: "Coroutines", items: ids.map((id) => ({ title: `T${id}`, url: url(id) })) },
});

test("findSeriesIdForUrl은 url을 포함한 파일의 seriesId를 찾는다", () => {
  const files = [makeFile([104])];
  assert.equal(findSeriesIdForUrl(files, url(104)), "coroutines");
  assert.equal(findSeriesIdForUrl(files, url(999)), null);
});

test("appendBatch는 이미 있는 URL은 건너뛰고 기존 항목 순서를 보존한다(005 FR-002)", () => {
  // 관리자가 공개 시각과 다르게 바꿔 둔 순서 [105, 104]
  const file = makeFile([105, 104]);

  const appended = appendBatch(file, [{ canonicalUrl: url(104), title: "다른 제목", publishedAt: null }]);

  assert.equal(appended, 0);
  assert.deepEqual(file.data.items.map((i) => i.title), ["T105", "T104"]);
});

test("appendBatch는 새 글 묶음을 그 안에서만 공개 시각 순으로 정렬해 끝에 붙인다(005 FR-003)", () => {
  const file = makeFile([105, 104]);

  const appended = appendBatch(file, [
    { canonicalUrl: url(301), title: "늦게 공개", publishedAt: "2026-10-02T00:00:00.000Z" },
    { canonicalUrl: url(302), title: "공개 시각 모름", publishedAt: null },
    { canonicalUrl: url(300), title: "일찍 공개", publishedAt: "2026-10-01T00:00:00.000Z" },
  ]);

  assert.equal(appended, 3);
  assert.deepEqual(file.data.items.map((i) => i.url), [url(105), url(104), url(300), url(301), url(302)]);
});

test("retitleItem은 같은 위치에서 제목만 바꾸고, 같거나 없으면 false를 반환한다", () => {
  const file = makeFile([105, 104, 106]);

  assert.equal(retitleItem(file, url(104), "새 제목"), true);
  assert.deepEqual(file.data.items.map((i) => i.title), ["T105", "새 제목", "T106"]);
  assert.equal(retitleItem(file, url(104), "새 제목"), false);
  assert.equal(retitleItem(file, url(999), "x"), false);
});

test("removeItem은 항목을 빼고 나머지 상대 순서를 유지하며, 없으면 false를 반환한다", () => {
  const file = makeFile([105, 104, 106]);

  assert.equal(removeItem(file, url(104)), true);
  assert.deepEqual(file.data.items.map((i) => i.url), [url(105), url(106)]);
  assert.equal(removeItem(file, url(104)), false);
});

test("orderByPublishedAt은 공개 시각 오름차순, 모르는 글은 뒤로, 같으면 입력 순서를 유지하고 원본을 바꾸지 않는다", () => {
  const posts = [
    { id: "a", publishedAt: null },
    { id: "b", publishedAt: "2026-10-02T00:00:00.000Z" },
    { id: "c", publishedAt: "2026-10-01T00:00:00.000Z" },
    { id: "d", publishedAt: "2026-10-02T00:00:00.000Z" },
    { id: "e", publishedAt: undefined },
  ];

  assert.deepEqual(orderByPublishedAt(posts).map((p) => p.id), ["c", "b", "d", "a", "e"]);
  assert.deepEqual(posts.map((p) => p.id), ["a", "b", "c", "d", "e"]);
});

test("createSeriesFile은 공유 게시글이 1개면 생성하지 않는다(FR-012, SC-005)", () => {
  const siblings = [
    {
      canonicalUrl: "https://kenel.tistory.com/200",
      title: "[NewSeries] 첫 글",
      lastmod: new Date("2026-07-01T00:00:00+09:00"),
      rawSeriesName: "NewSeries",
    },
  ];

  assert.equal(createSeriesFile("newseries", siblings), null);
});

test("createSeriesFile은 공유 게시글이 2개 이상이면 공개 시각 순으로 생성하고 lastmod와 무관하다(FR-012, FR-013, 005 FR-003)", () => {
  const siblings = [
    {
      canonicalUrl: "https://kenel.tistory.com/201",
      title: "[NewSeries] 두번째",
      lastmod: new Date("2026-07-02T00:00:00+09:00"),
      publishedAt: "2026-06-02T00:00:00.000Z",
      rawSeriesName: "NewSeries",
    },
    {
      canonicalUrl: "https://kenel.tistory.com/200",
      title: "[NewSeries] 첫번째",
      // 예전에 공개했지만 최근에 수정 — 005 이전(lastmod 정렬)에는 뒤로 갔다.
      lastmod: new Date("2026-07-09T00:00:00+09:00"),
      publishedAt: "2026-06-01T00:00:00.000Z",
      rawSeriesName: "NewSeries",
    },
  ];

  const file = createSeriesFile("newseries", siblings);

  assert.notEqual(file, null);
  assert.equal(file.seriesId, "newseries");
  assert.match(file.filePath, /newseries_series\.json$/);
  assert.equal(file.data.listName, "NewSeries");
  assert.deepEqual(file.data.items, [
    { title: "[NewSeries] 첫번째", url: "https://kenel.tistory.com/200" },
    { title: "[NewSeries] 두번째", url: "https://kenel.tistory.com/201" },
  ]);
});

test("collectSiblingCandidates는 과거 이력 중 지금도 공개된 것만 형제로 합산한다(FR-012)", () => {
  const thisRunSiblings = [
    { canonicalUrl: "https://kenel.tistory.com/300", lastmod: new Date("2026-07-10T00:00:00+09:00") },
  ];
  const processedPosts = [
    { url: "https://kenel.tistory.com/299", rawSeriesName: "NewSeries", processedAt: "2026-06-01T00:00:00+09:00" },
    { url: "https://kenel.tistory.com/298", rawSeriesName: "OtherSeries", processedAt: "2026-06-01T00:00:00+09:00" },
    { url: "https://kenel.tistory.com/297", rawSeriesName: "NewSeries", processedAt: "2026-06-01T00:00:00+09:00" },
  ];
  const allSitemapPosts = [
    { id: "300", canonicalUrl: "https://kenel.tistory.com/300", lastmod: new Date("2026-07-10T00:00:00+09:00") },
    { id: "299", canonicalUrl: "https://kenel.tistory.com/299", lastmod: new Date("2026-06-01T00:00:00+09:00") },
    // 297은 삭제·비공개로 전환되어 더 이상 sitemap에 없다고 가정 — allSitemapPosts에서 제외
  ];

  const { historicalOnlyRefs } = collectSiblingCandidates(
    "newseries",
    thisRunSiblings,
    processedPosts,
    allSitemapPosts,
  );

  assert.equal(historicalOnlyRefs.length, 1);
  assert.equal(historicalOnlyRefs[0].canonicalUrl, "https://kenel.tistory.com/299");
});

test("collectSiblingCandidates는 002가 확장한 title 전용 레코드에서도 rawSeriesName을 다시 추출해 인식한다", () => {
  const thisRunSiblings = [
    { canonicalUrl: "https://kenel.tistory.com/300", lastmod: new Date("2026-07-10T00:00:00+09:00") },
  ];
  // 002-post-drift-detection 배포 이후 기록된 레코드는 rawSeriesName 대신 title을 갖는다.
  const processedPosts = [
    { url: "https://kenel.tistory.com/299", title: "NewSeries - 이전 글", lastMod: "2026-06-01T00:00:00.000Z", processedAt: "2026-06-01T00:00:00+09:00" },
    { url: "https://kenel.tistory.com/298", title: "OtherSeries - 이전 글", lastMod: "2026-06-01T00:00:00.000Z", processedAt: "2026-06-01T00:00:00+09:00" },
    // 삭제 확정된 레코드는 형제로 세지 않는다.
    { url: "https://kenel.tistory.com/296", title: "NewSeries - 삭제된 글", lastMod: "2026-06-01T00:00:00.000Z", processedAt: "2026-06-01T00:00:00+09:00", deletedAt: "2026-07-01T00:00:00+09:00" },
  ];
  const allSitemapPosts = [
    { id: "300", canonicalUrl: "https://kenel.tistory.com/300", lastmod: new Date("2026-07-10T00:00:00+09:00") },
    { id: "299", canonicalUrl: "https://kenel.tistory.com/299", lastmod: new Date("2026-06-01T00:00:00+09:00") },
    { id: "296", canonicalUrl: "https://kenel.tistory.com/296", lastmod: new Date("2026-06-01T00:00:00+09:00") },
  ];

  const { historicalOnlyRefs } = collectSiblingCandidates(
    "newseries",
    thisRunSiblings,
    processedPosts,
    allSitemapPosts,
  );

  assert.equal(historicalOnlyRefs.length, 1);
  assert.equal(historicalOnlyRefs[0].canonicalUrl, "https://kenel.tistory.com/299");
  assert.equal(historicalOnlyRefs[0].rawSeriesName, "NewSeries");
});
