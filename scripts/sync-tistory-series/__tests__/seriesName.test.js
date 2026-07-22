"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { extractRawSeriesName, toSeriesId } = require("../seriesName.js");

test("마지막 ' - ' 앞부분에서 대괄호 구간을 제거하고 공백을 정리한다(FR-008)", () => {
  assert.equal(extractRawSeriesName("[Kotlin] Coroutines - 기초"), "Coroutines");
});

test("대괄호가 여러 위치에 있어도 모두 제거한다", () => {
  assert.equal(extractRawSeriesName("[Android] [Kotlin] Coroutines - 기초"), "Coroutines");
});

test("' - '가 마지막에 여러 번 등장하면 가장 마지막 것을 구분자로 쓴다", () => {
  assert.equal(extractRawSeriesName("[A] Coroutines - 편 - 기초"), "Coroutines - 편");
});

test("' - '가 없는 제목은 null을 반환한다(추출 대상 제외)", () => {
  assert.equal(extractRawSeriesName("제목에 구분자가 없음"), null);
});

test("대괄호 제거 후 남는 내용이 없으면 null을 반환한다", () => {
  assert.equal(extractRawSeriesName("[Kotlin] - 기초"), null);
});

test("seriesId는 공백 제거·소문자 변환·Windows 금지 문자 제거를 적용한다(FR-009)", () => {
  assert.equal(toSeriesId("Coroutines"), "coroutines");
  assert.equal(toSeriesId("Jetpack Compose"), "jetpackcompose");
  assert.equal(toSeriesId('Weird:Name*Test?'), "weirdnametest");
});
