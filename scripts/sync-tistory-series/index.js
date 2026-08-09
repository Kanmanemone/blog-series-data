"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { fetchSitemap } = require("./sitemap.js");
const { extractRawSeriesName, toSeriesId } = require("./seriesName.js");
const {
  computeCutoff,
  readSyncState,
  writeSyncState,
  upsertProcessedPost,
  markDeleted,
  isDriftCandidate,
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
const {
  readAssignments,
  writeAssignments,
  ensureGroupSeeded,
  updateAssignmentForPost,
  resolveReclassifyBatches,
} = require("./seriesAssignments.js");
const { findSeriesIdForUrl, reconcile } = require("./reconcile.js");

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

// 게시글 페이지 HTML을 fetch한다(FR-007).
async function fetchPostHtml(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`게시글 조회 실패: ${url} (HTTP ${response.status})`);
  }
  return response.text();
}

function extractTitle(html, url) {
  const titleMatch = /<title>([^<]*)<\/title>/.exec(html);
  if (!titleMatch) {
    throw new Error(`게시글 제목 조회 실패: ${url} (<title> 태그를 찾을 수 없음)`);
  }
  return decodeHtmlEntities(titleMatch[1]);
}

/**
 * 게시글 상세 페이지에 노출되는 공개 시각(예: "2025. 12. 9. 14:40")을 파싱한다.
 * sitemap의 lastMod(최종 수정 시각)와 별개로, 페이지 자체가 `<span class="date">`로
 * 사람이 읽는 발행 시각을 보여준다(2026-08-09 실측 — kenel.tistory.com의 서로 다른
 * 발행연도·시리즈 게시글 4건에서 동일 마크업 확인, `/speckit-converge` T024). 앞자리
 * 0이 없는 "YYYY. M. D. HH:MM" 형식이며 초 단위가 없다. KST(+09:00) 로컬 시각으로
 * 간주해 UTC ISO 문자열로 변환한다. 마크업을 찾지 못하거나(테마 변경 등) 형식이
 * 다르면 null을 반환하고 실행을 중단하지 않는다 — 순서 계산 시 이 값이 없는 항목은
 * 항상 배열 끝에 배치된다(seriesAssignments.js insertByPublishedAt).
 */
function extractPublishedAt(html) {
  const dateMatch = /<span class="date">([^<]*)<\/span>/.exec(html);
  if (!dateMatch) return null;
  const parts = /^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{1,2}):(\d{2})$/.exec(dateMatch[1].trim());
  if (!parts) return null;
  const [year, month, day, hour, minute] = parts.slice(1).map(Number);
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - 9 * 60 * 60 * 1000;
  return new Date(utcMs).toISOString();
}

// 게시글 페이지에서 <title> 태그 원문만 읽는다(FR-007). 001의 형제 게시글 재조회
// (collectSiblingCandidates 경로)처럼 공개 시각이 필요 없는 호출부가 쓴다.
async function fetchPostTitle(url) {
  const html = await fetchPostHtml(url);
  return extractTitle(html, url);
}

// 같은 HTML 응답 하나로 제목과 공개 시각을 함께 읽는다(추가 HTTP 요청 없음, SC-004 취지
// 유지). 001의 신규 게시글 처리 루프와 002의 드리프트 재확인 루프가 쓴다(T024).
async function fetchPostDetails(url) {
  const html = await fetchPostHtml(url);
  return { title: extractTitle(html, url), publishedAt: extractPublishedAt(html) };
}

// 저장된 cutoff보다 lastmod가 최신인 게시글만 후보로 선별한다(FR-004).
// cutoff가 null이면(최초 실행, sync-state.json 없음) 모든 게시글을 후보로 삼는다.
function filterCandidates(allPosts, cutoff) {
  if (cutoff === null) return allPosts;
  return allPosts.filter((post) => post.lastmod > cutoff);
}

// 배포 이전 레코드(lastMod 없음)는 "변경 여부 불명"이라 항상 후보가 된다(isDriftCandidate).
// 이런 레코드가 한꺼번에 수백 건 몰려 있으면(이 기능을 막 배포한 직후가 전형적인 경우)
// 스로틀링 없이 한 실행에서 전부 재조회하게 되어 SC-004("추적 중인 전체 게시글 수
// 전체를 매번 다시 조회하지 않는다")와 research.md §2의 "점진적 이행" 취지에 어긋난다
// (실측: node --test를 실수로 index.js에 직접 실행시켰다가 이 상황이 실제로 재현됨,
// `/speckit-converge` T022). 회당 이 개수까지만 처리하고 나머지는 다음 실행으로 미룬다 —
// 한 번 처리된 레코드는 lastMod가 채워져 다음 실행부터 이 한도에 걸리지 않으므로, 여러
// 번의 정기 실행에 걸쳐 자연히 소진된다(추가 커서·상태 없이 기존 배열 순서만으로 충분).
const MAX_UNKNOWN_LASTMOD_REFETCH_PER_RUN = 30;

