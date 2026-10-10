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
  findSeriesIdForUrl,
  appendBatch,
  retitleItem,
  removeItem,
  writeSeriesFile,
  collectSiblingCandidates,
  createSeriesFile,
} = require("./seriesFiles.js");
const NAMED_ENTITY_CODEPOINTS = require("./htmlNamedEntities.js");

// 003-fix-rarr-entity-decode 사후 분석(&rarr; 다음 &times;가 같은 방식으로 또 발견됨,
// speckit-converge T009-T011): "실측되는 대로 하나씩 이름을 등록"하는 화이트리스트
// 방식은 다음에 등록되지 않은 이름이 나타나는 것 자체를 막지 못한다. 대신
// htmlNamedEntities.js에 HTML 4.01/XHTML1이 확정한 이름 있는 문자 참조 표 전체(1999년
// 이후 변경 없음, ~250개)를 내장해, 이름 있는 엔티티도 숫자 문자 참조(&#39;, &#x2192;)와
// 동일하게 "코드포인트를 찾아 String.fromCodePoint로 바꾼다"는 하나의 경로로 처리한다.
// 그 표에도 없는 이름(HTML5에서 새로 생긴 것 등 진짜 예외적인 경우)을 만나면
// extractTitle이 예외를 던져(hasUnresolvedNamedEntity) 그 게시글을 이번 실행에서
// 건너뛰게 만든다 — run()의 기존 fetchPostTitle/fetchPostDetails try/catch가 이미
// "조회 실패 시 그 게시글만 건너뛰고 로그를 남긴다"를 하고 있으므로, 원문이 series
// 목차나 sync-state에 조용히 저장되는 대신 사람이 로그로 알아차릴 때까지 안전하게
// 보류된다(별도 재시도 장치 불필요).
const ENTITY_PATTERN = /&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

function decodeHtmlEntities(text) {
  return text.replace(ENTITY_PATTERN, (match, body) => {
    let codePoint;
    if (body[0] === "#") {
      codePoint = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    } else {
      codePoint = NAMED_ENTITY_CODEPOINTS[body];
      if (codePoint === undefined) return match; // 표에 없는 이름 - 원문 보존, hasUnresolvedNamedEntity가 나중에 감지
    }
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return match; // 코드포인트 범위를 벗어나는 등 비정상 값은 원문을 보존한다.
    }
  });
}

// decodeHtmlEntities 이후에도 이름 있는 엔티티가 남아있으면 true. 숫자 문자 참조와
// htmlNamedEntities.js에 있는 이름은 decodeHtmlEntities가 항상 해소하므로(비정상
// 코드포인트 제외) 이 시점에 남는 것은 그 표에도 없는 이름뿐이다.
function hasUnresolvedNamedEntity(text) {
  return /&[a-zA-Z][a-zA-Z0-9]*;/.test(text);
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
  const decoded = decodeHtmlEntities(titleMatch[1]);
  if (hasUnresolvedNamedEntity(decoded)) {
    throw new Error(
      `게시글 제목에 처리하지 못한 HTML 엔티티가 남아있음: ${url} (제목: "${decoded}") — ` +
        "htmlNamedEntities.js(HTML 4.01/XHTML1 표준 표)에도 없는 이름임. 새 엔티티를 등록해야 함(원문 그대로 저장하지 않고 이번 실행에서 건너뜀)",
    );
  }
  return decoded;
}

