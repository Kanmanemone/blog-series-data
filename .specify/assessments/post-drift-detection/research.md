# Idea Research: 게시글 삭제·제목 변경 감지 및 시리즈 json 갱신

- **Slug**: post-drift-detection
- **Created**: 2026-08-05
- **Evidence confidence (overall)**: medium — strong internal/repo evidence for feasibility and cost, but weak evidence for actual user-facing demand/urgency

## Users & Demand

- The only documented demand signal is the repository maintainer (this session's user) explicitly asking to pick up the two cases 001-tistory-series-sync deferred — [source: intake.md "Idea (as captured)"] (confidence: high, cited — this is a direct request, not inferred)
- No evidence in the repository of an actual incident (a real retitled or deleted post causing a stale/broken series entry) since 001 shipped on 2026-07-21/22 — this is a preemptive request, not a reported problem — [ASSUMPTION, based on absence of any issue/complaint artifact in `.specify/` or commit history] (confidence: medium)
- Demand is single-stakeholder (n=1: the repo owner is also the only content author and the only consumer of the automation's output) — typical for a personal blog tooling repo, so "demand strength" should be read as "owner wants it," not as aggregated user signal — [source: repo scope — single-author blog data repo, README/constitution context] (confidence: high, cited)

## Prior Art

- 001-tistory-series-sync's own spec explicitly named and deferred both cases as "next feature candidates," and deliberately shaped `.github/sync-state.json`'s `processedPosts` record (URL, raw series name, last-processed time) so a follow-up feature would have the data it needs — this idea is exactly that planned follow-up, not a new direction — [source: `specs/001-tistory-series-sync/spec.md` lines 141–159, FR-016] (confidence: high, cited)
- **Deletion-detection logic already exists in code, just intentionally unused.** `scripts/sync-tistory-series/seriesFiles.js:71` (`collectSiblingCandidates`) already checks whether a previously-processed post's URL is still present in the current sitemap fetch, and the inline comment states plainly: "sitemap에서 사라짐 = 삭제·비공개 전환 → 이번 기능 범위 밖" (disappearing from the sitemap = deletion/unlisting → out of scope for this feature). The exact signal this idea needs (current sitemap vs. known URL set) is already computed each run for an unrelated purpose (sibling-count threshold for new series) and then discarded — [source: `scripts/sync-tistory-series/seriesFiles.js` lines 60–83] (confidence: high, cited)
- **Title re-fetch for a previously-known post also already exists as a pattern.** `scripts/sync-tistory-series/index.js` lines 122–140 re-fetch the title of posts that are only known from `state.processedPosts` (not in this run's candidate set) when deciding whether to create a new series file. This is structurally the same operation title-drift detection would need (fetch current title for a URL recorded earlier), just used for a different decision — [source: `scripts/sync-tistory-series/index.js` lines 120–148] (confidence: high, cited)
- No other repository automation re-visits already-processed posts; the shipped script is strictly one-directional (sitemap → cutoff-filtered new posts → append-only), so drift detection would be genuinely new control flow, not an extension of an existing loop — [source: `scripts/sync-tistory-series/index.js` full read] (confidence: high, cited)

## Market & Context

- Not externally researched — this is an internal, single-author content-tooling repository with no external users of the automation itself, so competitor/market analysis does not apply. General "dead link checker" tooling exists as a category elsewhere on the web, but no specific external source was consulted for this idea — [ASSUMPTION] (confidence: low)
- **Cost of doing nothing**: today, 124 of 331 tracked `processedPosts` (about 37%) have `rawSeriesName: null` (title didn't parse into a series), and any post already reflected in a `*_series.json` that later gets retitled or removed will keep showing its stale title / dead link on `index.html` indefinitely, since nothing currently revisits committed entries — [source: computed from `.github/sync-state.json` and `*_series.json` files in this session] (confidence: high, cited)

## Data & Constraints

- **Scale**: `.github/sync-state.json` currently tracks 331 `processedPosts`, but only 201 post entries actually exist across the 26 `*_series.json` files — i.e., roughly 130 tracked posts never landed in a series file (no series extracted, or otherwise not eligible) and would be irrelevant to title/removal drift *inside series json*, narrowing the real footprint for the "already reflected in series json" half of Out-of-Scope item 2 — [source: computed from `.github/sync-state.json` (331) and `*_series.json` items (201) in this session] (confidence: high, cited)
- **Fetch-cost risk**: the current workflow only fetches post-page HTML for posts changed since the last cutoff (a small delta each 6-hour run). A drift check that re-fetches every tracked post's title every run would multiply outbound requests to `kenel.tistory.com` up to ~331x per run versus today's small candidate set. `fetchPostTitle`/`fetchSitemap` use plain `fetch()` with no retry, backoff, or rate limiting — [source: `scripts/sync-tistory-series/index.js` `fetchPostTitle`, `sitemap.js` `fetchSitemap`] (confidence: high, cited)
- **Sitemap is a cheaper deletion signal than per-post fetch**: 001's own research confirmed `sitemap.xml` lists only currently-public post URLs (research.md §2). A URL's absence from a fresh sitemap fetch is already the exact signal needed for delete/unlist detection and costs one shared request, versus title-drift detection which needs one HTTP fetch per tracked post — [source: `specs/001-tistory-series-sync/research.md` §2] (confidence: high, cited)
- **No signal to distinguish real deletion from transient failure.** The current script already treats any per-post fetch failure (network error, transient 5xx) as "skip this run, retry next run" with no persistence of the failure — it never concludes deletion from a failed fetch. Extending this to conclude deletion would need a new, deliberate signal (e.g., absence from sitemap specifically, not a fetch error) to avoid false positives — [source: `scripts/sync-tistory-series/index.js` `fetchPostTitle` try/catch at lines 77–88; also flagged independently in intake.md's NEEDS CLARIFICATION #5] (confidence: high, cited)
- **Schema constraint**: Constitution Principle I fixes `*_series.json` to exactly `listName`, `items[].title`, `items[].url` — no extra per-item drift-tracking fields (e.g., a "last verified" timestamp) may be added to series json without amending the constitution; such bookkeeping belongs in `.github/sync-state.json` instead — [source: `.specify/memory/constitution.md` Principle I] (confidence: high, cited)

## Evidence Against the Idea

- The request traces back to a spec's own "candidate for next feature" note, not to an observed incident — there is no evidence in the repo that any already-synced post has actually been retitled or deleted since 001 went live (2026-07-21/22), so the urgency of this idea is unverified — [ASSUMPTION] (confidence: medium)
- **Risk-profile mismatch with 001's shipped safety model.** 001 deliberately chose "commit straight to main, `git revert` if wrong" specifically because its only action is *additive* (append an item) — low blast radius. Automating deletion detection introduces a *destructive* action (removing an item from a public-facing `*_series.json`) under the same no-review, auto-push model. A false positive (e.g., a transient Tistory outage misread as "post gone") would silently delete a legitimate, live series entry before anyone notices — a materially different risk class than what 001's Clarifications session (2026-07-22) accepted — [source: `specs/001-tistory-series-sync/spec.md` Clarifications Session 2026-07-22; cross-referenced against this idea's intake.md NEEDS CLARIFICATION #2] (confidence: high, cited)
- Re-fetching every tracked post every 6 hours (see Data & Constraints) could trip Tistory's own bot/rate-limiting and start failing whole workflow runs — a cost the current design avoids entirely by only fetching small deltas — [source: `scripts/sync-tistory-series/index.js` fetch usage] (confidence: medium, cited)
- The idea batches two different-risk operations (title update = safe/additive-equivalent; deletion = destructive) under one intake, which the intake note itself already flags as an open design question (bundle vs. split) — resolving that now, before design, avoids shipping the risky half under cover of the safe half — [source: intake.md "두 항목을 하나로 묶을 수도 있다는 점에 주의"] (confidence: high, cited)

## Gaps & Open Questions

- [NEEDS CLARIFICATION: Is there any evidence a post has actually drifted (retitled/deleted) since 2026-07-21, or is this purely preemptive? Worth a quick manual sitemap diff before committing scope.]
- [NEEDS CLARIFICATION: Given the risk-profile mismatch noted above, should deletion detection ship with an auto-push destructive action, or should it require a review step (PR, issue, or flag-and-hold) even though 001 rejected review steps for the additive case? See intake.md NEEDS CLARIFICATION #2.]
- [NEEDS CLARIFICATION: Should this reuse/extend the existing `collectSiblingCandidates` sitemap-absence check (already computed each run) rather than adding a separate full re-fetch pass — i.e., is a lighter "detect via existing sitemap diff" design sufficient for deletion, reserving the expensive per-post re-fetch only for title-drift on posts that remain in the sitemap?]
- Remaining open questions already captured in intake.md (seriesId-change handling, re-check cadence/workflow structure, failure-vs-deletion disambiguation policy, branch/spec structure) still stand and are not duplicated here.

## Sources

- `specs/001-tistory-series-sync/spec.md` (internal repo file, read directly — not a URL fetch)
- `specs/001-tistory-series-sync/research.md` (internal repo file, read directly — not a URL fetch)
- `specs/001-tistory-series-sync/data-model.md` (internal repo file, read directly — not a URL fetch)
- `specs/001-tistory-series-sync/plan.md` (internal repo file, read directly — not a URL fetch)
- `.github/workflows/tistory-series-sync.yml` (internal repo file, read directly — not a URL fetch)
- `.github/sync-state.json` (internal repo data, inspected directly — not a URL fetch)
- `scripts/sync-tistory-series/index.js`, `sitemap.js`, `seriesFiles.js` (internal repo code, read directly — not a URL fetch)
- `.specify/memory/constitution.md` (internal repo file, read directly — not a URL fetch)
- `.specify/assessments/post-drift-detection/intake.md` (internal repo file, read directly — not a URL fetch)

No external web hosts were fetched for this research — all evidence was internal to the repository. If external prior-art (e.g., how other static-site tooling handles link-rot detection) is wanted, that would need an explicit follow-up with real URLs.