/**
 * 002-post-drift-detection: 이미 처리 이력이 있는 게시글 중 이번 실행에서 재확인할
 * 대상(제목 재조회 후보)과 즉시 삭제·비공개 전환으로 확정할 대상을 가른다(FR-002,
 * FR-005, FR-013). 네트워크 호출이 없는 순수 함수로 분리해 001의 filterCandidates와
 * 같은 방식으로 단독 테스트할 수 있게 한다.
 */
function selectDriftCandidates(processedPosts, sitemapByUrl) {
  const toRefetch = [];
  const toMarkDeleted = [];
  let unknownLastmodBudget = MAX_UNKNOWN_LASTMOD_REFETCH_PER_RUN;

  for (const record of processedPosts) {
    if (record.deletedAt) continue; // 이미 삭제 확정 — 재확인 후보 아님(FR-013)

    const currentPost = sitemapByUrl.get(record.url);
    if (!currentPost) {
      // 목록 조회가 성공했음에도 이 URL이 없다 = 즉시 삭제·비공개 전환 확정(FR-005, 연속 확인 없음)
      toMarkDeleted.push(record.url);
      continue;
    }

    if (!record.lastMod) {
      if (unknownLastmodBudget <= 0) continue; // 이번 실행 상한 초과 — 다음 실행으로 미룸
      unknownLastmodBudget -= 1;
      toRefetch.push(record.url);
      continue;
    }

    if (isDriftCandidate(record, currentPost.lastmod)) {
      toRefetch.push(record.url);
    }
  }

  return { toRefetch, toMarkDeleted };
}

const COMMIT_SUMMARY_PATH = path.join(process.cwd(), ".sync-commit-summary.txt");
const CUD_TYPE_LABEL = { created: "Created", updated: "Updated", deleted: "Deleted" };

// reconcile()이 반환한 CUD 목록을 사람이 읽는 텍스트로 렌더링한다(research.md §6).
// 각 줄은 "- "로 시작하는 불릿 목록이며, 커밋 스텝이 줄 수를 세어 커밋 제목의
// 총 건수(예: "(총 4건)")를 계산할 수 있도록 항목당 정확히 한 줄을 유지한다(FR-012).
function renderCommitSummary(cudSummary) {
  return cudSummary
    .map((entry) => `- ${CUD_TYPE_LABEL[entry.type]}: ${entry.seriesId}_series.json (${entry.detail})`)
    .join("\n");
}

/**
 * 001의 기존 흐름(신규 게시글을 기존 시리즈에 추가, 신규 시리즈 파일 생성)이 만든
 * 변경을 CUD 항목으로 변환한다(FR-012, SC-007 — 드리프트가 없었던 실행도 실제
 * 변경 내역이 커밋 메시지에 남아야 한다, `/speckit-converge` F2). `appendCountsByFile`에
 * 없는 파일은 이번 실행에서 새로 생성된 것으로 간주한다.
 */
function buildNewPostCud(changedFiles, appendCountsByFile) {
  const entries = [];
  for (const file of changedFiles) {
    if (appendCountsByFile.has(file)) {
      entries.push({ type: "updated", seriesId: file.seriesId, detail: `항목 추가 ${appendCountsByFile.get(file)}건` });
    } else {
      entries.push({ type: "created", seriesId: file.seriesId, detail: `${file.data.items.length}건` });
    }
  }
  return entries;
}

