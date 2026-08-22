"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { findSeriesIdForUrl, reconcile } = require("../reconcile.js");
const { listSeriesFiles } = require("../seriesFiles.js");

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "reconcile-test-"));
}

function writeFile(root, seriesId, data) {
  fs.writeFileSync(path.join(root, `${seriesId}_series.json`), JSON.stringify(data, null, 2) + "\n", "utf8");
}

function readFile(root, seriesId) {
  return JSON.parse(fs.readFileSync(path.join(root, `${seriesId}_series.json`), "utf8"));
}

test("findSeriesIdForUrl은 url을 포함한 파일의 seriesId를 찾는다", () => {
  const files = [
    { seriesId: "coroutines", data: { items: [{ url: "https://kenel.tistory.com/104", title: "A" }] } },
  ];
  assert.equal(findSeriesIdForUrl(files, "https://kenel.tistory.com/104"), "coroutines");
  assert.equal(findSeriesIdForUrl(files, "https://kenel.tistory.com/999"), null);
});

test("reconcile은 배치 결정에 posts가 2개 이상인데 파일이 없으면 새로 생성한다(FR-010)", () => {
  const root = makeTempRoot();
  try {
    const assignments = {
      newseries: {
        listName: "NewSeries",
        posts: [
          { url: "https://kenel.tistory.com/200", title: "NewSeries - 1화" },
          { url: "https://kenel.tistory.com/201", title: "NewSeries - 2화" },
        ],
      },
    };

    const totals = reconcile(assignments, root);

    assert.deepEqual(totals, { created: 1, added: 0, removed: 0, retitled: 0, deleted: 0 });
    assert.deepEqual(readFile(root, "newseries"), {
      listName: "NewSeries",
      items: [
        { title: "NewSeries - 1화", url: "https://kenel.tistory.com/200" },
        { title: "NewSeries - 2화", url: "https://kenel.tistory.com/201" },
      ],
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reconcile은 배치 결정에 posts가 2개 미만이면 파일을 생성하지 않는다(FR-011)", () => {
  const root = makeTempRoot();
  try {
    const assignments = {
      lonely: { listName: "Lonely", posts: [{ url: "https://kenel.tistory.com/300", title: "Lonely - 1화" }] },
    };

    const totals = reconcile(assignments, root);

    assert.deepEqual(totals, { created: 0, added: 0, removed: 0, retitled: 0, deleted: 0 });
    assert.equal(fs.existsSync(path.join(root, "lonely_series.json")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reconcile은 배치 결정상 2개 미만으로 줄어든 기존 파일을 삭제한다(FR-011)", () => {
  const root = makeTempRoot();
  try {
    writeFile(root, "coroutines", {
      listName: "Coroutines",
      items: [{ title: "Coroutines - 기초", url: "https://kenel.tistory.com/104" }],
    });
    const assignments = {
      coroutines: { listName: "Coroutines", posts: [{ url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" }] },
    };

    const totals = reconcile(assignments, root);

    assert.deepEqual(totals, { created: 0, added: 0, removed: 0, retitled: 0, deleted: 1 });
    assert.equal(fs.existsSync(path.join(root, "coroutines_series.json")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reconcile은 항목 추가·제거·제목 갱신이 섞여 있으면 diff만큼만 반영한다(FR-008, FR-009)", () => {
  const root = makeTempRoot();
  try {
    writeFile(root, "coroutines", {
      listName: "Coroutines",
      items: [
        { title: "Coroutines - 기초", url: "https://kenel.tistory.com/104" },
        { title: "Coroutines - 취소(옛제목)", url: "https://kenel.tistory.com/110" },
        { title: "Coroutines - 삭제될 글", url: "https://kenel.tistory.com/120" },
      ],
    });
    const assignments = {
      coroutines: {
        listName: "Coroutines",
        posts: [
          { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" },
          { url: "https://kenel.tistory.com/110", title: "Coroutines - 취소" },
          { url: "https://kenel.tistory.com/130", title: "Coroutines - 새 글" },
        ],
      },
    };

    const totals = reconcile(assignments, root);

    assert.deepEqual(totals, { created: 0, added: 1, removed: 1, retitled: 1, deleted: 0 });

    const updated = readFile(root, "coroutines");
    assert.equal(updated.listName, "Coroutines"); // 기존 listName 유지
    assert.deepEqual(
      updated.items.map((i) => i.url),
      ["https://kenel.tistory.com/104", "https://kenel.tistory.com/110", "https://kenel.tistory.com/130"],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reconcile은 배치 결정과 실제 파일이 이미 일치하면 파일을 다시 쓰지 않는다(SC-006)", () => {
  const root = makeTempRoot();
  try {
    const matchingData = {
      listName: "Coroutines",
      items: [
        { title: "Coroutines - 기초", url: "https://kenel.tistory.com/104" },
        { title: "Coroutines - 취소", url: "https://kenel.tistory.com/110" },
      ],
    };
    writeFile(root, "coroutines", matchingData);
    const filePath = path.join(root, "coroutines_series.json");
    const before = fs.statSync(filePath).mtimeMs;

    const assignments = {
      coroutines: {
        listName: "Coroutines",
        posts: [
          { url: "https://kenel.tistory.com/104", title: "Coroutines - 기초" },
          { url: "https://kenel.tistory.com/110", title: "Coroutines - 취소" },
        ],
      },
    };

    const totals = reconcile(assignments, root);

    assert.deepEqual(totals, { created: 0, added: 0, removed: 0, retitled: 0, deleted: 0 });
    assert.equal(fs.statSync(filePath).mtimeMs, before); // 파일이 실제로 다시 쓰이지 않았다
    assert.deepEqual(readFile(root, "coroutines"), matchingData);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reconcile은 배치 결정에 없는 seriesId의 기존 파일은 건드리지 않는다(범위 밖)", () => {
  const root = makeTempRoot();
  try {
    writeFile(root, "untracked", {
      listName: "Untracked",
      items: [{ title: "제목", url: "https://kenel.tistory.com/500" }],
    });

    const totals = reconcile({}, root);

    assert.deepEqual(totals, { created: 0, added: 0, removed: 0, retitled: 0, deleted: 0 });
    assert.equal(fs.existsSync(path.join(root, "untracked_series.json")), true);
    const files = listSeriesFiles(root);
    assert.equal(files.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
