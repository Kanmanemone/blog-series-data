"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  readAssignments,
  writeAssignments,
  ensureGroupSeeded,
  updateAssignmentForPost,
  resolveReclassifyBatches,
} = require("../seriesAssignments.js");

function tmpPath() {
  return path.join(os.tmpdir(), `series-assignments-test-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
}

test("readAssignments는 파일이 없으면 빈 객체를 반환한다", () => {
  assert.deepEqual(readAssignments(path.join(os.tmpdir(), "no-such-file.json")), {});
});

test("writeAssignments 후 readAssignments로 동일한 내용을 읽는다", () => {
  const filePath = tmpPath();
  const assignments = {
    coroutines: {
      listName: "Coroutines",
      posts: [{ url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" }],
    },
  };

  try {
    writeAssignments(assignments, filePath);
    assert.deepEqual(readAssignments(filePath), assignments);
  } finally {
    fs.rmSync(filePath, { force: true });
  }
});

test("ensureGroupSeeded는 이미 있는 그룹은 건드리지 않는다", () => {
  const assignments = {
    coroutines: { listName: "Coroutines", posts: [{ url: "https://kenel.tistory.com/104", title: "A" }] },
  };
  ensureGroupSeeded(assignments, "coroutines", {
    data: { listName: "다른이름", items: [{ url: "https://kenel.tistory.com/999", title: "B" }] },
  });
  assert.equal(assignments.coroutines.listName, "Coroutines");
  assert.equal(assignments.coroutines.posts.length, 1);
});

test("ensureGroupSeeded는 없는 그룹을 실제 시리즈 파일 내용으로 시드한다", () => {
  const assignments = {};
  ensureGroupSeeded(assignments, "coroutines", {
    data: {
      listName: "Coroutines",
      items: [
        { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" },
        { url: "https://kenel.tistory.com/110", title: "Coroutines - 취소" },
      ],
    },
  });
  assert.equal(assignments.coroutines.listName, "Coroutines");
  assert.deepEqual(assignments.coroutines.posts, [
    { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" },
    { url: "https://kenel.tistory.com/110", title: "Coroutines - 취소" },
  ]);
});

test("ensureGroupSeeded는 실제 파일이 없으면(신규 시리즈) 아무 것도 하지 않는다", () => {
  const assignments = {};
  ensureGroupSeeded(assignments, "newseries", null);
  assert.equal(assignments.newseries, undefined);
});

test("updateAssignmentForPost는 시리즈 구분 기준이 안 바뀌면 제목 텍스트만 갱신한다(순수 텍스트 갱신)", () => {
  const assignments = {
    coroutines: {
      listName: "Coroutines",
      posts: [
        { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" },
        { url: "https://kenel.tistory.com/110", title: "Coroutines - 취소" },
      ],
    },
  };

  updateAssignmentForPost(assignments, {
    url: "https://kenel.tistory.com/104",
    title: "Coroutines - 기초(개정판)",
    oldSeriesId: "coroutines",
  });

  assert.equal(assignments.coroutines.posts.length, 2);
  assert.equal(assignments.coroutines.posts[0].title, "Coroutines - 기초(개정판)");
  // 변경되지 않은 다른 게시글 항목은 그대로여야 한다(FR-006 음성 케이스).
  assert.deepEqual(assignments.coroutines.posts[1], { url: "https://kenel.tistory.com/110", title: "Coroutines - 취소" });
});

test("resolveReclassifyBatches는 새 시리즈가 이 게시글을 포함해 2개 이상이면 이동한다(재분류)", () => {
  const assignments = {
    coroutines: {
      listName: "Coroutines",
      posts: [
        { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" },
        { url: "https://kenel.tistory.com/110", title: "Coroutines - 취소" },
      ],
    },
    flow: {
      listName: "Flow",
      posts: [{ url: "https://kenel.tistory.com/200", title: "Flow - 기초" }],
    },
  };

  resolveReclassifyBatches(assignments, [
    { url: "https://kenel.tistory.com/104", title: "Flow - 심화", oldSeriesId: "coroutines", newSeriesId: "flow" },
  ]);

  // 기존 자리에서 제거되었다.
  assert.equal(assignments.coroutines.posts.length, 1);
  assert.equal(assignments.coroutines.posts[0].url, "https://kenel.tistory.com/110");
  // 새 자리로 이동했다(2개 이상 조건 충족).
  assert.equal(assignments.flow.posts.length, 2);
  assert.ok(assignments.flow.posts.some((p) => p.url === "https://kenel.tistory.com/104" && p.title === "Flow - 심화"));
});

test("resolveReclassifyBatches는 새 시리즈가 아직 1개뿐이면 이동을 보류하고 제목만 갱신한다", () => {
  const assignments = {
    coroutines: {
      listName: "Coroutines",
      posts: [
        { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" },
        { url: "https://kenel.tistory.com/110", title: "Coroutines - 취소" },
      ],
    },
  };

  resolveReclassifyBatches(assignments, [
    { url: "https://kenel.tistory.com/104", title: "완전히새로운시리즈 - 1화", oldSeriesId: "coroutines", newSeriesId: "완전히새로운시리즈" },
  ]);

  // 새 시리즈 그룹은 아직 만들어지지 않았다(1개뿐이라 임계값 미충족).
  assert.equal(assignments["완전히새로운시리즈"], undefined);
  // 기존 자리에 남되 제목은 갱신됐다.
  assert.equal(assignments.coroutines.posts.length, 2);
  assert.equal(assignments.coroutines.posts[0].title, "완전히새로운시리즈 - 1화");
});

test("resolveReclassifyBatches는 같은 실행에서 두 게시글이 같은 신생 시리즈로 함께 재분류되면 둘 다 이동시킨다(F1 회귀 방지)", () => {
  const assignments = {
    coroutines: {
      listName: "Coroutines",
      posts: [
        { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" },
        { url: "https://kenel.tistory.com/110", title: "Coroutines - 취소" },
        { url: "https://kenel.tistory.com/111", title: "Coroutines - 심화" },
      ],
    },
  };

  // 104와 110이 같은 실행에서 함께 "NewTopic"으로 재분류된다. 개별적으로 보면
  // 각자 "1명뿐"이지만, 배치를 합치면 2명이라 함께 이동해야 한다.
  resolveReclassifyBatches(assignments, [
    { url: "https://kenel.tistory.com/104", title: "NewTopic - 1화", oldSeriesId: "coroutines", newSeriesId: "newtopic" },
    { url: "https://kenel.tistory.com/110", title: "NewTopic - 2화", oldSeriesId: "coroutines", newSeriesId: "newtopic" },
  ]);

  assert.equal(assignments.coroutines.posts.length, 1);
  assert.equal(assignments.coroutines.posts[0].url, "https://kenel.tistory.com/111");
  assert.equal(assignments.newtopic.posts.length, 2);
  assert.deepEqual(
    assignments.newtopic.posts.map((p) => p.url).sort(),
    ["https://kenel.tistory.com/104", "https://kenel.tistory.com/110"],
  );
});

test("resolveReclassifyBatches는 후보가 없으면 아무 것도 하지 않는다", () => {
  const assignments = { coroutines: { listName: "Coroutines", posts: [] } };
  assert.doesNotThrow(() => resolveReclassifyBatches(assignments, []));
  assert.deepEqual(assignments, { coroutines: { listName: "Coroutines", posts: [] } });
});

test("updateAssignmentForPost는 삭제 확정 게시글을 배치 결정에서 완전히 제거한다", () => {
  const assignments = {
    coroutines: {
      listName: "Coroutines",
      posts: [
        { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" },
        { url: "https://kenel.tistory.com/110", title: "Coroutines - 취소" },
      ],
    },
  };

  updateAssignmentForPost(assignments, {
    url: "https://kenel.tistory.com/104",
    deletedAt: "2026-08-09T00:00:00+09:00",
    oldSeriesId: "coroutines",
  });

  assert.equal(assignments.coroutines.posts.length, 1);
  assert.equal(assignments.coroutines.posts[0].url, "https://kenel.tistory.com/110");
});

test("updateAssignmentForPost는 oldSeriesId가 null인 삭제 확정 요청을 안전하게 무시한다", () => {
  const assignments = {};
  assert.doesNotThrow(() => {
    updateAssignmentForPost(assignments, {
      url: "https://kenel.tistory.com/999",
      deletedAt: "2026-08-09T00:00:00+09:00",
      oldSeriesId: null,
    });
  });
});
