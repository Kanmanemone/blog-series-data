"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { decodeHtmlEntities, filterCandidates } = require("../index.js");

test("다섯 개 기본 HTML 엔티티를 원문 문자로 치환한다(FR-007)", () => {
  assert.equal(decodeHtmlEntities("A &amp; B"), "A & B");
  assert.equal(decodeHtmlEntities("&lt;tag&gt;"), "<tag>");
  assert.equal(decodeHtmlEntities("&quot;quoted&quot;"), '"quoted"');
  assert.equal(decodeHtmlEntities("It&#39;s"), "It's");
});

test("엔티티가 없는 원문은 그대로 유지한다", () => {
  assert.equal(decodeHtmlEntities("[Kotlin] Coroutines - 기초"), "[Kotlin] Coroutines - 기초");
});

test("여러 엔티티가 섞인 제목도 모두 치환한다", () => {
  assert.equal(decodeHtmlEntities("A&amp;B &lt;C&gt; &quot;D&quot; It&#39;s E"), 'A&B <C> "D" It\'s E');
});

test("filterCandidates는 cutoff보다 lastmod가 최신인 게시글만 남긴다(FR-004)", () => {
  const cutoff = new Date("2026-07-21T14:55:00+09:00");
  const posts = [
    { id: "1", canonicalUrl: "https://kenel.tistory.com/1", lastmod: new Date("2026-07-21T14:00:00+09:00") },
    { id: "2", canonicalUrl: "https://kenel.tistory.com/2", lastmod: new Date("2026-07-21T15:00:00+09:00") },
  ];

  const candidates = filterCandidates(posts, cutoff);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, "2");
});

test("filterCandidates는 cutoff가 null이면(최초 실행) 전체를 후보로 삼는다", () => {
  const posts = [
    { id: "1", canonicalUrl: "https://kenel.tistory.com/1", lastmod: new Date("2020-01-01T00:00:00+09:00") },
  ];

  assert.equal(filterCandidates(posts, null).length, 1);
});
