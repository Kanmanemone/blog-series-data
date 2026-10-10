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
// 반영되지 않은 사고(435·212·412)가 재발하지 않는지 실제 저장소 데이터로 확인한다
// (004 data-model.md INV-3). 004 INV-2(배치 결정 비교)는 005에서 배치 결정을 없애며 제거했다.
const { readSyncState } = require("../syncState.js");

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

// 005-drop-series-assignments: 배치 결정이 없어진 뒤로는 목차 파일끼리의 일관성만 남는다.
// 재분류·새 목차 생성이 옛 목차에서 항목을 빼지 않으면 같은 글이 두 목차에 동시에
// 남는다(004 converge에서 실제로 재현된 결함 유형) — 그런 상태가 저장소에 없는지 확인한다.
test("한 게시글 URL은 최대 한 목차에만 있다(005 INV-2)", () => {
  const seriesIdsByUrl = new Map();
  for (const file of listSeriesFiles()) {
    for (const item of file.data.items) {
      if (!seriesIdsByUrl.has(item.url)) seriesIdsByUrl.set(item.url, []);
      seriesIdsByUrl.get(item.url).push(file.seriesId);
    }
  }

  const offenders = [...seriesIdsByUrl]
    .filter(([, seriesIds]) => seriesIds.length > 1)
    .map(([url, seriesIds]) => `${url}: ${seriesIds.join(", ")}`);

  assert.deepEqual(offenders, []);
});
