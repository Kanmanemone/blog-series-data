"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  listSeriesFiles,
  findMatchingFile,
  appendToSeries,
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

test("appendToSeries는 이미 있는 URL이면 건너뛰고 순서를 보존한다(FR-011)", () => {
  const file = {
    filePath: "coroutines_series.json",
    data: {
      listName: "Coroutines",
      items: [{ title: "기초", url: "https://kenel.tistory.com/104" }],
    },
  };

  const changed = appendToSeries(file, { canonicalUrl: "https://kenel.tistory.com/104", title: "다른 제목" });

  assert.equal(changed, false);
  assert.equal(file.data.items.length, 1);
  assert.equal(file.data.items[0].title, "기초");
});

test("appendToSeries는 새 URL을 배열 끝에 추가한다", () => {
  const file = {
    filePath: "coroutines_series.json",
    data: {
      listName: "Coroutines",
      items: [{ title: "기초", url: "https://kenel.tistory.com/104" }],
    },
  };

  const changed = appendToSeries(file, { canonicalUrl: "https://kenel.tistory.com/105", title: "심화" });

  assert.equal(changed, true);
  assert.equal(file.data.items.length, 2);
  assert.equal(file.data.items[1].url, "https://kenel.tistory.com/105");
  assert.equal(file.data.items[0].url, "https://kenel.tistory.com/104"); // 기존 순서 보존
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

test("createSeriesFile은 공유 게시글이 2개 이상이면 발행 순서대로 생성한다(FR-012, FR-013)", () => {
  const siblings = [
    {
      canonicalUrl: "https://kenel.tistory.com/201",
      title: "[NewSeries] 두번째",
      lastmod: new Date("2026-07-02T00:00:00+09:00"),
      rawSeriesName: "NewSeries",
    },
    {
      canonicalUrl: "https://kenel.tistory.com/200",
      title: "[NewSeries] 첫번째",
      lastmod: new Date("2026-07-01T00:00:00+09:00"),
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
