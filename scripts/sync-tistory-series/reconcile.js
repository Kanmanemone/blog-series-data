"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { listSeriesFiles, findMatchingFile, writeSeriesFile, SERIES_FILE_SUFFIX } = require("./seriesFiles.js");

/**
 * 실제 시리즈 목차 파일들 중에서 주어진 URL을 담고 있는 파일의 seriesId를 찾는다.
 * 배치 결정(series-assignments.json)이 아직 이 게시글을 모를 수 있으므로(처음
 * 등장하는 드리프트 후보), 001의 append-only *_series.json을 유일한 진실 공급원으로
 * 삼아 "현재 이 게시글이 실제로 어느 목차에 반영되어 있는지"를 찾는다.
 */
function findSeriesIdForUrl(seriesFiles, url) {
  for (const file of seriesFiles) {
    if (file.data.items.some((item) => item.url === url)) return file.seriesId;
  }
  return null;
}

/**
 * 실제 파일의 items와 배치 결정의 posts를 url 기준으로 비교해 추가·제거·제목
 * 변경 건수를 센다. diff 자체를 적용하지는 않는다 — 호출자(reconcile)가 posts
 * 전체로 덮어쓸지 말지를 이 건수로 판단한다(SC-006, 일치하면 파일을 쓰지 않음).
 */
function diffItems(actualItems, desiredPosts) {
  const actualByUrl = new Map(actualItems.map((item) => [item.url, item]));
  const desiredByUrl = new Map(desiredPosts.map((post) => [post.url, post]));

  let added = 0;
  let removed = 0;
  let retitled = 0;

  for (const [url, post] of desiredByUrl) {
    const existing = actualByUrl.get(url);
    if (!existing) added += 1;
    else if (existing.title !== post.title) retitled += 1;
  }
  for (const url of actualByUrl.keys()) {
    if (!desiredByUrl.has(url)) removed += 1;
  }

  return { added, removed, retitled };
}

/**
 * 배치 결정 전체와 실제 시리즈 목차 파일 구조 전체를 비교해, 일치하지 않는 부분만
 * 실제 파일에 반영한다(FR-008~FR-011). 배치 결정에 없는 seriesId의 기존 파일은
 * 건드리지 않는다 — 이 기능은 "이미 목차에 반영된" 게시글만 대상으로 하므로, 001이나
 * 아직 이 기능의 처리 이력에 편입되지 않은 시리즈까지 재조정 대상으로 삼으면 범위를
 * 벗어난다(spec.md Edge Cases). 반환값은 이번 실행에서 실제로 만든 변경의 CUD 요약
 * 목록이다(FR-012) — 변경이 없으면 빈 배열을 반환하고 어떤 파일도 다시 쓰지 않는다(SC-006).
 */
function reconcile(assignments, rootDir = process.cwd()) {
  const existingFiles = listSeriesFiles(rootDir);
  const cudSummary = [];

  for (const [seriesId, group] of Object.entries(assignments)) {
    const file = findMatchingFile(existingFiles, seriesId);

    if (group.posts.length < 2) {
      if (file) {
        fs.rmSync(file.filePath, { force: true });
        cudSummary.push({ type: "deleted", seriesId, detail: "항목 부족(2개 미만)으로 파일 삭제" });
      }
      continue;
    }

    if (!file) {
      const newFile = {
        seriesId,
        filePath: path.join(rootDir, `${seriesId}${SERIES_FILE_SUFFIX}`),
        data: {
          listName: group.listName,
          items: group.posts.map((post) => ({ title: post.title, url: post.url })),
        },
      };
      writeSeriesFile(newFile);
      cudSummary.push({ type: "created", seriesId, detail: `${group.posts.length}건` });
      continue;
    }

    const diff = diffItems(file.data.items, group.posts);
    if (diff.added === 0 && diff.removed === 0 && diff.retitled === 0) continue;

    file.data.items = group.posts.map((post) => ({ title: post.title, url: post.url }));
    writeSeriesFile(file);

    const details = [];
    if (diff.retitled > 0) details.push(`제목 갱신 ${diff.retitled}건`);
    if (diff.added > 0) details.push(`항목 추가 ${diff.added}건`);
    if (diff.removed > 0) details.push(`항목 제거 ${diff.removed}건`);
    cudSummary.push({ type: "updated", seriesId, detail: details.join(", ") });
  }

  return cudSummary;
}

module.exports = { findSeriesIdForUrl, diffItems, reconcile };
