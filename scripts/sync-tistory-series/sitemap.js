"use strict";

const SITEMAP_URL = "https://kenel.tistory.com/sitemap.xml";

// 데스크톱("/123")과 모바일("/m/123") 게시글 경로만 허용한다. 카테고리 페이지,
// /guestbook, /tag 등 다른 경로는 이 패턴에 맞지 않아 자연히 제외된다(FR-006).
const POST_PATH_PATTERN = /^\/(m\/)?([0-9]+)$/;

function extractUrlBlocks(xmlText) {
  const blocks = [];
  const blockPattern = /<url>([\s\S]*?)<\/url>/g;
  let match = blockPattern.exec(xmlText);
  while (match !== null) {
    blocks.push(match[1]);
    match = blockPattern.exec(xmlText);
  }
  return blocks;
}

function parseUrlBlock(block) {
  const locMatch = /<loc>([^<]*)<\/loc>/.exec(block);
  const lastmodMatch = /<lastmod>([^<]*)<\/lastmod>/.exec(block);
  // <lastmod>가 없는 <url> 블록(카테고리 페이지 등)은 비교할 값 자체가 없으므로
  // 여기서 걸러진다(FR-004의 비교 대상이 아예 없는 경우).
  if (!locMatch || !lastmodMatch) {
    return null;
  }
  return { loc: locMatch[1].trim(), lastmod: lastmodMatch[1].trim() };
}

/**
 * sitemap.xml 텍스트를 파싱해 게시글 경로만 남기고, 데스크톱/모바일 URL을
 * 같은 게시글(id)로 병합한다(FR-005, FR-006). 커트라인 필터링은 하지 않고
 * 전체 게시글 목록을 반환한다 — 필터링은 syncState의 cutoff를 아는 index.js가 담당한다.
 */
function parseSitemap(xmlText) {
  const merged = new Map();

  for (const block of extractUrlBlocks(xmlText)) {
    const entry = parseUrlBlock(block);
    if (!entry) continue;

    let pathname;
    try {
      pathname = new URL(entry.loc).pathname;
    } catch {
      continue;
    }

    const pathMatch = POST_PATH_PATTERN.exec(pathname);
    if (!pathMatch) continue;

    const id = pathMatch[2];
    const lastmod = new Date(entry.lastmod);
    const canonicalUrl = `https://kenel.tistory.com/${id}`;

    const existing = merged.get(id);
    // 데스크톱/모바일 lastmod가 다르면(실측상 항상 같았으나 대비 차원) 더 최신 값을 채택한다.
    if (!existing || lastmod > existing.lastmod) {
      merged.set(id, { id, canonicalUrl, lastmod });
    }
  }

  return Array.from(merged.values());
}

async function fetchSitemap(sitemapUrl = SITEMAP_URL) {
  const response = await fetch(sitemapUrl);
  if (!response.ok) {
    throw new Error(`sitemap 조회 실패: ${sitemapUrl} (HTTP ${response.status})`);
  }
  const xmlText = await response.text();
  return parseSitemap(xmlText);
}

module.exports = { SITEMAP_URL, POST_PATH_PATTERN, parseSitemap, fetchSitemap };
