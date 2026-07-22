"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { toSeriesId } = require("./seriesName.js");

const SERIES_FILE_SUFFIX = "_series.json";

/**
 * 저장소 루트의 모든 *_series.json을 읽어 {seriesId, filePath, data} 목록을 만든다.
 * seriesId는 파일명에서 "_series.json" 접미사를 뗀 값으로, keyword_filename_formatter.html이
 * 만드는 파일명 규칙과 동일하다고 가정한다(Constitution Repository Constraints).
 */
function listSeriesFiles(rootDir = process.cwd()) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(SERIES_FILE_SUFFIX)) continue;
    const seriesId = entry.name.slice(0, -SERIES_FILE_SUFFIX.length);
    const filePath = path.join(rootDir, entry.name);
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    files.push({ seriesId, filePath, data });
  }

  return files;
}

// seriesId가 일치하는 기존 시리즈 파일을 찾는다(FR-010).
function findMatchingFile(files, seriesId) {
  return files.find((file) => file.seriesId === seriesId) || null;
}

/**
 * 매칭된 시리즈 파일의 items에 게시글을 추가한다(FR-011). 이미 같은 url이 있으면
 * 아무 것도 하지 않고 false를 반환해(중복 방지) 기존 항목 순서를 건드리지 않는다.
 */
function appendToSeries(file, post) {
  const alreadyExists = file.data.items.some((item) => item.url === post.canonicalUrl);
  if (alreadyExists) return false;
  file.data.items.push({ title: post.title, url: post.canonicalUrl });
  return true;
}

// file.data를 그대로 JSON으로 저장한다. 기존 *_series.json과 동일하게 2-space 들여쓰기,
// 끝에 개행 한 줄을 남긴다.
function writeSeriesFile(file) {
  fs.writeFileSync(file.filePath, JSON.stringify(file.data, null, 2) + "\n", "utf8");
}

/**
 * 매칭되는 기존 파일이 없는 seriesId에 대해, 새 시리즈 생성 임계치(FR-012) 판단에
 * 필요한 "과거에 처리했지만 그때는 파일이 만들어지지 않았던" 형제 게시글을 찾는다.
 * syncState의 processedPosts 이력 중 같은 seriesId를 공유하고, 이번 실행의
 * allSitemapPosts에도 여전히 존재하는(삭제·비공개로 전환되지 않은) 것만 대상으로 하며,
 * 이번 실행에서 이미 후보로 잡힌(thisRunSiblings) URL은 중복 집계하지 않는다.
 * title은 이 함수가 채우지 않는다 — 과거 기록에는 rawSeriesName만 남아 있어(FR-016),
 * 실제로 새 파일을 만들 때가 되면 호출자(index.js)가 그 URL의 제목을 다시 조회해야 한다.
 */
function collectSiblingCandidates(seriesId, thisRunSiblings, processedPosts, allSitemapPosts) {
  const currentPostsByUrl = new Map(allSitemapPosts.map((post) => [post.canonicalUrl, post]));
  const knownUrls = new Set(thisRunSiblings.map((post) => post.canonicalUrl));
  const historicalOnlyRefs = [];

  for (const record of processedPosts) {
    if (!record.rawSeriesName) continue;
    if (toSeriesId(record.rawSeriesName) !== seriesId) continue;
    if (knownUrls.has(record.url)) continue;

    const currentPost = currentPostsByUrl.get(record.url);
    if (!currentPost) continue; // sitemap에서 사라짐 = 삭제·비공개 전환 → 이번 기능 범위 밖(Out of Scope)

    knownUrls.add(record.url);
    historicalOnlyRefs.push({
      id: currentPost.id,
      canonicalUrl: currentPost.canonicalUrl,
      lastmod: currentPost.lastmod,
      rawSeriesName: record.rawSeriesName,
    });
  }

  return { historicalOnlyRefs };
}

/**
 * 새 시리즈 파일을 만든다(FR-012, FR-013, FR-017). siblings의 각 원소는
 * {title, canonicalUrl, lastmod, rawSeriesName}를 가져야 한다. 같은 seriesId를
 * 공유하는 공개 게시글이 2개 미만이면 생성하지 않고 null을 반환한다(FR-012 임계치, SC-005).
 * 생성하는 경우 listName은 발행 순서(lastmod 오름차순)로 가장 먼저 발견된 게시글의
 * rawSeriesName을 쓴다.
 */
function createSeriesFile(seriesId, siblings, rootDir = process.cwd()) {
  if (siblings.length < 2) return null;

  const sorted = [...siblings].sort((a, b) => a.lastmod - b.lastmod);
  const listName = sorted[0].rawSeriesName;
  const items = sorted.map((post) => ({ title: post.title, url: post.canonicalUrl }));
  const filePath = path.join(rootDir, `${seriesId}${SERIES_FILE_SUFFIX}`);
  return { seriesId, filePath, data: { listName, items } };
}

module.exports = {
  SERIES_FILE_SUFFIX,
  listSeriesFiles,
  findMatchingFile,
  appendToSeries,
  writeSeriesFile,
  collectSiblingCandidates,
  createSeriesFile,
};
