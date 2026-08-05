# CLAUDE.md

Project-specific instructions for Claude Code in this repository.

(Korean: 이 저장소에서 Claude Code를 위한 프로젝트별 지침.)

## Commit Conventions

- Write every commit message as an English conventional-commit subject, followed
  by a blank line and a Korean translation or explanation of the commit. Apply
  this format to ordinary, squash, and history-rewrite commits unless the Spec
  Kit post-execution policy below applies.

  (Korean: 모든 커밋 메시지는 영어 conventional-commit 형식의 제목 한 줄을 쓰고, 빈 줄
  다음에 그 커밋에 대한 한국어 번역 또는 설명을 덧붙인다. 일반 커밋, squash
  커밋, 히스토리 재작성 커밋 모두 이 형식을 따르되, 아래 Spec Kit 사후 실행
  정책이 적용되는 경우는 예외로 한다.)

- When picking a conventional-commit type for changes under `.claude/` (skills,
  commands, agent configs, etc.), remember these `.md`/config files are this
  repository's actual product, not incidental documentation about code.
  Classify by the effect on skill behavior — `feat` for new capability, `fix`
  for correcting broken or incomplete behavior, `refactor` for no-behavior-
  change restructuring — not by file extension. Reserve `docs` for changes
  that don't affect what a skill actually does (e.g. editing this file, or a
  README).

  (Korean: `.claude/` 아래(스킬, 커맨드, 에이전트 설정 등)의 변경에 conventional-commit
  타입을 고를 때는, 이 `.md`/설정 파일들이 이 저장소의 실제 산출물이지 코드에
  대한 부수적인 문서가 아님을 기억한다. 파일 확장자가 아니라 스킬 동작에
  미치는 효과로 분류한다 — 새 기능이면 `feat`, 깨지거나 불완전한 동작을
  고친 것이면 `fix`, 동작 변화 없는 재구성이면 `refactor`. `docs`는 스킬의
  실제 동작에 영향을 주지 않는 변경(이 파일 자체 편집, README 등)에만 쓴다.)

- After every successfully completed Spec Kit skill, inspect the actual diff and
  create exactly one commit for the repository changes produced by that skill
  before reporting completion. Do not commit when the skill was cancelled,
  failed, or made no repository changes. Do not include unrelated pre-existing
  changes.

  (Korean: Spec Kit 스킬이 성공적으로 완료될 때마다, 실제 diff를 확인하고 그 스킬이
  만든 저장소 변경사항에 대해 정확히 커밋 하나를 완료 보고 전에 생성한다.
  스킬이 취소되었거나 실패했거나 저장소 변경이 없었다면 커밋하지 않는다.
  관련 없는 기존 변경사항은 포함하지 않는다.)

- Format a Spec Kit post-execution commit as `[Spec Kit] <Skill Name>: <concise
  English title>`, a blank line, a concise English description based on the
  actual diff, another blank line, and its Korean translation or explanation.

  (Korean: Spec Kit 사후 실행 커밋은 `[Spec Kit] <Skill Name>: <간결한 영어 제목>`
  형식으로 쓰고, 빈 줄, 실제 diff 기반의 간결한 영어 설명, 다시 빈 줄, 그리고
  그 한국어 번역 또는 설명 순으로 구성한다.)

### Examples

Ordinary commit:

```text
feat(analysis): add resumable article labeling

(Korean: 중단 후에도 이어서 실행할 수 있는 글 단위 라벨링을 추가)
```

Spec Kit post-execution commit:

```text
[Spec Kit] speckit-tasks: generate dependency-ordered task list

Break the implementation plan into phases and tasks, ordered by user
story priority.

(Korean: 구현 계획을 유저 스토리 우선순위에 따라 단계별 태스크로 분해)
```
