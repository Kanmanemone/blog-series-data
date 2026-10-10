"use strict";

// 003-fix-rarr-entity-decode: decodeHtmlEntities가 놓친 HTML named entity가
// *_series.json에 원문 그대로 저장되는 사고(&rarr; 사례)가 재발하지 않는지
// 저장소 전체를 대상으로 확인한다. seriesFiles.js의 listSeriesFiles가 이미
// 저장소 루트의 *_series.json 전체를 읽는 로직을 가지고 있으므로 그대로 재사용한다.

const test = require("node:test");
const assert = require("node:assert/strict");
const { listSeriesFiles } = require("../seriesFiles.js");

// HTML named entity(예: &rarr;, &amp;)와 numeric character reference(예: &#39;)
// 형태를 모두 잡는다. decodeHtmlEntities가 정상 동작했다면 title에 이 패턴이
// 남아있을 수 없다.
const UNRESOLVED_ENTITY_PATTERN = /&#?[a-zA-Z0-9]+;/;

test("모든 *_series.json의 title에 미해석 HTML entity가 없다", () => {
  const files = listSeriesFiles();
  assert.ok(files.length > 0, "저장소 루트에서 *_series.json을 하나도 찾지 못함");

  const offenders = [];
  for (const file of files) {
    for (const item of file.data.items) {
      if (UNRESOLVED_ENTITY_PATTERN.test(item.title)) {
        offenders.push(`${file.seriesId}_series.json: "${item.title}"`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

// 004-fix-edited-title-sync: 수정된 게시글 제목이 처리 이력에만 반영되고 목차에는
// 반영되지 않은 사고(435·212·412)와, 001이 목차에 추가한 항목이 배치 결정에 빠져 있던
// 사고(swemo 그룹의 435)가 재발하지 않는지 실제 저장소 데이터로 확인한다
// (data-model.md INV-2, INV-3).
const { readSyncState } = require("../syncState.js");
const { readAssignments } = require("../seriesAssignments.js");

test("모든 *_series.json 항목의 제목이 처리 이력(sync-state.json)의 제목과 같다(004 INV-3)", () => {
  const recordsByUrl = new Map(readSyncState().processedPosts.map((record) => [record.url, record]));

  const offenders = [];
  for (const file of listSeriesFiles()) {
    for (const item of file.data.items) {
      const record = recordsByUrl.get(item.url);
      // title이 없는 레코드는 002 배포 이전 형식(rawSeriesName만 보유)이라 비교할 값이 없다.
      if (!record || record.title === undefined) continue;
      if (record.title !== item.title) {
        offenders.push(`${file.seriesId}_series.json ${item.url}: 목차 "${item.title}" ≠ 처리 이력 "${record.title}"`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test("배치 결정(series-assignments.json)의 각 그룹이 같은 이름의 목차 파일과 게시글 구성·제목이 같다(004 INV-2)", () => {
  const filesBySeriesId = new Map(listSeriesFiles().map((file) => [file.seriesId, file]));

  const offenders = [];
  for (const [seriesId, group] of Object.entries(readAssignments())) {
    const file = filesBySeriesId.get(seriesId);
    if (!file) continue; // 2개 미만이라 목차 파일이 없는 그룹은 재조정이 지운 상태 그대로다.
    const fileTitles = new Map(file.data.items.map((item) => [item.url, item.title]));
    const groupTitles = new Map(group.posts.map((post) => [post.url, post.title]));
    for (const [url, title] of fileTitles) {
      if (!groupTitles.has(url)) offenders.push(`${seriesId}: 목차에만 있음 ${url}`);
      else if (groupTitles.get(url) !== title) offenders.push(`${seriesId}: 제목 다름 ${url}`);
    }
    for (const url of groupTitles.keys()) {
      if (!fileTitles.has(url)) offenders.push(`${seriesId}: 배치 결정에만 있음 ${url}`);
    }
  }

  assert.deepEqual(offenders, []);
});
