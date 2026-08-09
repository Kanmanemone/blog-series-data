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
 * processedPosts에 게시글 처리 기록을 upsert한다(FR-004, FR-016). 같은 URL이 이미
 * 있으면 전달된 필드(url 제외)만 덮어쓰고 나머지 필드(예: deletedAt)는 보존한다 —
 * 002가 markDeleted로 설정한 deletedAt이 001의 원래 새 게시글 처리 경로에서 이
 * 함수를 다시 호출했다고 지워지면 안 되기 때문이다. 새 URL이면 전달된 필드만으로
 * 새 레코드를 만든다.
 */
function upsertProcessedPost(processedPosts, { url, title, lastMod, processedAt }) {
  const existingIndex = processedPosts.findIndex((record) => record.url === url);
  const patch = { title, lastMod, processedAt };
  if (existingIndex === -1) {
    processedPosts.push({ url, ...patch });
  } else {
    processedPosts[existingIndex] = { ...processedPosts[existingIndex], ...patch };
  }
}

/**
 * 게시글이 공개 목록 조회 결과에 없어 삭제·비공개 전환으로 확정됐을 때, 해당
 * 레코드에 deletedAt을 설정한다(FR-005, FR-013). processedPosts에 아직 레코드가
 * 없는 URL이면 아무 것도 하지 않는다 — 이 기능은 "이미 목차에 반영된" 게시글만
 * 다루므로(spec.md Edge Cases), 애초에 처리 이력이 없는 URL은 대상이 아니다.
 */
function markDeleted(processedPosts, url, deletedAt) {
  const record = processedPosts.find((r) => r.url === url);
  if (record) record.deletedAt = deletedAt;
}

/**
 * 게시글을 이번 실행에서 다시 확인해야 하는지 판별한다(FR-002, FR-013).
 * `record.lastMod`는 마지막으로 "확인"한 sitemap lastmod를 뜻하는 처리 이력 필드로,
 * sitemap이 매번 새로 알려주는 Post.lastmod(소문자 lastmod, 001의 기존 필드)와는
 * 이름은 비슷해도 서로 다른 값이다(data-model.md "케이싱 참고"). 이미 삭제·비공개
 * 전환이 확정된(deletedAt 설정) 레코드는 항상 제외한다. lastMod가 기록되어 있지
 * 않으면(이 기능 배포 이전 레코드) "변경 여부 불명"으로 간주해 항상 후보에 포함시킨다.
 */
function isDriftCandidate(record, currentLastmod) {
  if (record.deletedAt) return false;
  if (!record.lastMod) return true;
  return currentLastmod > new Date(record.lastMod);
}

module.exports = {
  DEFAULT_STATE_PATH,
  formatKst,
  computeCutoff,
  readSyncState,
  writeSyncState,
  upsertProcessedPost,
  markDeleted,
  isDriftCandidate,
};
