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
