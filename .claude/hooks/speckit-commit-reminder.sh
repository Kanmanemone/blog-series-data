#!/usr/bin/env bash
# PostToolUse(Skill) 훅: speckit-* 스킬 완료 직후 CLAUDE.md의 Spec Kit 사후 커밋 규칙을
# 상기시킨다. git commit은 여기서 직접 실행하지 않는다 — 실제 diff 확인, 취소/실패 판단,
# 무관한 변경 제외는 스크립트가 아니라 에이전트가 직접 해야 하기 때문이다.
input=$(cat)
skill=$(printf '%s' "$input" | grep -oE '"skill"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed -E 's/.*"([^"]*)"$/\1/')

case "$skill" in
  speckit-*)
    msg="Spec Kit skill '$skill' just finished. Per CLAUDE.md's Spec Kit post-execution commit policy: run git status/git diff now, and if it produced repository changes, create exactly one commit in the '[Spec Kit] <Skill Name>: <title>' format plus a Korean translation before reporting completion. Skip the commit only if the skill was cancelled, failed, or made no repository changes."
    printf '{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"%s"}}' "$msg"
    ;;
  *)
    exit 0
    ;;
esac
