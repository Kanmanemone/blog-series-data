"use strict";

// 004-fix-edited-title-sync: 신규 게시글 흐름(001)과 드리프트 감지(002)가 한 실행
// 안에서 맞물리며 생긴 버그는 각 함수의 단위 테스트로는 재현되지 않았다(기존 테스트가
// 전부 통과하는 상태에서 발생). 그래서 run()을 실제로 돌린다 — 임시 디렉터리를 작업
// 디렉터리로 쓰고, 전역 fetch를 sitemap/게시글 HTML 고정 응답으로 바꾼다.
// index.js의 COMMIT_SUMMARY_PATH는 require 시점의 process.cwd()로 계산되므로,
// chdir을 require보다 먼저 해야 한다. node --test는 테스트 파일마다 별도 프로세스로
// 실행하므로 이 chdir이 다른 테스트 파일에 영향을 주지 않는다.

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
const ASSIGNMENTS_PATH = path.join(workDir, ".github", "series-assignments.json");
const SUMMARY_PATH = path.join(workDir, ".sync-commit-summary.txt");

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

/**
 * 전역 fetch를 고정 응답으로 바꾼다. posts는 `{ [url]: { lastmod, title } }`이며,
 * sitemap 응답은 posts 전체로, 게시글 응답은 `<title>`과 공개 시각
 * `<span class="date">`(extractPublishedAt 형식)로 만든다. 게시글 URL별 조회 횟수를
 * 반환해 "같은 게시글을 두 번 조회하지 않는다"(spec SC-004)를 확인할 수 있게 한다.
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
    const html = `<html><head><title>${post.title}</title></head><body><span class="date">2026. 8. 25. 15:47</span></body></html>`;
    return { ok: true, status: 200, text: async () => html };
  };
  return fetchCounts;
}

function inOneHour() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

const URL_400 = "https://kenel.tistory.com/400";
const URL_427 = "https://kenel.tistory.com/427";
const URL_435 = "https://kenel.tistory.com/435";
const OLD_435 = "Swemo - Iteration 8: Label과 Text 분리";
const NEW_435 = "Swemo - Iteration 8: Bulleted List 구현";
const TITLE_427 = "Swemo - Iteration 7: 점검과 정리 1";

test("이미 목차에 있는 게시글의 제목이 바뀌고 lastmod가 커트라인 이후면, 같은 실행에서 목차 제목이 갱신된다(004 US1, 2026-10-08 실측 재현)", async () => {
  resetWorkDir();
  writeJson(STATE_PATH, {
    cutoff: "2026-10-07T13:48:30+09:00",
    processedPosts: [
      { url: URL_427, title: TITLE_427, lastMod: "2026-09-01T00:00:00.000Z", publishedAt: "2026-08-01T00:00:00.000Z", processedAt: "2026-09-01T09:00:00+09:00" },
      { url: URL_435, title: OLD_435, lastMod: "2026-10-07T03:30:05.000Z", publishedAt: "2026-08-25T06:47:00.000Z", processedAt: "2026-10-07T13:53:30+09:00" },
    ],
  });
  const items = [
    { title: TITLE_427, url: URL_427 },
    { title: OLD_435, url: URL_435 },
  ];
  writeJson(seriesPath("swemo"), { listName: "Swemo", items });
  writeJson(ASSIGNMENTS_PATH, { swemo: { listName: "Swemo", posts: items.map((i) => ({ url: i.url, title: i.title })) } });

  const fetchCounts = mockFetch({
    [URL_427]: { lastmod: "2026-09-01T00:00:00.000Z", title: TITLE_427 },
    [URL_435]: { lastmod: "2026-10-08T04:41:00.000Z", title: NEW_435 },
  });

  await run();

  const file = readJson(seriesPath("swemo"));
  assert.equal(file.items.find((i) => i.url === URL_435).title, NEW_435);
  const assignments = readJson(ASSIGNMENTS_PATH);
  assert.equal(assignments.swemo.posts.find((p) => p.url === URL_435).title, NEW_435);
  const summary = fs.readFileSync(SUMMARY_PATH, "utf8");
  assert.match(summary, /제목 갱신: 1건/);
  assert.doesNotMatch(summary, /정보 갱신/);
  assert.equal(fetchCounts[URL_435], 1);
});

test("신규 게시글 흐름이 기존 목차에 추가한 항목은 배치 결정에도 기록되어, 다음 실행의 재조정에서 지워지지 않는다(004 US2, swemo 435 사례)", async () => {
  resetWorkDir();
  writeJson(STATE_PATH, {
    cutoff: "2026-08-25T03:36:50+09:00",
    processedPosts: [
      { url: URL_400, title: "Swemo - Iteration 6: MVP 1 구현 (3/3)", lastMod: "2026-08-01T00:00:00.000Z", publishedAt: "2026-07-01T00:00:00.000Z", processedAt: "2026-08-01T09:00:00+09:00" },
      { url: URL_427, title: TITLE_427, lastMod: "2026-08-01T00:00:00.000Z", publishedAt: "2026-08-01T00:00:00.000Z", processedAt: "2026-08-01T09:00:00+09:00" },
    ],
  });
  const items = [
    { title: "Swemo - Iteration 6: MVP 1 구현 (3/3)", url: URL_400 },
    { title: TITLE_427, url: URL_427 },
  ];
  writeJson(seriesPath("swemo"), { listName: "Swemo", items });
  writeJson(ASSIGNMENTS_PATH, { swemo: { listName: "Swemo", posts: items.map((i) => ({ url: i.url, title: i.title })) } });

  const posts = {
    [URL_400]: { lastmod: "2026-08-01T00:00:00.000Z", title: "Swemo - Iteration 6: MVP 1 구현 (3/3)" },
    [URL_427]: { lastmod: "2026-08-01T00:00:00.000Z", title: TITLE_427 },
    [URL_435]: { lastmod: "2026-08-25T06:50:06.000Z", title: OLD_435 },
  };
  mockFetch(posts);
  await run();

  assert.ok(readJson(ASSIGNMENTS_PATH).swemo.posts.some((p) => p.url === URL_435));
  assert.ok(readJson(seriesPath("swemo")).items.some((i) => i.url === URL_435));

  // 2차 실행: 같은 시리즈의 다른 게시글(427) 제목이 바뀌어 드리프트 재조정이 돈다.
  const renamed427 = "Swemo - Iteration 7: 점검과 정리";
  mockFetch({ ...posts, [URL_427]: { lastmod: inOneHour(), title: renamed427 } });
  await run();

  const file = readJson(seriesPath("swemo"));
  assert.ok(file.items.some((i) => i.url === URL_435), "신규 흐름으로 추가된 435가 재조정으로 지워짐");
  assert.equal(file.items.find((i) => i.url === URL_427).title, renamed427);
});

test("신규 게시글 흐름이 목차 파일을 새로 만들면 배치 결정 그룹도 그 파일의 모든 항목을 담는다(004 US2 시나리오 2)", async () => {
  resetWorkDir();
  const URL_500 = "https://kenel.tistory.com/500";
  const URL_501 = "https://kenel.tistory.com/501";
  writeJson(STATE_PATH, {
    cutoff: "2026-10-01T00:00:00+09:00",
    processedPosts: [
      { url: URL_500, title: "Foo - 1화", lastMod: "2026-09-01T00:00:00.000Z", publishedAt: "2026-09-01T00:00:00.000Z", processedAt: "2026-09-01T09:00:00+09:00" },
    ],
  });
  writeJson(ASSIGNMENTS_PATH, {});

  mockFetch({
    [URL_500]: { lastmod: "2026-09-01T00:00:00.000Z", title: "Foo - 1화" },
    [URL_501]: { lastmod: "2026-10-05T00:00:00.000Z", title: "Foo - 2화" },
  });
  await run();

  const file = readJson(seriesPath("foo"));
  assert.deepEqual(file.items.map((i) => i.url).sort(), [URL_500, URL_501]);
  const group = readJson(ASSIGNMENTS_PATH).foo;
  assert.ok(group, "배치 결정에 foo 그룹이 없음");
  assert.equal(group.listName, "Foo");
  assert.deepEqual(group.posts.map((p) => p.url).sort(), [URL_500, URL_501]);
});

test("이미 목차에 있는 게시글이 다른 기존 시리즈로 이름이 바뀌면 옮겨진 목차에만 남고, 본문만 수정된 게시글은 그대로다(004 US1 시나리오 2·3)", async () => {
  resetWorkDir();
  const URL_600 = "https://kenel.tistory.com/600";
  const URL_601 = "https://kenel.tistory.com/601";
  const oldLastmod = "2026-09-01T00:00:00.000Z";
  const record = (url, title) => ({ url, title, lastMod: oldLastmod, publishedAt: "2026-08-01T00:00:00.000Z", processedAt: "2026-09-01T09:00:00+09:00" });
  const swemoItems = [
    { title: "Swemo - Iteration 6: MVP 1 구현 (3/3)", url: URL_400 },
    { title: TITLE_427, url: URL_427 },
    { title: OLD_435, url: URL_435 },
  ];
  const flowItems = [
    { title: "Flow - 기초", url: URL_600 },
    { title: "Flow - 심화", url: URL_601 },
  ];
  const allItems = [...swemoItems, ...flowItems];
  writeJson(STATE_PATH, { cutoff: "2026-10-01T00:00:00+09:00", processedPosts: allItems.map((i) => record(i.url, i.title)) });
  writeJson(seriesPath("swemo"), { listName: "Swemo", items: swemoItems });
  writeJson(seriesPath("flow"), { listName: "Flow", items: flowItems });
  writeJson(ASSIGNMENTS_PATH, {
    swemo: { listName: "Swemo", posts: swemoItems.map((i) => ({ url: i.url, title: i.title })) },
    flow: { listName: "Flow", posts: flowItems.map((i) => ({ url: i.url, title: i.title })) },
  });

  const posts = Object.fromEntries(allItems.map((i) => [i.url, { lastmod: oldLastmod, title: i.title }]));
  const renamed435 = "Flow - 셋째";
  posts[URL_435] = { lastmod: "2026-10-05T00:00:00.000Z", title: renamed435 }; // 다른 기존 시리즈로 이름 변경
  posts[URL_427] = { lastmod: "2026-10-05T00:00:00.000Z", title: TITLE_427 }; // 본문만 수정
  mockFetch(posts);
  await run();

  const swemo = readJson(seriesPath("swemo"));
  const flow = readJson(seriesPath("flow"));
  assert.deepEqual(swemo.items, swemoItems.slice(0, 2), "본문만 수정된 427을 포함한 swemo 나머지 항목이 그대로여야 함");
  assert.ok(flow.items.some((i) => i.url === URL_435 && i.title === renamed435));
  assert.ok(!swemo.items.some((i) => i.url === URL_435), "435가 두 목차에 동시에 남음");
});
