"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { toSeriesId, extractRawSeriesName } = require("./seriesName.js");

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

// 주어진 URL을 담고 있는 목차 파일의 seriesId를 찾는다(없으면 null). 005 이후 목차
// 파일이 게시글 소속의 유일한 기준이므로 "지금 어느 목차에 있는가"는 항상 이 함수로 판단한다.
function findSeriesIdForUrl(seriesFiles, url) {
  const file = seriesFiles.find((f) => f.data.items.some((item) => item.url === url));
  return file ? file.seriesId : null;
}

// ---- 005-drop-series-assignments: 목차 파일 편집 연산 ----
// 동기화가 목차 파일을 고치는 방법은 아래 세 함수(끝에 붙이기, 제목 바꾸기, 빼기)와
// 새 파일 생성(createSeriesFile)뿐이다. 기존 항목의 위치를 옮기는 연산은 일부러 두지
// 않는다 — 관리자가 *_series.json에서 직접 바꾼 순서를 자동 동기화가 되돌리지 않게
// 하기 위해서다(헌법 v1.1.0 원칙 I).

/**
 * 공개 시각(publishedAt, ISO 문자열) 오름차순으로 정렬한 새 배열을 반환한다. 공개 시각이
 * 없는(null/undefined, 페이지 마크업에서 못 읽은) 글은 뒤로 보낸다. Array#sort는 안정
 * 정렬이라 공개 시각이 같거나 둘 다 없으면 입력 순서가 유지된다. 값은 모두
 * Date#toISOString() 결과(UTC, 같은 길이)라 문자열 비교가 곧 시간 비교다.
 */
function orderByPublishedAt(posts) {
  return [...posts].sort((a, b) => {
    if (!a.publishedAt || !b.publishedAt) return (a.publishedAt ? 0 : 1) - (b.publishedAt ? 0 : 1);
    if (a.publishedAt === b.publishedAt) return 0;
    return a.publishedAt < b.publishedAt ? -1 : 1;
  });
}

/**
 * 한 번에 붙일 게시글 묶음({title, canonicalUrl, publishedAt})을 공개 시각 순으로 정렬해
 * items 끝에 붙이고, 실제로 붙인 개수를 반환한다. 이미 items에 있는 URL은 건너뛴다(중복
 * 방지). 기존 항목과는 공개 시각을 비교하지 않는다 — 공개 시각을 과거로 설정한 글도 끝에
 * 붙고, 다른 위치를 원하면 관리자가 직접 옮긴다.
 */
function appendBatch(file, posts) {
  const existingUrls = new Set(file.data.items.map((item) => item.url));
  let appended = 0;
  for (const post of orderByPublishedAt(posts)) {
    if (existingUrls.has(post.canonicalUrl)) continue;
    existingUrls.add(post.canonicalUrl);
    file.data.items.push({ title: post.title, url: post.canonicalUrl });
    appended += 1;
  }
  return appended;
}

// url 항목의 제목을 같은 위치에서 바꾼다. 항목이 없거나 제목이 이미 같으면 false.
function retitleItem(file, url, title) {
  const item = file.data.items.find((i) => i.url === url);
  if (!item || item.title === title) return false;
  item.title = title;
  return true;
}

// url 항목을 뺀다(나머지 항목의 상대 순서는 그대로). 항목이 없었으면 false.
function removeItem(file, url) {
  const before = file.data.items.length;
  file.data.items = file.data.items.filter((item) => item.url !== url);
  return file.data.items.length !== before;
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
    // 002-post-drift-detection이 processedPosts 레코드를 rawSeriesName 대신 title
    // 전체를 보유하도록 확장했다(specs/002-post-drift-detection/data-model.md
    // "Processed Post"). 이 함수는 001의 신규 시리즈 생성 판단에 계속 쓰이므로
    // 건드리지 않되, title만 있는 새 레코드도 인식하도록 이 한 줄만 보강한다 —
    // title이 있으면 그 자리에서 rawSeriesName을 다시 추출하고, 없으면(이 기능
    // 배포 이전 레코드) 기존처럼 저장된 rawSeriesName을 그대로 쓴다.
    const rawSeriesName = record.title !== undefined ? extractRawSeriesName(record.title) : record.rawSeriesName;
    if (!rawSeriesName) continue;
    if (toSeriesId(rawSeriesName) !== seriesId) continue;
    if (record.deletedAt) continue; // 삭제·비공개 전환이 이미 확정된 게시글은 형제로 세지 않는다(002 FR-013과 일관)
    if (knownUrls.has(record.url)) continue;

    const currentPost = currentPostsByUrl.get(record.url);
    if (!currentPost) continue; // sitemap에서 사라짐 = 삭제·비공개 전환 → 이번 기능 범위 밖(Out of Scope)

    knownUrls.add(record.url);
    historicalOnlyRefs.push({
      id: currentPost.id,
      canonicalUrl: currentPost.canonicalUrl,
      lastmod: currentPost.lastmod,
      // 005: 새 목차 파일을 공개 시각 순으로 만들 때 쓴다(추가 조회 없이 처리 이력 값 사용).
      publishedAt: record.publishedAt ?? null,
      rawSeriesName,
    });
  }

  return { historicalOnlyRefs };
}

/**
 * 새 시리즈 파일을 만든다(FR-012, FR-013, FR-017). siblings의 각 원소는
 * {title, canonicalUrl, publishedAt, rawSeriesName}를 가져야 한다. 같은 seriesId를
 * 공유하는 공개 게시글이 2개 미만이면 생성하지 않고 null을 반환한다(FR-012 임계치, SC-005).
 * 항목은 공개 시각 순(orderByPublishedAt)이고 listName은 그 첫 글의 rawSeriesName이다.
 * 005 이전에는 lastmod(마지막 수정 시각) 순이라, 예전 글을 최근에 고쳤다면 새 글보다
 * 뒤에 놓였다.
 */
function createSeriesFile(seriesId, siblings, rootDir = process.cwd()) {
  if (siblings.length < 2) return null;

  const sorted = orderByPublishedAt(siblings);
  const listName = sorted[0].rawSeriesName;
  const items = sorted.map((post) => ({ title: post.title, url: post.canonicalUrl }));
  const filePath = path.join(rootDir, `${seriesId}${SERIES_FILE_SUFFIX}`);
  return { seriesId, filePath, data: { listName, items } };
}

module.exports = {
  SERIES_FILE_SUFFIX,
  listSeriesFiles,
  findMatchingFile,
  findSeriesIdForUrl,
  orderByPublishedAt,
  appendBatch,
  retitleItem,
  removeItem,
  writeSeriesFile,
  collectSiblingCandidates,
  createSeriesFile,
};