// 변경이 있으면 임시 파일에 CUD 요약을 써내고, 없으면(이전 실행의 잔여물 포함) 지운다(FR-012).
function writeCommitSummary(cudSummary) {
  if (cudSummary.length === 0) {
    fs.rmSync(COMMIT_SUMMARY_PATH, { force: true });
    return;
  }
  fs.writeFileSync(COMMIT_SUMMARY_PATH, renderCommitSummary(cudSummary) + "\n", "utf8");
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

  const sitemapByUrl = new Map(allPosts.map((post) => [post.canonicalUrl, post]));

  // ---- 001의 기존 흐름: 커트라인 이후 새로 나타난 게시글 처리 ----
  const candidates = filterCandidates(allPosts, cutoff);
  console.log(
    `[sync] 커트라인(${cutoff ? formatKst(cutoff) : "없음 - 최초 실행"}) 이후 변경된 게시글 ${candidates.length}건 발견`,
  );

  // 후보마다 제목을 조회하고 원시 시리즈명·seriesId를 계산한다(FR-007~FR-009).
  // 개별 게시글 조회가 실패해도 그 게시글만 건너뛰고 나머지는 계속 처리한다.
  const processedCandidates = [];
  for (const post of candidates) {
    let title, publishedAt;
    try {
      ({ title, publishedAt } = await fetchPostDetails(post.canonicalUrl));
    } catch (error) {
      console.error(`[sync] ${post.canonicalUrl} 제목 조회 실패, 이 게시글은 건너뜁니다: ${error.message}`);
      continue;
    }
    const rawSeriesName = extractRawSeriesName(title);
    const seriesId = rawSeriesName ? toSeriesId(rawSeriesName) : null;
    processedCandidates.push({ ...post, title, publishedAt, rawSeriesName, seriesId });
  }

  const changedFiles = new Set();
  // 001의 기존 흐름(신규 게시글 추가·신규 시리즈 생성)이 만든 변경도 커밋 요약에
  // 포함하기 위한 집계다(FR-012, SC-007 — 드리프트가 전혀 없었던 실행도 실제로
  // 무엇이 바뀌었는지 커밋 메시지로 알 수 있어야 한다, `/speckit-converge` F2).
  // seriesId별로 이번 실행에서 기존 파일에 몇 건이 추가됐는지만 세고, 파일 자체를
  // 새로 만든 경우는 changedFiles에는 있지만 이 Map에는 없는 것으로 구분한다.
  const appendCountsByFile = new Map();

  if (processedCandidates.length > 0) {
    const existingFilesForNewPosts = listSeriesFiles();
    const unmatchedBySeriesId = new Map();

    for (const post of processedCandidates) {
      // " - "가 없어 시리즈를 추출할 수 없는 게시글은 매칭·생성 대상에서 제외한다(FR-008).
      if (post.seriesId === null) continue;

      const matched = findMatchingFile(existingFilesForNewPosts, post.seriesId);
      if (matched) {
        if (appendToSeries(matched, post)) {
          changedFiles.add(matched);
          appendCountsByFile.set(matched, (appendCountsByFile.get(matched) || 0) + 1);
        }
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

    // 이번 실행에서 제목을 확인한 모든 게시글을 처리 이력에 남긴다(FR-016 계승, FR-004).
    // rawSeriesName이 null이어도(시리즈 추출 불가) 기록한다 — 후속 드리프트 감지의 기반이 된다.
    const runProcessedAt = formatKst(runStartedAt);
    for (const post of processedCandidates) {
      upsertProcessedPost(state.processedPosts, {
        url: post.canonicalUrl,
        title: post.title,
        lastMod: post.lastmod.toISOString(),
        publishedAt: post.publishedAt,
        processedAt: runProcessedAt,
      });
    }
  }

  const newPostCud = buildNewPostCud(changedFiles, appendCountsByFile);

  // ---- 002-post-drift-detection: 이미 처리된 게시글의 드리프트 감지·반영 ----
  const runProcessedAtForDrift = formatKst(runStartedAt);
  const { toRefetch, toMarkDeleted } = selectDriftCandidates(state.processedPosts, sitemapByUrl);

  for (const url of toMarkDeleted) {
    markDeleted(state.processedPosts, url, runProcessedAtForDrift);
  }

  const driftTouchedUrls = [...toMarkDeleted];

  for (const url of toRefetch) {
    let newTitle, publishedAt;
    try {
      ({ title: newTitle, publishedAt } = await fetchPostDetails(url));
    } catch (error) {
      console.error(`[sync] ${url} 드리프트 재확인용 제목 조회 실패, 이번 실행에서는 건너뜁니다: ${error.message}`);
      continue;
    }
    const currentPost = sitemapByUrl.get(url);
    upsertProcessedPost(state.processedPosts, {
      url,
      title: newTitle,
      lastMod: currentPost.lastmod.toISOString(),
      publishedAt,
      processedAt: runProcessedAtForDrift,
    });
    driftTouchedUrls.push(url);
  }

  // 이번 실행에서 실제로 title·lastMod가 갱신됐거나 deletedAt이 새로 설정된
  // 게시글에 대해서만 배치 결정을 갱신한다(FR-006 — 변경되지 않은 게시글은 다시
  // 계산하지 않는다). 001의 신규 게시글 처리 CUD(newPostCud)는 드리프트 여부와
  // 무관하게 항상 커밋 요약에 포함한다(`/speckit-converge` F2).
  let cudSummary = [...newPostCud];
  if (driftTouchedUrls.length > 0) {
    const seriesFilesForAssignment = listSeriesFiles();
    const assignments = readAssignments();

    // 재분류(시리즈 구분 기준이 바뀌는 경우) 후보는 바로 반영하지 않고 모아뒀다가,
    // 아래에서 목표 seriesId별로 배치 전체를 함께 판단한다 — 같은 실행에서 여러
    // 게시글이 같은 신생 시리즈로 함께 재분류될 때 한 게시글씩 순서대로 판단하면
    // 서로를 "1명뿐"이라고 오판하는 문제가 있었다(`/speckit-converge` F1).
    const reclassifyCandidates = [];

    for (const url of driftTouchedUrls) {
      const record = state.processedPosts.find((r) => r.url === url);
      // 배치 결정이 아직 이 게시글을 모를 수 있으므로(처음 등장하는 드리프트
      // 후보), 실제 시리즈 목차 파일을 기준으로 현재 소속을 찾는다.
      const oldSeriesId = findSeriesIdForUrl(seriesFilesForAssignment, url);
      if (oldSeriesId) {
        ensureGroupSeeded(assignments, oldSeriesId, findMatchingFile(seriesFilesForAssignment, oldSeriesId));
      }

      if (record.deletedAt) {
        updateAssignmentForPost(assignments, { url, deletedAt: record.deletedAt, oldSeriesId });
        continue;
      }

      if (!oldSeriesId) continue; // 아직 어떤 목차에도 반영된 적 없는 게시글 — 이 기능 범위 밖(Edge Cases)

      const rawSeriesName = extractRawSeriesName(record.title);
      const newSeriesId = rawSeriesName ? toSeriesId(rawSeriesName) : null;

      if (!newSeriesId || newSeriesId === oldSeriesId) {
        updateAssignmentForPost(assignments, { url, title: record.title, oldSeriesId, publishedAt: record.publishedAt });
        continue;
      }

      ensureGroupSeeded(assignments, newSeriesId, findMatchingFile(seriesFilesForAssignment, newSeriesId));
      reclassifyCandidates.push({ url, title: record.title, oldSeriesId, newSeriesId, publishedAt: record.publishedAt });
    }

    resolveReclassifyBatches(assignments, reclassifyCandidates);
    writeAssignments(assignments);
    // 매 실행마다 배치 결정 "전체"와 실제 파일 "전체"를 비교한다(FR-008) — 부분
    // 갱신은 배치 결정을 만드는 단계까지고, 재조정은 항상 전체 범위로 수행한다.
    cudSummary = [...newPostCud, ...reconcile(assignments)];
  }

  writeCommitSummary(cudSummary);

  if (processedCandidates.length === 0 && driftTouchedUrls.length === 0) {
    console.log("[sync] 이번 실행에서 반영할 변경이 없어 워킹 트리를 변경하지 않고 종료합니다.");
    return;
  }

  // cutoff는 001의 신규 게시글 후보 판정에만 쓰이므로, 그 판정에서 실제로 뭔가
  // 처리했을 때만 진행시킨다 — 드리프트 반영 여부와 무관하게, 신규 후보 전체가
  // 조회 실패했다면(processedCandidates가 비어도 candidates는 있었을 수 있음)
  // 다음 실행에서 같은 후보를 다시 잡아 재시도할 수 있어야 한다(기존 001 동작 유지).
  if (processedCandidates.length > 0) {
    state.cutoff = formatKst(computeCutoff(runStartedAt));
  }
  writeSyncState(state);

  console.log(
    `[sync] 완료: 목차 변경 총 ${cudSummary.length}건(신규 게시글 처리 ${newPostCud.length}건 포함), 다음 커트라인 ${state.cutoff ?? "(변경 없음)"}`,
  );
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[sync] 실행 실패: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  decodeHtmlEntities,
  fetchPostTitle,
  extractPublishedAt,
  filterCandidates,
  selectDriftCandidates,
  MAX_UNKNOWN_LASTMOD_REFETCH_PER_RUN,
  buildNewPostCud,
  renderCommitSummary,
  run,
};
