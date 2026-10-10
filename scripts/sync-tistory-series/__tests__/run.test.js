"use strict";

// 004-fix-edited-title-sync: 신규 게시글 흐름(001)과 드리프트 감지(002)가 한 실행
// 안에서 맞물리며 생긴 버그는 각 함수의 단위 테스트로는 재현되지 않았다(기존 테스트가
// 전부 통과하는 상태에서 발생). 그래서 run()을 실제로 돌린다 — 임시 디렉터리를 작업
// 디렉터리로 쓰고, 전역 fetch를 sitemap/게시글 HTML 고정 응답으로 바꾼다.
// index.js의 COMMIT_SUMMARY_PATH는 require 시점의 process.cwd()로 계산되므로,
// chdir을 require보다 먼저 해야 한다. node --test는 테스트 파일마다 별도 프로세스로
// 실행하므로 이 chdir이 다른 테스트 파일에 영향을 주지 않는다.
// 005-drop-series-assignments: 배치 결정 파일이 없어졌으므로 모든 검증은 목차 파일
// 결과로만 하고, 실행이 배치 결정 파일을 만들지 않는지도 매번 확인한다.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-run-test-"));
process.chdir(workDir);

const { run } = require("../index.js");

const SITEMAP_URL = "https://kenel.tistory.com/sitemap.xml";
const STATE_PATH = path.join(workDir, ".github", "sync-state.json");
const SUMMARY_PATH = path.join(workDir, ".sync-commit-summary.txt");
const DEFAULT_PAGE_DATE = "2026. 8. 25. 15:47";

