"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseSitemap } = require("../sitemap.js");

test("데스크톱과 모바일 URL이 같은 id로 병합된다(FR-005)", () => {
  const xml = `<?xml version="1.0"?>
<urlset>
  <url>
    <loc>https://kenel.tistory.com/104</loc>
    <lastmod>2024-09-17T17:15:40+09:00</lastmod>
  </url>
  <url>
    <loc>https://kenel.tistory.com/m/104</loc>
    <lastmod>2024-09-17T17:15:40+09:00</lastmod>
  </url>
</urlset>`;

  const posts = parseSitemap(xml);

  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, "104");
  assert.equal(posts[0].canonicalUrl, "https://kenel.tistory.com/104");
  assert.equal(posts[0].lastmod.toISOString(), new Date("2024-09-17T17:15:40+09:00").toISOString());
});

test("게시글 경로 패턴에 맞지 않는 URL은 제외된다(FR-006)", () => {
  const xml = `<?xml version="1.0"?>
<urlset>
  <url>
    <loc>https://kenel.tistory.com/</loc>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://kenel.tistory.com/guestbook</loc>
  </url>
  <url>
    <loc>https://kenel.tistory.com/tag/Kotlin</loc>
    <lastmod>2024-09-17T17:15:40+09:00</lastmod>
  </url>
  <url>
    <loc>https://kenel.tistory.com/104</loc>
    <lastmod>2024-09-17T17:15:40+09:00</lastmod>
  </url>
</urlset>`;

  const posts = parseSitemap(xml);

  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, "104");
});

test("lastmod가 없는 <url> 블록은 제외된다", () => {
  const xml = `<?xml version="1.0"?>
<urlset>
  <url>
    <loc>https://kenel.tistory.com/999</loc>
  </url>
</urlset>`;

  const posts = parseSitemap(xml);

  assert.equal(posts.length, 0);
});