/**
 * 게시글 상세 페이지에 노출되는 공개 시각(예: "2025. 12. 9. 14:40")을 파싱한다.
 * sitemap의 lastMod(최종 수정 시각)와 별개로, 페이지 자체가 `<span class="date">`로
 * 사람이 읽는 발행 시각을 보여준다(2026-08-09 실측 — kenel.tistory.com의 서로 다른
 * 발행연도·시리즈 게시글 4건에서 동일 마크업 확인, `/speckit-converge` T024). 앞자리
 * 0이 없는 "YYYY. M. D. HH:MM" 형식이며 초 단위가 없다. KST(+09:00) 로컬 시각으로
 * 간주해 UTC ISO 문자열로 변환한다. 마크업을 찾지 못하거나(테마 변경 등) 형식이
 * 다르면 null을 반환하고 실행을 중단하지 않는다 — 한 번에 붙이는 묶음을 공개 시각 순으로
 * 정렬할 때 이 값이 없는 글은 묶음 맨 뒤에 놓인다(seriesFiles.js orderByPublishedAt).
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

/**
 * 004-fix-edited-title-sync: filterCandidates는 "커트라인 이후 수정된 모든 게시글"을
 * 고르므로, 이미 목차에 반영된 게시글을 수정해도 신규 게시글 흐름의 후보가 된다.
 * 그 흐름은 목차에 이미 있는 항목을 "정보 갱신"으로만 세고 처리 이력의 title·lastMod를
 * 새 값으로 덮어써, 같은 실행의 selectDriftCandidates가 "lastMod 변화 없음"으로
 * 판단하게 만들었다 — 제목 변경이 영구히 목차에 반영되지 않았다(2026-10-08 실행의
 * 435 사례). 그래서 처리 이력에 deletedAt 없이 레코드가 있고 어떤 *_series.json에든
 * 이미 들어 있는 게시글은 여기서 뺀다. 이 게시글들의 처리 이력 lastMod는 그대로
 * 남으므로 같은 실행의 드리프트 감지가 재조회·제목 갱신·재분류까지 맡는다(002 범위).
 * 처리 이력이 없는(수동 추가) 항목이나 아직 어떤 목차에도 없는 게시글은 기존처럼
 * 신규 게시글 흐름이 처리한다 — 드리프트 감지는 그런 게시글을 보지 않기 때문이다
 * (수동 추가 항목은 그 흐름에서 제목만 그 자리에서 맞춘다, 005 FR-007).
 */
