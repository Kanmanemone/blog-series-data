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
      { url: "https://kenel.tistory.com/104", rawSeriesName: "Coroutines", processedAt: "2026-07-21T15:00:03+09:00" },
    ],
  };

  try {
    writeSyncState(state, tmpPath);
    assert.deepEqual(readSyncState(tmpPath), state);
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
});

test("upsertProcessedPost는 같은 URL이 있으면 최신 값으로 덮어쓴다", () => {
  const processedPosts = [
    { url: "https://kenel.tistory.com/104", rawSeriesName: "Coroutines", processedAt: "2026-07-21T15:00:03+09:00" },
  ];

  upsertProcessedPost(processedPosts, {
    url: "https://kenel.tistory.com/104",
    rawSeriesName: "Coroutines",
    processedAt: "2026-07-22T09:00:00+09:00",
  });

  assert.equal(processedPosts.length, 1);
  assert.equal(processedPosts[0].processedAt, "2026-07-22T09:00:00+09:00");
});

test("upsertProcessedPost는 새 URL이면 배열 끝에 추가한다", () => {
  const processedPosts = [
    { url: "https://kenel.tistory.com/104", rawSeriesName: "Coroutines", processedAt: "2026-07-21T15:00:03+09:00" },
  ];

  upsertProcessedPost(processedPosts, {
    url: "https://kenel.tistory.com/105",
    rawSeriesName: "Coroutines",
    processedAt: "2026-07-22T09:00:00+09:00",
  });

  assert.equal(processedPosts.length, 2);
  assert.equal(processedPosts[1].url, "https://kenel.tistory.com/105");
});
