"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  formatKst,
  computeCutoff,
  readSyncState,
  writeSyncState,
  upsertProcessedPost,
  markDeleted,
  isDriftCandidate,
} = require("../syncState.js");

test("formatKst는 UTC 시각을 +09:00 오프셋 문자열로 변환한다(FR-002)", () => {
  // UTC 2024-09-17T08:15:40Z == KST 2024-09-17T17:15:40+09:00
  const date = new Date("2024-09-17T08:15:40.000Z");
  assert.equal(formatKst(date), "2024-09-17T17:15:40+09:00");
});

test("computeCutoff는 실행 시작 시각에서 5분을 뺀다(FR-003)", () => {
  const runStartedAt = new Date("2024-09-17T08:15:40.000Z");
  const cutoff = computeCutoff(runStartedAt);
  assert.equal(cutoff.getTime(), runStartedAt.getTime() - 5 * 60 * 1000);
});

test("상태 파일이 없으면 cutoff null, 빈 processedPosts로 시작한다", () => {
  const missingPath = path.join(os.tmpdir(), `sync-state-missing-${Date.now()}.json`);
  const state = readSyncState(missingPath);
  assert.deepEqual(state, { cutoff: null, processedPosts: [] });
});

test("writeSyncState 후 readSyncState로 동일한 내용을 읽는다", () => {
  const tmpPath = path.join(os.tmpdir(), `sync-state-roundtrip-${Date.now()}.json`);
  const state = {
    cutoff: "2026-07-21T14:55:00+09:00",
    processedPosts: [
      {
        url: "https://kenel.tistory.com/104",
        title: "Coroutines - 기초",
        lastMod: "2026-07-21T05:00:00.000Z",
        processedAt: "2026-07-21T15:00:03+09:00",
      },
    ],
  };

  try {
    writeSyncState(state, tmpPath);
    assert.deepEqual(readSyncState(tmpPath), state);
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
});

test("upsertProcessedPost는 같은 URL이 있으면 전달된 필드만 덮어쓰고 나머지는 보존한다", () => {
  const processedPosts = [
    {
      url: "https://kenel.tistory.com/104",
      title: "Coroutines - 기초",
      lastMod: "2026-07-21T05:00:00.000Z",
      processedAt: "2026-07-21T15:00:03+09:00",
      deletedAt: "2026-07-25T00:00:00+09:00",
    },
  ];

  upsertProcessedPost(processedPosts, {
    url: "https://kenel.tistory.com/104",
    title: "Coroutines - 기초(수정)",
    lastMod: "2026-07-22T05:00:00.000Z",
    processedAt: "2026-07-22T09:00:00+09:00",
  });

  assert.equal(processedPosts.length, 1);
  assert.equal(processedPosts[0].title, "Coroutines - 기초(수정)");
  assert.equal(processedPosts[0].processedAt, "2026-07-22T09:00:00+09:00");
  // upsertProcessedPost 호출 시 전달하지 않은 deletedAt은 그대로 보존되어야 한다.
  assert.equal(processedPosts[0].deletedAt, "2026-07-25T00:00:00+09:00");
});

test("upsertProcessedPost는 새 URL이면 배열 끝에 추가한다", () => {
  const processedPosts = [
    {
      url: "https://kenel.tistory.com/104",
      title: "Coroutines - 기초",
      lastMod: "2026-07-21T05:00:00.000Z",
      processedAt: "2026-07-21T15:00:03+09:00",
    },
  ];

  upsertProcessedPost(processedPosts, {
    url: "https://kenel.tistory.com/105",
    title: "Coroutines - 심화",
    lastMod: "2026-07-21T05:00:00.000Z",
    processedAt: "2026-07-22T09:00:00+09:00",
  });

  assert.equal(processedPosts.length, 2);
  assert.equal(processedPosts[1].url, "https://kenel.tistory.com/105");
});

test("markDeleted는 일치하는 URL의 레코드에 deletedAt을 설정한다(FR-005)", () => {
  const processedPosts = [
    { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초", lastMod: "2026-07-21T05:00:00.000Z", processedAt: "2026-07-21T15:00:03+09:00" },
  ];

  markDeleted(processedPosts, "https://kenel.tistory.com/104", "2026-07-25T00:00:00+09:00");

  assert.equal(processedPosts[0].deletedAt, "2026-07-25T00:00:00+09:00");
});

test("markDeleted는 일치하는 레코드가 없으면 아무 것도 하지 않는다", () => {
  const processedPosts = [
    { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초", lastMod: "2026-07-21T05:00:00.000Z", processedAt: "2026-07-21T15:00:03+09:00" },
  ];

  markDeleted(processedPosts, "https://kenel.tistory.com/999", "2026-07-25T00:00:00+09:00");

  assert.equal(processedPosts.length, 1);
  assert.equal(processedPosts[0].deletedAt, undefined);
});

test("isDriftCandidate는 lastMod가 없으면 항상 후보로 판정한다(변경 여부 불명, FR-002)", () => {
  const record = { url: "https://kenel.tistory.com/104", title: "옛 제목", processedAt: "2026-07-21T15:00:03+09:00" };
  assert.equal(isDriftCandidate(record, new Date("2020-01-01T00:00:00Z")), true);
});

test("isDriftCandidate는 sitemap lastmod가 기록된 lastMod보다 최신일 때만 후보로 판정한다", () => {
  const record = { url: "https://kenel.tistory.com/104", title: "제목", lastMod: "2026-07-21T05:00:00.000Z" };

  assert.equal(isDriftCandidate(record, new Date("2026-07-22T00:00:00.000Z")), true);
  assert.equal(isDriftCandidate(record, new Date("2026-07-21T05:00:00.000Z")), false);
  assert.equal(isDriftCandidate(record, new Date("2026-07-20T00:00:00.000Z")), false);
});

test("isDriftCandidate는 deletedAt이 설정된 레코드를 항상 제외한다(FR-013)", () => {
  const record = {
    url: "https://kenel.tistory.com/104",
    title: "제목",
    deletedAt: "2026-07-25T00:00:00+09:00",
  };
  assert.equal(isDriftCandidate(record, new Date("2099-01-01T00:00:00Z")), false);
});