function excludeAlreadyListed(candidates, processedPosts, seriesFiles) {
  const trackedUrls = new Set(processedPosts.filter((record) => !record.deletedAt).map((record) => record.url));
  return candidates.filter(
    (post) => !(trackedUrls.has(post.canonicalUrl) && findSeriesIdForUrl(seriesFiles, post.canonicalUrl)),
  );
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

// 003-post-sync-commit-categories(spec.md User Story 4, research.md 결정 5): 커밋
// 메시지 본문은 파일명·게시글 제목 같은 개별 상세를 나열하지 않고(git diff가 이미
// 보여줌), "게시글"(시리즈 파일엔 영향 없이 sync-state.json에만 남는 변경)과
// "시리즈"(*_series.json에 실제로 반영되는 변경) 두 그룹으로 나눠 카테고리별 합산
// 건수만 표시한다. 배열 순서가 곧 본문에 나열되는 순서다.
const POST_CATEGORIES = [
  ["postNew", "새 글"],
  ["postInfoUpdate", "정보 갱신"],
  ["postDeleted", "삭제"],
];
const SERIES_CATEGORIES = [
  ["seriesCreated", "생성"],
  ["seriesAdded", "항목 추가"],
  ["seriesRemoved", "항목 제거"],
  ["seriesRetitled", "제목 갱신"],
  ["seriesDeleted", "삭제"],
];

// 카테고리 중 이번 실행에서 실제로 건수가 있는 것만 "  - <라벨>: n건" 줄로 만든다(FR-013,
// FR-014 — 0건인 카테고리는 줄 자체를 만들지 않음). 2칸 들여쓰기는 "- " 마커 폭에
// 맞춘 것으로, 상위 그룹 헤더 줄("- 게시글"/"- 시리즈")의 자식임을 나타낸다.
function buildCategoryLines(counts, categories) {
  return categories.filter(([key]) => counts[key] > 0).map(([key, label]) => `  - ${label}: ${counts[key]}건`);
}

/**
 * 8개 카테고리 집계(counts)를 "chore: 게시글 동기화" 커밋의 본문 텍스트로 만든다
 * (FR-012~FR-015). "게시글"·"시리즈" 그룹은 소속 카테고리가 모두 0건이면 그룹 헤더
 * 줄 자체를 생략한다(FR-015) — 예를 들어 이번 실행에 시리즈 파일 변경이 전혀 없었으면
 * "- 시리즈" 줄이 아예 나오지 않는다.
 */
function buildCommitMessageBody(counts) {
  const lines = [];
  const postLines = buildCategoryLines(counts, POST_CATEGORIES);
  if (postLines.length > 0) lines.push("- 게시글", ...postLines);
  const seriesLines = buildCategoryLines(counts, SERIES_CATEGORIES);
  if (seriesLines.length > 0) lines.push("- 시리즈", ...seriesLines);
  return lines.join("\n");
}

// 커밋 제목의 총 건수(N)는 8개 카테고리 값의 합이다(FR-016).
function totalCount(counts) {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

// 변경이 있으면 임시 파일 첫 줄에 N을, 이어지는 줄에 본문을 써낸다(워크플로우가
// `head -n1`로 N을, `tail -n +2`로 본문을 읽는다 — 중첩된 그룹 헤더 줄까지 세어버리는
// `wc -l`보다 정확하다). 변경이 없으면(이전 실행의 잔여물 포함) 파일을 지운다.
function writeCommitSummary(counts) {
  const total = totalCount(counts);
  if (total === 0) {
    fs.rmSync(COMMIT_SUMMARY_PATH, { force: true });
    return;
  }
  fs.writeFileSync(COMMIT_SUMMARY_PATH, `${total}\n${buildCommitMessageBody(counts)}\n`, "utf8");
}

/**
 * 005-drop-series-assignments: run()이 메모리에서 고친 목차 파일을 디스크에 반영하고 커밋
 * 요약의 "시리즈" 건수를 센다. editsByFile에는 실제로 바뀐 기존 파일만 들어 있으므로
 * 바뀌지 않은 파일은 다시 쓰지 않는다(FR-009). 집계 의미는 002의 reconcile()과 같다 —
 * 새 파일은 "생성" 1건만, 항목이 1개 이하로 줄어든 기존 파일은 지우고 "삭제" 1건만(그
 * 파일에서 일어난 추가·제거·제목 갱신은 세지 않음), 그 외에는 추가·제거·제목 갱신 건수를
 * 그대로 더한다.
 */
function finalizeSeriesEdits(editsByFile, createdFiles, counts) {
  for (const file of createdFiles) {
    // 같은 실행에서 만든 뒤 재분류로 다시 빠져 2개 미만이 된 새 파일은 아예 만들지 않는다.
    if (file.data.items.length < 2) continue;
    writeSeriesFile(file);
    counts.seriesCreated += 1;
  }
  for (const [file, edits] of editsByFile) {
    if (createdFiles.has(file)) continue;
    if (file.data.items.length < 2) {
      fs.rmSync(file.filePath, { force: true });
      counts.seriesDeleted += 1;
      continue;
    }
    writeSeriesFile(file);
    counts.seriesAdded += edits.added;
    counts.seriesRemoved += edits.removed;
    counts.seriesRetitled += edits.retitled;
  }
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

  // 003-post-sync-commit-categories: 이번 실행에서 커밋 메시지에 남길 8개 카테고리
  // 집계. "시리즈" 5종은 실행 끝의 finalizeSeriesEdits가 목차 파일 편집 결과로 채우고,
  // "게시글" 3종은 목차 편집으로 잡히지 않는(시리즈에 속하지 않거나 제목이 그대로인)
  // 지점에서 직접 증가시킨다(research.md 결정 5, 005에서 reconcile() → finalizeSeriesEdits).
  const counts = {
    postNew: 0,
    postInfoUpdate: 0,
    postDeleted: 0,
    seriesCreated: 0,
    seriesAdded: 0,
    seriesRemoved: 0,
    seriesRetitled: 0,
    seriesDeleted: 0,
  };

  // 005-drop-series-assignments: 목차 파일(*_series.json)이 게시글 소속·제목·순서의
  // 유일한 기준이다. 001(신규 게시글)과 002(드리프트) 단계가 아래 목록 하나를 메모리에서
  // 함께 고치고, 실행 끝(finalizeSeriesEdits)에서 바뀐 파일만 쓰거나 지우며 커밋 요약
  // 건수를 센다. 편집은 seriesFiles.js의 appendBatch/retitleItem/removeItem과 새 파일
  // 생성뿐이라 기존 항목 순서는 어떤 경로로도 바뀌지 않는다(헌법 v1.1.0 원칙 I).
  const seriesFiles = listSeriesFiles();
  const editsByFile = new Map(); // 기존 파일 → 이번 실행의 {added, removed, retitled}
  const createdFiles = new Set();
  const noteEdit = (file, kind, n = 1) => {
    if (n === 0) return;
    if (!editsByFile.has(file)) editsByFile.set(file, { added: 0, removed: 0, retitled: 0 });
    editsByFile.get(file)[kind] += n;
  };
  const fileContaining = (url) => findMatchingFile(seriesFiles, findSeriesIdForUrl(seriesFiles, url));
  // 다른 시리즈로 옮겨가는 글을 원래 목차에서 뺀다(002 재분류, 001 새 목차 생성 공통).
  const removeFromCurrentFile = (url) => {
    const file = fileContaining(url);
    if (file && removeItem(file, url)) noteEdit(file, "removed");
  };
  const addCreatedFile = (file) => {
    seriesFiles.push(file);
    createdFiles.add(file);
  };

  // ---- 001의 기존 흐름: 커트라인 이후 새로 나타난 게시글 처리 ----
  const changedSinceCutoff = filterCandidates(allPosts, cutoff);
  const candidates = excludeAlreadyListed(changedSinceCutoff, state.processedPosts, seriesFiles);
  console.log(
    `[sync] 커트라인(${cutoff ? formatKst(cutoff) : "없음 - 최초 실행"}) 이후 변경된 게시글 ${changedSinceCutoff.length}건 발견` +
      `(이미 목차에 있어 드리프트 감지로 넘긴 게시글 ${changedSinceCutoff.length - candidates.length}건)`,
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

  if (processedCandidates.length > 0) {
    const unmatchedBySeriesId = new Map();
    // 같은 기존 목차에 이번 실행에서 붙을 글을 모았다가 한 묶음으로 붙인다 — 묶음 안에서만
    // 공개 시각 순으로 정렬된다(appendBatch).
    const appendsByFile = new Map();

    for (const post of processedCandidates) {
      // 이미 어떤 목차에 있는데 여기까지 온 글(excludeAlreadyListed를 통과 = 처리 이력이
      // 없는 수동 추가 항목이거나 삭제 확정 레코드)은 다른 목차에 또 붙이지 않고 그 자리에서
      // 제목만 맞춘다(005 FR-007). 이 실행 뒤에는 처리 이력이 생기므로, 새 제목이 다른
      // 시리즈를 가리키면 이후 재분류는 드리프트 감지가 맡는다.
      const listedFile = fileContaining(post.canonicalUrl);
      if (listedFile) {
        if (retitleItem(listedFile, post.canonicalUrl, post.title)) noteEdit(listedFile, "retitled");
        else counts.postInfoUpdate += 1;
        continue;
      }

      // " - "가 없어 시리즈를 추출할 수 없는 게시글은 매칭·생성 대상에서 제외한다(FR-008).
      // sync-state.json에는 기록되지만 시리즈에는 반영되지 않으므로 "새 글"로 센다(FR-009).
      if (post.seriesId === null) {
        counts.postNew += 1;
        continue;
      }

      const matched = findMatchingFile(seriesFiles, post.seriesId);
      if (matched) {
        if (!appendsByFile.has(matched)) appendsByFile.set(matched, []);
        appendsByFile.get(matched).push(post);
        continue;
      }

      if (!unmatchedBySeriesId.has(post.seriesId)) {
        unmatchedBySeriesId.set(post.seriesId, []);
      }
      unmatchedBySeriesId.get(post.seriesId).push(post);
    }

    for (const [file, posts] of appendsByFile) {
      noteEdit(file, "added", appendBatch(file, posts));
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
        // 과거 이력 형제 중에는 002의 재분류 보류(새 시리즈가 1개뿐이라 옛 목차에 남김)로
        // 다른 목차에 남아 있던 글이 있을 수 있다. 이번에 새 목차가 생기므로 002 규칙대로
        // 옛 목차에서 빼서 옮긴다 — 빼지 않으면 같은 글이 두 목차에 동시에 있게 된다.
        for (const sibling of historicalOnlyWithTitle) removeFromCurrentFile(sibling.canonicalUrl);
        addCreatedFile(created);
        console.log(`[sync] 새 시리즈 파일 생성: ${created.filePath}`);
      } else {
        // 형제를 합쳐도 2명 미만이라 파일이 만들어지지 않음 — 이번 실행 후보들은
        // sync-state.json에만 기록되고 시리즈에는 반영되지 않으므로 "새 글"이다(FR-009).
        // historicalOnlyWithTitle은 과거 실행에서 이미 처리 이력에 기록됐으므로 세지 않는다.
        counts.postNew += thisRunSiblings.length;
      }
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

  // ---- 002-post-drift-detection: 이미 처리된 게시글의 드리프트 감지·반영 ----
  const runProcessedAtForDrift = formatKst(runStartedAt);
  const { toRefetch, toMarkDeleted } = selectDriftCandidates(state.processedPosts, sitemapByUrl);

  for (const url of toMarkDeleted) {
    markDeleted(state.processedPosts, url, runProcessedAtForDrift);
  }

  const driftTouchedUrls = [...toMarkDeleted];

  // 재조회 직전의 제목을 기억해 둔다 — upsertProcessedPost가 곧바로 덮어써 버리므로,
  // 나중에(아래 목차 반영 루프에서) "제목 텍스트가 실제로 바뀌었는지"를 판단하려면
  // 미리 캡처해 둬야 한다(정보 갱신 카테고리 판정, FR-010).
  const driftOldTitles = new Map();

  for (const url of toRefetch) {
    let newTitle, publishedAt;
    try {
      ({ title: newTitle, publishedAt } = await fetchPostDetails(url));
    } catch (error) {
      console.error(`[sync] ${url} 드리프트 재확인용 제목 조회 실패, 이번 실행에서는 건너뜁니다: ${error.message}`);
      continue;
    }
    const previousRecord = state.processedPosts.find((r) => r.url === url);
    driftOldTitles.set(url, previousRecord ? previousRecord.title : undefined);
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

  // 이번 실행에서 실제로 title·lastMod가 갱신됐거나 deletedAt이 새로 설정된 게시글만
  // 목차에 반영한다(FR-006 — 변경되지 않은 게시글은 다시 계산하지 않는다).
  // 재분류(시리즈 구분 기준이 바뀌는 경우) 후보는 바로 반영하지 않고 모아뒀다가, 아래에서
  // 목표 seriesId별로 묶어 함께 판단한다 — 같은 실행에서 여러 게시글이 같은 신생 시리즈로
  // 함께 재분류될 때 한 게시글씩 판단하면 서로를 "1명뿐"이라고 오판한다(`/speckit-converge` F1).
  const reclassifyByNewSeriesId = new Map();

  for (const url of driftTouchedUrls) {
    const record = state.processedPosts.find((r) => r.url === url);
    const currentFile = fileContaining(url);

    if (record.deletedAt) {
      // 목차에 없던 게시글의 삭제 확정은 목차 편집으로 잡히지 않으므로 "게시글 - 삭제"로
      // 직접 센다(FR-011). 목차에 있었으면 항목 제거(또는 실행 끝의 파일 삭제)로 잡힌다.
      if (!currentFile) counts.postDeleted += 1;
      else if (removeItem(currentFile, url)) noteEdit(currentFile, "removed");
      continue;
    }

    if (!currentFile) {
      // 아직 어떤 목차에도 반영된 적 없는 게시글 — 이 기능 범위 밖(Edge Cases).
      // sync-state.json만 갱신됐으므로 "정보 갱신"으로 센다(FR-010).
      counts.postInfoUpdate += 1;
      continue;
    }

    // 제목 텍스트가 실제로는 안 바뀐 재확인(lastMod/publishedAt만 갱신)은 목차 편집으로
    // 잡히지 않으므로 여기서 "정보 갱신"으로 센다(FR-010).
    if (driftOldTitles.get(url) === record.title) {
      counts.postInfoUpdate += 1;
    }

    const rawSeriesName = extractRawSeriesName(record.title);
    const newSeriesId = rawSeriesName ? toSeriesId(rawSeriesName) : null;

    if (!newSeriesId || newSeriesId === currentFile.seriesId) {
      if (retitleItem(currentFile, url, record.title)) noteEdit(currentFile, "retitled");
      continue;
    }

    if (!reclassifyByNewSeriesId.has(newSeriesId)) reclassifyByNewSeriesId.set(newSeriesId, []);
    reclassifyByNewSeriesId.get(newSeriesId).push({
      title: record.title,
      canonicalUrl: url,
      publishedAt: record.publishedAt ?? null,
      rawSeriesName,
      currentFile,
    });
  }

  // 새 시리즈에 목차 파일이 이미 있거나, 이번에 함께 옮겨가는 글이 2개 이상이면 옮긴다
  // (002 User Story 1 시나리오 3·5). 아니면 옛 목차에 그대로 두고 제목만 갱신한다 —
  // 재분류 대상 글이 어느 목차에도 없는 상태를 만들지 않는다.
  for (const [newSeriesId, movers] of reclassifyByNewSeriesId) {
    const target = findMatchingFile(seriesFiles, newSeriesId);
    if (!target && movers.length < 2) {
      for (const mover of movers) {
        if (retitleItem(mover.currentFile, mover.canonicalUrl, mover.title)) noteEdit(mover.currentFile, "retitled");
      }
      continue;
    }
    for (const mover of movers) {
      if (removeItem(mover.currentFile, mover.canonicalUrl)) noteEdit(mover.currentFile, "removed");
    }
    if (target) noteEdit(target, "added", appendBatch(target, movers));
    else addCreatedFile(createSeriesFile(newSeriesId, movers));
  }

  finalizeSeriesEdits(editsByFile, createdFiles, counts);

  writeCommitSummary(counts);

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
    `[sync] 완료: 총 ${totalCount(counts)}건(게시글 ${counts.postNew + counts.postInfoUpdate + counts.postDeleted}건, ` +
      `시리즈 ${counts.seriesCreated + counts.seriesAdded + counts.seriesRemoved + counts.seriesRetitled + counts.seriesDeleted}건), ` +
      `다음 커트라인 ${state.cutoff ?? "(변경 없음)"}`,
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
  hasUnresolvedNamedEntity,
  extractTitle,
  fetchPostTitle,
  extractPublishedAt,
  filterCandidates,
  excludeAlreadyListed,
  selectDriftCandidates,
  MAX_UNKNOWN_LASTMOD_REFETCH_PER_RUN,
  buildCommitMessageBody,
  run,
};
