"use strict";

// keyword_filename_formatter.html과 동일한 파일명 정규화 규칙(research.md §4):
// 공백 전부 제거 → 소문자 변환 → Windows 파일명 금지 문자(\ / : * ? " < > |) 제거.
function toSeriesId(rawSeriesName) {
  return rawSeriesName
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, "");
}

/**
 * 게시글 제목에서 원시 시리즈명을 추출한다(FR-008).
 * 제목에서 마지막으로 등장하는 " - " 앞부분을 취하고, 그 부분에서 대괄호로
 * 감싸인 구간([...])을 위치에 상관없이 모두 제거한 뒤 좌우 공백을 정리한다.
 * " - "가 없거나, 제거·정리 후 남는 내용이 없으면 null을 반환한다.
 */
function extractRawSeriesName(title) {
  if (typeof title !== "string") return null;

  const lastSeparatorIndex = title.lastIndexOf(" - ");
  if (lastSeparatorIndex === -1) return null;

  const beforeSeparator = title.slice(0, lastSeparatorIndex);
  const withoutBrackets = beforeSeparator.replace(/\[[^\]]*\]/g, "");
  const rawSeriesName = withoutBrackets.trim();

  return rawSeriesName.length > 0 ? rawSeriesName : null;
}

module.exports = { extractRawSeriesName, toSeriesId };
