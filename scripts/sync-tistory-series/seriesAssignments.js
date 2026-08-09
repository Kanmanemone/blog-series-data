"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { extractRawSeriesName } = require("./seriesName.js");

const DEFAULT_ASSIGNMENTS_PATH = path.join(".github", "series-assignments.json");

/**
 * .github/series-assignments.json을 읽는다. 파일이 없으면 아직 어떤 게시글도
 * 배치되지 않은 것으로 간주해 빈 객체를 반환한다(data-model.md "Series Assignment").
 */
function readAssignments(filePath = DEFAULT_ASSIGNMENTS_PATH) {
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeAssignments(assignments, filePath = DEFAULT_ASSIGNMENTS_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(assignments, null, 2) + "\n", "utf8");
}

/**
 * seriesId 그룹이 아직 배치 결정에 없으면, 실제 시리즈 목차 파일(seriesFile)의
 * 현재 items로 시드(seed)한다. 구현 중 발견한 필수 보강: data-model.md의 "부분
 * 갱신 규칙"은 이번 실행에서 바뀐 게시글만 배치 결정에 반영한다고 했지만, 어떤
 * seriesId 그룹이 배치 결정에 처음 등장할 때 그 시리즈에 이미 있던 다른 게시글들을
 * 시드해 두지 않으면, 재조정(reconcile.js)이 "배치 결정에 posts가 1개뿐"이라고
 * 오판해 아직 멀쩡한 시리즈 파일을 통째로 지워버린다. seriesFile이 없으면(아직
 * 목차에 없던 시리즈) 빈 상태로 새로 시작한다.
 */
function ensureGroupSeeded(assignments, seriesId, seriesFile) {
  if (assignments[seriesId]) return;
  if (!seriesFile) return;
  assignments[seriesId] = {
    listName: seriesFile.data.listName,
    posts: seriesFile.data.items.map((item) => ({ url: item.url, title: item.title })),
  };
}

function upsertInGroup(assignments, seriesId, post, listNameIfCreating) {
  if (!assignments[seriesId]) {
    assignments[seriesId] = { listName: listNameIfCreating, posts: [] };
  }
  const group = assignments[seriesId];
  const index = group.posts.findIndex((p) => p.url === post.url);
  if (index === -1) {
    group.posts.push({ url: post.url, title: post.title });
  } else {
    group.posts[index] = { url: post.url, title: post.title };
  }
}

function removeFromGroup(assignments, seriesId, url) {
  const group = assignments[seriesId];
  if (!group) return;
  group.posts = group.posts.filter((post) => post.url !== url);
}

/**
 * 게시글 하나의 배치 결정을 갱신한다(FR-006, FR-007; research.md §3) — 시리즈
 * 구분 기준이 안 바뀐 순수 텍스트 갱신, 또는 삭제 확정만 다룬다. 시리즈 구분
 * 기준이 달라지는 재분류는 여러 게시글을 배치로 함께 판단해야 하므로
 * resolveReclassifyBatches가 전담한다(아래) — 이 함수는 그 판단을 하지 않는다.
 *
 * 호출자(index.js)가 "이번 실행에서 title·lastMod가 새로 확인됐거나 deletedAt이
 * 새로 설정된" 게시글에 대해서만 이 함수를 호출함으로써 FR-006의 "변경된
 * 게시글만 갱신" 요구를 만족시킨다.
 *
 * oldSeriesId는 실제 시리즈 목차 파일 기준으로 이 게시글이 현재 어디에 있는지를
 * 호출자가 미리 찾아 전달한다(001의 append-only 파일이 유일한 진실 공급원이며,
 * 배치 결정은 아직 이 게시글을 몰랐을 수 있으므로). oldSeriesId가 null이면
 * 이 게시글이 어떤 시리즈 목차 파일에도 반영된 적이 없다는 뜻이며, 이 기능은
 * "이미 목차에 반영된" 게시글만 다루므로(spec.md Edge Cases) 호출자는 그 경우
 * 이 함수를 호출하지 않아야 한다(삭제 확정 경로는 예외 — null이어도 안전하게 no-op).
 */
function updateAssignmentForPost(assignments, { url, title, deletedAt, oldSeriesId }) {
  if (deletedAt) {
    if (oldSeriesId) removeFromGroup(assignments, oldSeriesId, url);
    return;
  }
  if (oldSeriesId) upsertInGroup(assignments, oldSeriesId, { url, title });
}

/**
 * 같은 실행에서 시리즈 구분 기준이 바뀌어 재분류되려는 게시글들을 목표
 * newSeriesId별로 묶어, 배치 전체를 합쳤을 때 목차 파일 생성 기준(2개 이상)을
 * 충족하는지 한 번에 판단하고 실행한다(FR-006, FR-007; research.md §3).
 *
 * 개별 게시글을 순서대로 판단하면, 같은 실행에서 여러 게시글이 같은 신생
 * 시리즈로 함께 재분류될 때 각자 "그룹이 1명뿐"이라고 오판해 아무도 이동하지
 * 못하는 문제가 있었다(구현 검증 중 발견 — `/speckit-converge` F1. User Story 1
 * 시나리오 3의 "이번 이동만으로 2개 이상의 게시글 요건을 충족할 때"는 배치
 * 전체를 함께 세야만 실현된다). 배치를 합쳐도 2개 미만이면 전원 이동을
 * 보류하고 있던 자리에서 제목만 갱신한다(시나리오 5와 동일한 규칙).
 *
 * candidates는 `[{url, title, oldSeriesId, newSeriesId}]` 배열이며, newSeriesId는
 * 호출자가 이미 계산해 전달한다(oldSeriesId와 달라야 하고, null이 아니어야 함).
 */
function resolveReclassifyBatches(assignments, candidates) {
  const byNewSeriesId = new Map();
  for (const candidate of candidates) {
    if (!byNewSeriesId.has(candidate.newSeriesId)) byNewSeriesId.set(candidate.newSeriesId, []);
    byNewSeriesId.get(candidate.newSeriesId).push(candidate);
  }

  for (const [newSeriesId, movers] of byNewSeriesId) {
    const existingSize = assignments[newSeriesId] ? assignments[newSeriesId].posts.length : 0;
    const willMove = existingSize + movers.length >= 2;

    for (const { url, title, oldSeriesId } of movers) {
      if (willMove) {
        if (oldSeriesId) removeFromGroup(assignments, oldSeriesId, url);
        upsertInGroup(assignments, newSeriesId, { url, title }, extractRawSeriesName(title));
      } else if (oldSeriesId) {
        upsertInGroup(assignments, oldSeriesId, { url, title });
      }
    }
  }
}

module.exports = {
  DEFAULT_ASSIGNMENTS_PATH,
  readAssignments,
  writeAssignments,
  ensureGroupSeeded,
  updateAssignmentForPost,
  resolveReclassifyBatches,
};
