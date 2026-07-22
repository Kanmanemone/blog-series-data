"use strict";

const { fetchSitemap } = require("./sitemap.js");
const { extractRawSeriesName, toSeriesId } = require("./seriesName.js");
const {
  computeCutoff,
  readSyncState,
  writeSyncState,
  upsertProcessedPost,
  formatKst,
} = require("./syncState.js");
const {
  listSeriesFiles,
  findMatchingFile,
  appendToSeries,
  writeSeriesFile,
  collectSiblingCandidates,
  createSeriesFile,
} = require("./seriesFiles.js");

// 게시글 페이지에서 실측된 다섯 개 기본 엔티티만 방어적으로 치환한다(research.md §3).
const HTML_ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
};

function decodeHtmlEntities(text) {
  return text.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => HTML_ENTITIES[entity]);
}

// 게시글 페이지를 fetch해 <title> 태그 원문을 읽는다(FR-007).
async function fetchPostTitle(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`게시글 제목 조회 실패: ${url} (HTTP ${response.status})`);
  }
  const html = await response.text();
  const titleMatch = /<title>([^<]*)<\/title>/.exec(html);
  if (!titleMatch) {
    throw new Error(`게시글 제목 조회 실패: ${url} (<title> 태그를 찾을 수 없음)`);
  }
  return decodeHtmlEntities(titleMatch[1]);
}

// 저장된 cutoff보다 lastmod가 최신인 게시글만 후보로 선별한다(FR-004).
// cutoff가 null이면(최초 실행, sync-state.json 없음) 모든 게시글을 후보로 삼는다.
function filterCandidates(allPosts, cutoff) {
  if (cutoff === null) return allPosts;
  return allPosts.filter((post) => post.lastmod > cutoff);
}

async function run() {
  const runStartedAt = new Date();
  const state = readSyncState();
  const cutoff = state.cutoff ? new Date(state.cutoff) : null;

  let allPosts;
  try {
    allPosts = await fetchSitemap();
  } catch (error) {
    console.error(`[sync] sitemap 조회 실패로 실행을 중단합니다: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const candidates = filterCandidates(allPosts, cutoff);
  console.log(
    `[sync] 커트라인(${cutoff ? formatKst(cutoff) : "없음 - 최초 실행"}) 이후 변경된 게시글 ${candidates.length}건 발견`,
  );

  // 후보마다 제목을 조회하고 원시 시리즈명·seriesId를 계산한다(FR-007~FR-009).
  // 개별 게시글 조회가 실패해도 그 게시글만 건너뛰고 나머지는 계속 처리한다.
  const processedCandidates = [];
  for (const post of candidates) {
    let title;
    try {
      title = await fetchPostTitle(post.canonicalUrl);
    } catch (error) {
      console.error(`[sync] ${post.canonicalUrl} 제목 조회 실패, 이 게시글은 건너뜁니다: ${error.message}`);
      continue;
    }
    const rawSeriesName = extractRawSeriesName(title);
    const seriesId = rawSeriesName ? toSeriesId(rawSeriesName) : null;
    processedCandidates.push({ ...post, title, rawSeriesName, seriesId });
  }

  // 성공적으로 제목을 확인한 후보가 하나도 없으면(대상 자체가 없거나 전부 조회 실패)
  // 워킹 트리를 전혀 건드리지 않고 끝낸다 — cutoff를 진행시키지 않아야 다음 실행에서
  // 이번에 실패한 후보를 다시 후보로 잡아 재시도할 수 있고(자연스러운 재시도),
  // 진짜로 변경 대상이 없었을 때는 diff 자체가 생기지 않는다(User Story 1 시나리오 2,
  // quickstart.md 시나리오 1).
  if (processedCandidates.length === 0) {
    console.log("[sync] 이번 실행에서 새로 처리한 게시글이 없어 워킹 트리를 변경하지 않고 종료합니다.");
    return;
  }

  const existingFiles = listSeriesFiles();
  const changedFiles = new Set();
  const unmatchedBySeriesId = new Map();

  for (const post of processedCandidates) {
    // " - "가 없어 시리즈를 추출할 수 없는 게시글은 매칭·생성 대상에서 제외한다(FR-008).
    if (post.seriesId === null) continue;

    const matched = findMatchingFile(existingFiles, post.seriesId);
    if (matched) {
      if (appendToSeries(matched, post)) changedFiles.add(matched);
      continue;
    }

    if (!unmatchedBySeriesId.has(post.seriesId)) {
      unmatchedBySeriesId.set(post.seriesId, []);
    }
    unmatchedBySeriesId.get(post.seriesId).push(post);
  }

  // 매칭되는 기존 파일이 없는 seriesId는, 이번 실행 후보 + 과거 처리 이력(syncState) 중
  // 지금도 공개된 게시글을 합쳐 2개 이상일 때만 새 파일을 만든다(FR-012, FR-013).
  for (const [seriesId, thisRunSiblings] of unmatchedBySeriesId) {
    const { historicalOnlyRefs } = collectSiblingCandidates(
      seriesId,
      thisRunSiblings,
      state.processedPosts,
      allPosts,
    );

    const historicalOnlyWithTitle = [];
    for (const ref of historicalOnlyRefs) {
      try {
        const title = await fetchPostTitle(ref.canonicalUrl);
        historicalOnlyWithTitle.push({ ...ref, title });
      } catch (error) {
        console.error(
          `[sync] ${ref.canonicalUrl}(과거 처리 이력) 제목 재조회 실패, 이번 판단에서 제외합니다: ${error.message}`,
        );
      }
    }

    const allSiblings = [...thisRunSiblings, ...historicalOnlyWithTitle];
    const created = createSeriesFile(seriesId, allSiblings);
    if (created) {
      changedFiles.add(created);
      console.log(`[sync] 새 시리즈 파일 생성: ${created.filePath}`);
    }
  }

  for (const file of changedFiles) {
    writeSeriesFile(file);
  }

  // 이번 실행에서 제목을 확인한 모든 게시글을 처리 이력에 남긴다(FR-016).
  // rawSeriesName이 null이어도(시리즈 추출 불가) 기록한다 — 후속 제목 변경 감지 기능의 기반이 된다.
  const runProcessedAt = formatKst(runStartedAt);
  for (const post of processedCandidates) {
    upsertProcessedPost(state.processedPosts, {
      url: post.canonicalUrl,
      rawSeriesName: post.rawSeriesName,
      processedAt: runProcessedAt,
    });
  }
  state.cutoff = formatKst(computeCutoff(runStartedAt));
  writeSyncState(state);

  console.log(`[sync] 완료: 시리즈 파일 ${changedFiles.size}개 갱신/생성, 다음 커트라인 ${state.cutoff}`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[sync] 실행 실패: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { decodeHtmlEntities, fetchPostTitle, filterCandidates, run };
