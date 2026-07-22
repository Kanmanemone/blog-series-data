"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_STATE_PATH = path.join(".github", "sync-state.json");

/**
 * Date를 KST(+09:00) 오프셋 문자열로 포맷한다. 실행 환경의 시간대(TZ)나
 * Intl 기본 타임존에 의존하지 않도록, UTC epoch에 9시간을 직접 더한 뒤
 * UTC getter로 값을 읽어 조합한다(FR-002, research.md §5).
 */
function formatKst(date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const year = kst.getUTCFullYear();
  const month = pad(kst.getUTCMonth() + 1);
  const day = pad(kst.getUTCDate());
  const hours = pad(kst.getUTCHours());
  const minutes = pad(kst.getUTCMinutes());
  const seconds = pad(kst.getUTCSeconds());
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+09:00`;
}

// 이번 실행의 커트라인 = 실행 시작 시각 - 5분(FR-003, 안전 마진).
function computeCutoff(runStartedAt = new Date()) {
  return new Date(runStartedAt.getTime() - 5 * 60 * 1000);
}

/**
 * .github/sync-state.json을 읽는다. 파일이 없으면 최초 실행으로 간주해
 * cutoff 없이(전체 sitemap 대상) 빈 processedPosts로 시작한다(quickstart.md 사전 준비).
 */
function readSyncState(filePath = DEFAULT_STATE_PATH) {
  if (!fs.existsSync(filePath)) {
    return { cutoff: null, processedPosts: [] };
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeSyncState(state, filePath = DEFAULT_STATE_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/**
 * processedPosts에 게시글 처리 기록을 upsert한다(FR-016). 같은 URL이 이미
 * 있으면 rawSeriesName·processedAt을 최신 값으로 덮어써, "마지막 처리 시각"이라는
 * 필드 의미를 지킨다. 새 URL이면 배열 끝에 추가한다.
 */
function upsertProcessedPost(processedPosts, { url, rawSeriesName, processedAt }) {
  const existingIndex = processedPosts.findIndex((record) => record.url === url);
  const record = { url, rawSeriesName, processedAt };
  if (existingIndex === -1) {
    processedPosts.push(record);
  } else {
    processedPosts[existingIndex] = record;
  }
}

module.exports = {
  DEFAULT_STATE_PATH,
  formatKst,
  computeCutoff,
  readSyncState,
  writeSyncState,
  upsertProcessedPost,
};