function resetWorkDir() {
  for (const entry of fs.readdirSync(workDir)) {
    fs.rmSync(path.join(workDir, entry), { recursive: true, force: true });
  }
  fs.mkdirSync(path.join(workDir, ".github"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function seriesPath(seriesId) {
  return path.join(workDir, `${seriesId}_series.json`);
}

function readUrls(seriesId) {
  return readJson(seriesPath(seriesId)).items.map((i) => i.url);
}

function readSummary() {
  return fs.readFileSync(SUMMARY_PATH, "utf8");
}

function assertNoAssignmentsFile() {
  assert.ok(!fs.existsSync(path.join(workDir, ".github", "series-assignments.json")), "배치 결정 파일이 생김");
}

// ISO 시각을 게시글 페이지의 공개 시각 표기("YYYY. M. D. HH:MM", KST)로 바꾼다.
function pageDate(iso) {
  const kst = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}. ${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
}

/**
 * 전역 fetch를 고정 응답으로 바꾼다. posts는 `{ [url]: { lastmod, title, publishedAt? } }`이며,
 * sitemap 응답은 posts 전체로, 게시글 응답은 `<title>`과 공개 시각
 * `<span class="date">`(publishedAt이 없으면 DEFAULT_PAGE_DATE)로 만든다. 게시글 URL별
 * 조회 횟수를 반환해 "같은 게시글을 두 번 조회하지 않는다"(004 SC-004)를 확인할 수 있게 한다.
 */
function mockFetch(posts) {
  const fetchCounts = {};
  globalThis.fetch = async (url) => {
    if (url === SITEMAP_URL) {
      const urls = Object.entries(posts)
        .map(([postUrl, post]) => `<url><loc>${postUrl}</loc><lastmod>${post.lastmod}</lastmod></url>`)
        .join("");
      return { ok: true, status: 200, text: async () => `<urlset>${urls}</urlset>` };
    }
    const post = posts[url];
    if (!post) return { ok: false, status: 404, text: async () => "" };
    fetchCounts[url] = (fetchCounts[url] ?? 0) + 1;
    const date = post.publishedAt ? pageDate(post.publishedAt) : DEFAULT_PAGE_DATE;
    const html = `<html><head><title>${post.title}</title></head><body><span class="date">${date}</span></body></html>`;
    return { ok: true, status: 200, text: async () => html };
  };
  return fetchCounts;
}

function inOneHour() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

const u = (id) => `https://kenel.tistory.com/${id}`;
const OLD_LASTMOD = "2026-09-01T00:00:00.000Z";
const CUTOFF = "2026-10-01T00:00:00+09:00";
const AFTER_CUTOFF = "2026-10-05T00:00:00.000Z";

// 처리 이력 레코드. lastMod를 sitemap lastmod와 같게 두면 드리프트 후보가 아니다.
function record(url, title, publishedAt, lastMod = OLD_LASTMOD) {
  return { url, title, lastMod, publishedAt, processedAt: "2026-09-01T09:00:00+09:00" };
}

const URL_400 = u(400);
const URL_427 = u(427);
const URL_435 = u(435);
const OLD_435 = "Swemo - Iteration 8: Label과 Text 분리";
const NEW_435 = "Swemo - Iteration 8: Bulleted List 구현";
const TITLE_427 = "Swemo - Iteration 7: 점검과 정리 1";

test("이미 목차에 있는 게시글의 제목이 바뀌고 lastmod가 커트라인 이후면, 같은 실행에서 목차 제목이 갱신된다(004 US1, 2026-10-08 실측 재현)", async () => {
  resetWorkDir();
  writeJson(STATE_PATH, {
    cutoff: "2026-10-07T13:48:30+09:00",
    processedPosts: [
      record(URL_427, TITLE_427, "2026-08-01T00:00:00.000Z"),
      record(URL_435, OLD_435, "2026-08-25T06:47:00.000Z", "2026-10-07T03:30:05.000Z"),
    ],
  });
  writeJson(seriesPath("swemo"), {
    listName: "Swemo",
    items: [
      { title: TITLE_427, url: URL_427 },
      { title: OLD_435, url: URL_435 },
    ],
  });

  const fetchCounts = mockFetch({
    [URL_427]: { lastmod: OLD_LASTMOD, title: TITLE_427 },
    [URL_435]: { lastmod: "2026-10-08T04:41:00.000Z", title: NEW_435 },
  });

  await run();

  const file = readJson(seriesPath("swemo"));
  assert.equal(file.items.find((i) => i.url === URL_435).title, NEW_435);
  const summary = readSummary();
  assert.match(summary, /제목 갱신: 1건/);
  assert.doesNotMatch(summary, /정보 갱신/);
  assert.equal(fetchCounts[URL_435], 1);
  assertNoAssignmentsFile();
});

test("신규 게시글 흐름이 기존 목차에 추가한 항목은 다음 실행에서 같은 목차의 다른 글이 바뀌어도 남아 있다(004 US2, swemo 435 사례)", async () => {
  resetWorkDir();
  const TITLE_400 = "Swemo - Iteration 6: MVP 1 구현 (3/3)";
  writeJson(STATE_PATH, {
    cutoff: "2026-08-25T03:36:50+09:00",
    processedPosts: [
      record(URL_400, TITLE_400, "2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"),
      record(URL_427, TITLE_427, "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"),
    ],
  });
  writeJson(seriesPath("swemo"), {
    listName: "Swemo",
    items: [
      { title: TITLE_400, url: URL_400 },
      { title: TITLE_427, url: URL_427 },
    ],
  });

  const posts = {
    [URL_400]: { lastmod: "2026-08-01T00:00:00.000Z", title: TITLE_400 },
    [URL_427]: { lastmod: "2026-08-01T00:00:00.000Z", title: TITLE_427 },
    [URL_435]: { lastmod: "2026-08-25T06:50:06.000Z", title: OLD_435 },
  };
  mockFetch(posts);
  await run();

  assert.deepEqual(readUrls("swemo"), [URL_400, URL_427, URL_435]);
  assert.match(readSummary(), /항목 추가: 1건/);

  // 2차 실행: 같은 시리즈의 다른 게시글(427) 제목이 바뀐다.
  const renamed427 = "Swemo - Iteration 7: 점검과 정리";
  mockFetch({ ...posts, [URL_427]: { lastmod: inOneHour(), title: renamed427 } });
  await run();

  const file = readJson(seriesPath("swemo"));
  assert.deepEqual(file.items.map((i) => i.url), [URL_400, URL_427, URL_435], "신규 흐름으로 추가된 435가 사라지거나 순서가 바뀜");
  assert.equal(file.items.find((i) => i.url === URL_427).title, renamed427);
  assertNoAssignmentsFile();
});

test("신규 게시글 흐름이 처리 이력의 형제와 함께 새 목차 파일을 만든다(004 US2 시나리오 2)", async () => {
  resetWorkDir();
  writeJson(STATE_PATH, {
    cutoff: CUTOFF,
    processedPosts: [record(u(500), "Foo - 1화", "2026-09-01T00:00:00.000Z")],
  });

  mockFetch({
    [u(500)]: { lastmod: OLD_LASTMOD, title: "Foo - 1화" },
    [u(501)]: { lastmod: AFTER_CUTOFF, title: "Foo - 2화", publishedAt: "2026-10-04T00:00:00.000Z" },
  });
  await run();

  const file = readJson(seriesPath("foo"));
  assert.equal(file.listName, "Foo");
  assert.deepEqual(file.items.map((i) => i.url), [u(500), u(501)]);
  assert.match(readSummary(), /생성: 1건/);
  assertNoAssignmentsFile();
});

test("이미 목차에 있는 게시글이 다른 기존 시리즈로 이름이 바뀌면 옮겨진 목차에만 남고, 본문만 수정된 게시글은 그대로다(004 US1 시나리오 2·3)", async () => {
  resetWorkDir();
  const swemoItems = [
    { title: "Swemo - Iteration 6: MVP 1 구현 (3/3)", url: URL_400 },
    { title: TITLE_427, url: URL_427 },
    { title: OLD_435, url: URL_435 },
  ];
  const flowItems = [
    { title: "Flow - 기초", url: u(600) },
    { title: "Flow - 심화", url: u(601) },
  ];
  const allItems = [...swemoItems, ...flowItems];
  writeJson(STATE_PATH, { cutoff: CUTOFF, processedPosts: allItems.map((i) => record(i.url, i.title, "2026-08-01T00:00:00.000Z")) });
  writeJson(seriesPath("swemo"), { listName: "Swemo", items: swemoItems });
  writeJson(seriesPath("flow"), { listName: "Flow", items: flowItems });

  const posts = Object.fromEntries(allItems.map((i) => [i.url, { lastmod: OLD_LASTMOD, title: i.title }]));
  const renamed435 = "Flow - 셋째";
  posts[URL_435] = { lastmod: AFTER_CUTOFF, title: renamed435 }; // 다른 기존 시리즈로 이름 변경
  posts[URL_427] = { lastmod: AFTER_CUTOFF, title: TITLE_427 }; // 본문만 수정
  mockFetch(posts);
  await run();

  const swemo = readJson(seriesPath("swemo"));
  const flow = readJson(seriesPath("flow"));
  assert.deepEqual(swemo.items, swemoItems.slice(0, 2), "본문만 수정된 427을 포함한 swemo 나머지 항목이 그대로여야 함");
  assert.deepEqual(flow.items, [...flowItems, { title: renamed435, url: URL_435 }]);
  assertNoAssignmentsFile();
});

test("관리자가 바꾼 목차 순서는 새 글 추가·제목 변경·재분류·삭제를 거쳐도 유지된다(005 US1)", async () => {
  resetWorkDir();
  // 공개 시각은 A < B < C인데 관리자가 [C, A, B]로 바꿔 둔 상태.
  const [A, B, C, D, F1, F2] = [u(701), u(702), u(703), u(704), u(801), u(802)];
  const titles = { [A]: "Swemo - A", [B]: "Swemo - B", [C]: "Swemo - C", [F1]: "Flow - 1", [F2]: "Flow - 2" };
  const published = {
    [A]: "2026-07-01T00:00:00.000Z",
    [B]: "2026-07-02T00:00:00.000Z",
    [C]: "2026-07-03T00:00:00.000Z",
    [F1]: "2026-06-01T00:00:00.000Z",
    [F2]: "2026-06-02T00:00:00.000Z",
  };
  writeJson(STATE_PATH, {
    cutoff: CUTOFF,
    processedPosts: Object.keys(titles).map((url) => record(url, titles[url], published[url])),
  });
  writeJson(seriesPath("swemo"), { listName: "Swemo", items: [C, A, B].map((url) => ({ title: titles[url], url })) });
  writeJson(seriesPath("flow"), { listName: "Flow", items: [F1, F2].map((url) => ({ title: titles[url], url })) });
  // 005 이전 구조가 남긴 배치 결정 파일(관리자가 순서를 바꾸기 전의 [A, B, C] 순서). 005 이전
  // 코드는 이 순서로 목차를 다시 써서 관리자 순서를 되돌렸다. 이제는 읽지도 쓰지도 않아야 한다
  // (spec Edge Cases).
  const leftoverAssignments = {
    swemo: { listName: "Swemo", posts: [A, B, C].map((url) => ({ url, title: titles[url] })) },
    flow: { listName: "Flow", posts: [F1, F2].map((url) => ({ url, title: titles[url] })) },
  };
  const assignmentsPath = path.join(workDir, ".github", "series-assignments.json");
  writeJson(assignmentsPath, leftoverAssignments);

  const posts = Object.fromEntries(
    Object.keys(titles).map((url) => [url, { lastmod: OLD_LASTMOD, title: titles[url], publishedAt: published[url] }]),
  );

  // 1차: 새 글 D가 들어오고 A의 제목이 바뀐다.
  posts[D] = { lastmod: AFTER_CUTOFF, title: "Swemo - D", publishedAt: "2026-10-04T00:00:00.000Z" };
  posts[A] = { ...posts[A], lastmod: AFTER_CUTOFF, title: "Swemo - A(개정)" };
  mockFetch(posts);
  await run();
  const swemo1 = readJson(seriesPath("swemo")).items;
  assert.deepEqual(swemo1.map((i) => i.url), [C, A, B, D]);
  assert.equal(swemo1[1].title, "Swemo - A(개정)");

  // 2차: B가 다른 기존 시리즈 flow로 재분류된다.
  posts[B] = { ...posts[B], lastmod: inOneHour(), title: "Flow - B" };
  mockFetch(posts);
  await run();
  assert.deepEqual(readUrls("swemo"), [C, A, D]);
  assert.deepEqual(readUrls("flow"), [F1, F2, B]);

  // 3차: A가 삭제·비공개된다(sitemap에서 사라짐).
  delete posts[A];
  mockFetch(posts);
  await run();
  assert.deepEqual(readUrls("swemo"), [C, D]);
  assert.deepEqual(readJson(assignmentsPath), leftoverAssignments, "남아 있던 배치 결정 파일을 고침");
});

test("새 시리즈로 혼자 옮겨가는 글은 옛 목차에 남아 제목만 갱신된다(005 US2 시나리오 2)", async () => {
  resetWorkDir();
  const [S1, S2] = [u(901), u(902)];
  writeJson(STATE_PATH, {
    cutoff: CUTOFF,
    processedPosts: [record(S1, "Swemo - 1", "2026-07-01T00:00:00.000Z"), record(S2, "Swemo - 2", "2026-07-02T00:00:00.000Z")],
  });
  writeJson(seriesPath("swemo"), {
    listName: "Swemo",
    items: [
      { title: "Swemo - 1", url: S1 },
      { title: "Swemo - 2", url: S2 },
    ],
  });
  mockFetch({
    [S1]: { lastmod: AFTER_CUTOFF, title: "Newx - 1" },
    [S2]: { lastmod: OLD_LASTMOD, title: "Swemo - 2" },
  });
  await run();

  assert.deepEqual(readJson(seriesPath("swemo")).items, [
    { title: "Newx - 1", url: S1 },
    { title: "Swemo - 2", url: S2 },
  ]);
  assert.ok(!fs.existsSync(seriesPath("newx")));
  assert.match(readSummary(), /제목 갱신: 1건/);
  assertNoAssignmentsFile();
});

test("같은 실행에서 두 글이 같은 새 시리즈로 옮겨가면 새 목차가 공개 시각 순으로 생기고 옛 목차에서 빠진다(005 US2 시나리오 3)", async () => {
  resetWorkDir();
  const [S1, S2, S3, F1, F2, F3] = [u(911), u(912), u(913), u(921), u(922), u(923)];
  const titles = { [S1]: "Swemo - 1", [S2]: "Swemo - 2", [S3]: "Swemo - 3", [F1]: "Flow - 1", [F2]: "Flow - 2", [F3]: "Flow - 3" };
  const published = { [S1]: "2026-07-05T00:00:00.000Z", [F1]: "2026-07-01T00:00:00.000Z" };
  writeJson(STATE_PATH, {
    cutoff: CUTOFF,
    processedPosts: Object.keys(titles).map((url) => record(url, titles[url], published[url] ?? "2026-06-01T00:00:00.000Z")),
  });
  writeJson(seriesPath("swemo"), { listName: "Swemo", items: [S1, S2, S3].map((url) => ({ title: titles[url], url })) });
  writeJson(seriesPath("flow"), { listName: "Flow", items: [F1, F2, F3].map((url) => ({ title: titles[url], url })) });

  const posts = Object.fromEntries(Object.keys(titles).map((url) => [url, { lastmod: OLD_LASTMOD, title: titles[url] }]));
  posts[S1] = { lastmod: AFTER_CUTOFF, title: "Bar - 나중", publishedAt: published[S1] };
  posts[F1] = { lastmod: AFTER_CUTOFF, title: "Bar - 먼저", publishedAt: published[F1] };
  mockFetch(posts);
  await run();

  const bar = readJson(seriesPath("bar"));
  assert.equal(bar.listName, "Bar");
  assert.deepEqual(bar.items.map((i) => i.url), [F1, S1]);
  assert.deepEqual(readUrls("swemo"), [S2, S3]);
  assert.deepEqual(readUrls("flow"), [F2, F3]);
  const summary = readSummary();
  assert.match(summary, /생성: 1건/);
  assert.match(summary, /항목 제거: 2건/);
  assertNoAssignmentsFile();
});

test("항목 2개인 목차에서 하나가 삭제되면 파일이 지워지고 '시리즈 - 삭제'로만 집계된다(005 US2 시나리오 4)", async () => {
  resetWorkDir();
  const [T1, T2] = [u(931), u(932)];
  writeJson(STATE_PATH, {
    cutoff: CUTOFF,
    processedPosts: [record(T1, "Two - 1", "2026-07-01T00:00:00.000Z"), record(T2, "Two - 2", "2026-07-02T00:00:00.000Z")],
  });
  writeJson(seriesPath("two"), {
    listName: "Two",
    items: [
      { title: "Two - 1", url: T1 },
      { title: "Two - 2", url: T2 },
    ],
  });
  mockFetch({ [T2]: { lastmod: OLD_LASTMOD, title: "Two - 2" } }); // T1은 sitemap에서 사라짐
  await run();

  assert.ok(!fs.existsSync(seriesPath("two")));
  const summary = readSummary();
  assert.equal(summary, "1\n- 시리즈\n  - 삭제: 1건\n");
  assertNoAssignmentsFile();
});

test("한 번에 같은 목차에 붙는 새 글들은 그 묶음 안에서만 공개 시각 순이다(005 US3 시나리오 1)", async () => {
  resetWorkDir();
  const [S1, S2, X, Y] = [u(941), u(942), u(943), u(944)];
  writeJson(STATE_PATH, {
    cutoff: CUTOFF,
    // 기존 항목 S2가 공개 시각으로는 S1보다 이르지만, 목차 순서 [S1, S2]가 유지돼야 한다.
    processedPosts: [record(S1, "Swemo - 1", "2026-07-02T00:00:00.000Z"), record(S2, "Swemo - 2", "2026-07-01T00:00:00.000Z")],
  });
  writeJson(seriesPath("swemo"), {
    listName: "Swemo",
    items: [
      { title: "Swemo - 1", url: S1 },
      { title: "Swemo - 2", url: S2 },
    ],
  });
  mockFetch({
    [S1]: { lastmod: OLD_LASTMOD, title: "Swemo - 1" },
    [S2]: { lastmod: OLD_LASTMOD, title: "Swemo - 2" },
    // sitemap에는 X가 Y보다 먼저 나오지만 공개는 Y가 이르다. 둘 다 기존 항목보다 이르게 공개.
    [X]: { lastmod: AFTER_CUTOFF, title: "Swemo - X", publishedAt: "2026-06-20T00:00:00.000Z" },
    [Y]: { lastmod: AFTER_CUTOFF, title: "Swemo - Y", publishedAt: "2026-06-10T00:00:00.000Z" },
  });
  await run();

  assert.deepEqual(readUrls("swemo"), [S1, S2, Y, X]);
  assertNoAssignmentsFile();
});

test("새 목차는 마지막 수정 시각이 아니라 공개 시각 순으로 만들어진다(005 US3 시나리오 2)", async () => {
  resetWorkDir();
  const [P, Q] = [u(951), u(952)];
  // P: 처리 이력에만 있던 형제(공개 7/1, 수정 9/1). Q: 새 글(공개 6/1로 과거 설정, 수정 10/5).
  writeJson(STATE_PATH, { cutoff: CUTOFF, processedPosts: [record(P, "Foo - P", "2026-07-01T00:00:00.000Z")] });
  mockFetch({
    [P]: { lastmod: OLD_LASTMOD, title: "Foo - P" },
    [Q]: { lastmod: AFTER_CUTOFF, title: "Foo - Q", publishedAt: "2026-06-01T00:00:00.000Z" },
  });
  await run();

  assert.deepEqual(readUrls("foo"), [Q, P]);
  assertNoAssignmentsFile();
});

test("처리 이력이 없는(수동 추가) 목차 항목의 제목이 바뀌면 그 자리에서 제목만 바뀌고 다른 목차에 추가되지 않는다(005 US4)", async () => {
  resetWorkDir();
  const [S1, M, F1, F2] = [u(961), u(962), u(971), u(972)];
  writeJson(STATE_PATH, {
    cutoff: CUTOFF,
    processedPosts: [
      record(S1, "Swemo - 1", "2026-07-01T00:00:00.000Z"),
      record(F1, "Flow - 1", "2026-07-01T00:00:00.000Z"),
      record(F2, "Flow - 2", "2026-07-02T00:00:00.000Z"),
    ],
  });
  writeJson(seriesPath("swemo"), {
    listName: "Swemo",
    items: [
      { title: "Swemo - M", url: M },
      { title: "Swemo - 1", url: S1 },
    ],
  });
  writeJson(seriesPath("flow"), {
    listName: "Flow",
    items: [
      { title: "Flow - 1", url: F1 },
      { title: "Flow - 2", url: F2 },
    ],
  });
  mockFetch({
    [S1]: { lastmod: OLD_LASTMOD, title: "Swemo - 1" },
    [F1]: { lastmod: OLD_LASTMOD, title: "Flow - 1" },
    [F2]: { lastmod: OLD_LASTMOD, title: "Flow - 2" },
    [M]: { lastmod: AFTER_CUTOFF, title: "Flow - M" },
  });
  await run();

  assert.deepEqual(readJson(seriesPath("swemo")).items, [
    { title: "Flow - M", url: M },
    { title: "Swemo - 1", url: S1 },
  ]);
  assert.deepEqual(readUrls("flow"), [F1, F2]);
  assert.match(readSummary(), /제목 갱신: 1건/);
  assertNoAssignmentsFile();
});

test("재분류 보류로 옛 목차에 남아 있던 글은 새 글과 함께 새 목차가 생길 때 옮겨져 두 목차에 동시에 있지 않다(005 SC-004)", async () => {
  resetWorkDir();
  const [S1, S2, H, N] = [u(981), u(982), u(983), u(984)];
  // H는 이전 실행에서 "Newx - 1"로 이름이 바뀌었지만 newx가 1개뿐이라 swemo에 남아 있다(002 시나리오 5).
  writeJson(STATE_PATH, {
    cutoff: CUTOFF,
    processedPosts: [
      record(S1, "Swemo - 1", "2026-07-01T00:00:00.000Z"),
      record(S2, "Swemo - 2", "2026-07-02T00:00:00.000Z"),
      record(H, "Newx - 1", "2026-07-03T00:00:00.000Z"),
    ],
  });
  writeJson(seriesPath("swemo"), {
    listName: "Swemo",
    items: [
      { title: "Swemo - 1", url: S1 },
      { title: "Newx - 1", url: H },
      { title: "Swemo - 2", url: S2 },
    ],
  });
  mockFetch({
    [S1]: { lastmod: OLD_LASTMOD, title: "Swemo - 1" },
    [S2]: { lastmod: OLD_LASTMOD, title: "Swemo - 2" },
    [H]: { lastmod: OLD_LASTMOD, title: "Newx - 1" },
    [N]: { lastmod: AFTER_CUTOFF, title: "Newx - 2", publishedAt: "2026-10-04T00:00:00.000Z" },
  });
  await run();

  assert.deepEqual(readUrls("newx"), [H, N]);
  assert.deepEqual(readUrls("swemo"), [S1, S2]);
  const summary = readSummary();
  assert.match(summary, /생성: 1건/);
  assert.match(summary, /항목 제거: 1건/);
  assertNoAssignmentsFile();
});
