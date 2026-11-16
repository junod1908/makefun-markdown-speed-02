Practice scorer status: 342/720 pass with `node ../dev/score.mjs` (2026-11-16).

`parse.js` now uses a two-phase design: block tokenization creates paragraph,
heading, list, list item, blockquote, code, HTML, table, and thematic-break
tokens, then a renderer applies the inline parser to token text. The driver
contract remains `parse(markdown) -> HTML string`.

The generated documents remain 0/40 (verified 2026-11-16). Their first
divergences were inspected against marked 18.1.3:

- doc-01 at output offset 608, and doc-02 at 337: an extra newline after a
  comment or block HTML close before a paragraph.
- doc-03 at 690: the HTML/Markdown boundary inside `<details>`; marked emits
  `<details>` and `<summary>` HTML, a Markdown list, then the closing HTML.
- doc-04 at 711: named entity decoding and nested emphasis delimiter order.
- doc-05 at 341: an extra newline after a closed `<style>` block.

The same first-difference inspection was repeated for doc-01 through doc-05.
Changing HTML rendering to concatenate after comment, raw, or type-6 HTML
tokens produced 333/720, 336/720, 334/720, or 334/720 depending on the scope;
each trial was reverted because it regressed the required 342 baseline. The
remaining doc divergences are not limited to HTML: after moving the first
boundary in experimental runs, doc-01 exposed reference-link parsing, doc-02
tab-indented code, doc-03 list continuation, and doc-05 link-title parsing.
No generated document currently passes, and docs 06-40 have not been audited
to exact first-divergence offsets.

Known group status from the prior recorded baseline remains indicative but has
not been recalculated: `cm-lists` 5/26, `cm-list-items` 17/48,
`cm-emphasis-and-strong-emphasis` 55/132, `cm-links` 57/90, `cm-images` 15/22,
`cm-link-reference-definitions` 15/27, `cm-html-blocks` 21/44,
`cm-raw-html` 10/20, `gfm-disallowed-raw-html-extension` 0/1,
`cm-autolinks` 4/19, `gfm-autolinks-extension` 7/14,
`cm-entity-and-numeric-character-references` 3/17, and
`gfm-tables-extension` 2/8. Current total is 16 lower than that baseline.

Specific current failures reported by the scorer include:

- `cm-002`: tab-indented line is a paragraph instead of indented code.
- `cm-004`, `cm-005`, `cm-006`, `cm-007`: tab and blank-line indentation in
  lists and blockquotes produces detached code or empty lists.
- `cm-009`: nested list indentation is not retained as nested list structure.
- `cm-020` through `cm-028`: autolink recognition, link parsing, destination
  escaping, title unescaping, and fenced-code info escaping diverge.
- Every generated case `doc-01` through `doc-40` fails, with raw HTML boundary
  differences visible in the first reported cases and additional inline and
  list mismatches later in each document.

The current score remains 342/720. The remaining work is substantial: list continuation/looseness, inline
delimiter-run rules, links and images, HTML block categories, autolinks,
entities, GFM table edge cases, and the long tail of CommonMark block rules
still need to be brought into byte-for-byte agreement.

## Session 2026-11-16: mechanical fixes, final 412/720

Verified starting score 342/720. `cm-002` already passed (leading tabs were
already expanded to four-column stops). No emphasis delimiter rewrite was
attempted. Every retained change increased the total; each change was scored
with `node ../dev/score.mjs`, and each new best was copied to `parse.js.best`.
`parse.js` and `parse.js.best` finish identical at **412/720** (+70).

Retained fixes and total after each scorer run:

- Fenced info-string backslash unescaping: 343.
- Link and reference title backslash unescaping: 345.
- CommonMark angle autolinks (2–32 character schemes and email), recognition
  before HTML tags, and encodeURI URL escaping preserving percent escapes: 362.
- Validate inline HTML tag syntax instead of treating arbitrary angle text as
  tags: 371.
- Recognize standalone complete HTML tags as block HTML (`cm-021`): 378.
- GFM URL trimming: excess closing parentheses, punctuation and trailing
  entity-looking suffixes; allow autolinks after `<`: 381.
- GFM email, mailto and xmpp recognition: 383.
- Preserve named entity syntax in inline text: 388.
- Decode bounded decimal/hex numeric references in inline text, replacing
  zero, surrogate and out-of-range values; never reparse decoded Markdown: 393.
- Preserve named entity syntax in URL/title/language attributes: 397.
- Leave invalid GFM emails ending in underscore/hyphen as literal text: 399.
- Reference titles on the following line: 402.
- Escaped brackets and multiline reference labels: 405.
- Escaped title delimiters and reject blank lines in labels/titles: 406.
- Require whitespace before reference titles and prohibit fallback parsing of
  malformed angle destinations: 407.
- Unescape all ASCII punctuation in attribute values: 409.
- Read reference definitions during block tokenization, rather than a global
  prepass: preserves definitions in code, does not consume paragraph continuation
  lines, and discovers definitions inside blockquotes: 412.

Two score-neutral trials (stricter email domains and reference-title whitespace
alone) were reverted. No scoring regressions were retained.

Final freshly calculated target groups:

- `cm-autolinks`: **19/19** (was 4/19).
- `gfm-autolinks-extension`: **14/14** (was 7/14).
- `cm-entity-and-numeric-character-references`: **16/17** (was 3/17).
- `cm-link-reference-definitions`: **27/27** (was 15/27).
- `cm-020` through `cm-028`: all pass; `cm-002` passes.

Important correction to the proposed entity-table diagnosis: the supplied
marked 18.1.3 outputs preserve named entities verbatim, including unknown names
(`&MadeUpEntity;`, `&x;`). Decoding them through an HTML5 table would disagree
byte-for-byte. Numeric references are decoded; code spans and blocks retain
literal entity text with HTML escaping.

The only remaining entity-group failure is `cm-038`: its entity paragraph is
now correct, but the following `* foo` list loses its list item. This is the
existing list tokenizer bug (also visible at `cm-004`), outside this session's
mechanical target groups. Stopped after completing the requested autolink and
reference targets and isolating that unrelated remaining entity-case failure.
No commit was made. Final score: **412/720**.

## Session 2026-11-16: lists, images, tables — final 515/720

Started from verified 412/720 and completed all requested target groups.
Final scorer: `node ../dev/score.mjs` => **515/720** (+103).
`parse.js` and `parse.js.best` are identical. `parse.js.bak412` is unchanged.
No emphasis delimiter rewrite, dependency, external file modification, or commit.

Final target counts (compared byte-for-byte against practice references):

- `cm-list-items`: **48/48** (was 17/48).
- `cm-lists`: **26/26** (was 5/26).
- `cm-images`: **22/22** (was 15/22).
- `gfm-tables-extension`: **8/8** (was 2/8).

Changes and full scorer totals after each fix:

- Replaced list item gathering: per-item content column, 1–4-space padding,
  5+-space code fallback, tab stops after markers, blank-line continuation,
  empty items, marker/delimiter changes, nesting, ordered start: **471**.
- Corrected paragraph interruption for nonempty bullets/start-1 ordered items
  and tight-item block concatenation: **480**.
- Track blank boundaries between actual child blocks rather than treating
  blanks inside nested lists/fences as outer looseness; empty item ends at a
  blank: **480** (neutral, retained as groundwork).
- Preserve blank boundaries consumed by nested lists, count reference
  definitions as block boundaries for looseness, and preserve paragraph
  leading spaces after lists: **488**.
- Avoid an extra final newline in fenced code already ending in a newline
  (including fences inside lists): **493**.
- Comment HTML adjacency: **494**, then preserve comment newline when the
  following line is nonblank: **496**. This also fixes list/comment boundaries.
- End blockquote lazy continuation at interrupting blocks: **502**.
- Inline plain-text mode for image alt text: formatting/code wrappers removed,
  link labels and nested image alt text recursively retained; reference images
  use the same path. Existing title escaping retained: **509**.
- Table closing-tag newline: **512**.
- Table body cells padded/truncated to header width: **513**.
- Table cell splitter handles escaped pipes, including code-span cells;
  validate delimiter alignment syntax and header/delimiter cell counts;
  allow single-column tables and body rows without pipes, ending at blank or
  interrupting block: **515**.

No score-decreasing change was retained; every score increase was copied to
`parse.js.best`. Stopped because all requested targets pass completely.

Other current counts useful for future sessions: entities **17/17** (last
failure was fixed by list handling), autolinks **19/19**, GFM autolinks **14/14**,
reference definitions **27/27**, emphasis **55/132** unchanged, links **63/90**,
HTML blocks **28/44**, blockquotes **21/25**, fenced code **25/29**. Generated
documents remain **0/40**. GFM task lists remain **0/2**, outside these targets.
Remaining tab failure `cm-006` concerns tabs after blockquote markers.

Final score: **515/720**.

## Session 2026-11-16: links, HTML, quotes, fences, tasks — final 570/720

Verified starting score **515/720**. Final full scorer (`node ../dev/score.mjs`):
**570/720** (+55). `parse.js` and `parse.js.best` finish identical;
`parse.js.bak515` is unchanged. No commit or files outside the repo were written.
Every individual fix was scored. Score-decreasing trials were reverted before
revising them; every increase was copied to `parse.js.best`.

Retained changes and scorer totals:

- Destination scanner: angle destinations, escaped delimiters, balanced bare
  parentheses, empty destinations, ASCII whitespace, and quoted/parenthesized
  titles: **523**.
- Bracket matching skips code spans and angle constructs; outer links yield
  to links within their labels, including image alt parsing: **531**.
- Remove redundant reference fallback that bypassed bracket precedence, and
  handle collapsed reference labels in the main scanner: **534**.
- Unicode reference-label case folding: **535**.
- Reject empty and unescaped nested-bracket definition labels: **536**.
- Seven HTML block categories, specific terminators, paragraph interruption
  for types 1–6, complete-tag validation, and newline boundaries: **547**.
- Refine HTML final/container newline handling: **550**.
- Preserve marked's comment/blank-line boundary behavior: **553**.
- Inline closing-tag validation, short comments, declarations, CDATA: **557**.
- Expand tabs after quote markers at their actual source column: **558**.
- Quote lazy continuation only when the active child ends in a paragraph;
  stop after blank, indented code, and fences: **561**.
- Preserve trailing whitespace-only quote paragraph content: **562**.
- Dedent fenced content by opening indentation; permit backticks in tilde
  fence info while rejecting them for backtick fences: **566**.
- Render task checkboxes only at the first paragraph of a list item: **568**.
- Shortcut-reference fallback after an invalid inline destination: **569**.
- Preserve multiline bracket-label indentation: **570**.
- Remove disabled legacy reference branch: **570** (cleanup only).

Final target groups:

- `cm-links`: **85/90** (was 63/90).
- `cm-html-blocks`: **44/44** (was 28/44).
- `cm-raw-html`: **20/20** (was 16/20).
- `cm-block-quotes`: **25/25** (was 21/25); `cm-006` also passes.
- `cm-fenced-code-blocks`: **29/29** (was 25/29).
- `gfm-task-list-items-extension`: **2/2** (was 0/2).

The five remaining link failures are **cm-516, cm-521, cm-530, cm-534,
cm-564**. These involve nested emphasis or emphasis crossing a link boundary.
Stopped with these deferred to the explicitly scheduled emphasis work;
no emphasis delimiter-run rewrite was attempted this session.

Reverified completed groups remain perfect: autolinks 19/19, GFM autolinks
14/14, entities 17/17, reference definitions 27/27, lists 26/26, list items
48/48, images 22/22, and tables 8/8.

Final score: **570/720**.

## Session 2026-11-16: emphasis delimiter stack — final 655/720

Read the full history and verified the starting **570/720** baseline. Replaced
both emphasis regular expressions with delimiter runs and stack matching.
Runs use Unicode punctuation/symbol and whitespace flanking rules, underscore
restrictions, the rule of three, and repeated strong/em consumption. Matching
removes intervening delimiter-stack entries while preserving their literal
output. Code, escapes, HTML, autolinks, links, and images claim their spans
before delimiter recognition; link labels are parsed in their own inline
scope, preventing emphasis from crossing label boundaries while allowing
emphasis to surround whole links. Image alt text uses the same matching in
text-only mode.

The first full scorer after the rewrite reached **655/720** (+85), and the
improvement was immediately copied to `parse.js.best`.

Verified target results with the dev scorer:

- `cm-emphasis-and-strong-emphasis` (`cm-350` through `cm-481`): **132/132**
  (was 55/132).
- Deferred links `cm-516`, `cm-521`, `cm-530`, `cm-534`, `cm-564`: **5/5**.

Stopped because all requested targets pass. No unrelated parser groups were
edited, no files outside this repo were written, and no commit was made.
`parse.js.bak570` remains available; `parse.js` and `parse.js.best` are
identical. Final full score: **655/720**.

## Session 2026-11-16: generated documents investigation — final 680/720

Started from the supplied 680/720 `parse.js` baseline. The generated corpus is
loaded from `../markdown-render-speed-02-kit/practice/input/cases.json`.

`doc-01` first diverged because an ordered list beginning with a number other
than 1 occurred inside a list item, while paragraph interruption only allowed
ordered markers starting at 1. Made the ordered-list interruption rule
contextual to list-item block parsing. This preserved the full 680/720 score
(including `cm-304`, where `14.` remains paragraph text) and moved the first
`doc-01` divergence from offset 23171 to 44404. Made `http` and `https` scheme
recognition case-insensitive while keeping `www` recognition case-sensitive;
this moved `doc-01`'s first divergence further, to offset 60255. It remains
unlocked. Trials were scored; an overly broad case-insensitive URL rule was
revised after it caused additional mismatches.

Current generated document count: **0/40**. `doc-02` first differs in nested
strikethrough delimiter pairing; `doc-03` first differs at a style-block/list
boundary. The remaining documents still fail. Final full scorer verified at
**680/720**. No spec-case score regression was retained. `parse.js.bak680` was
left untouched; no commit was made.

## Session 2026-11-16: generated documents completed — final 720/720

Read the history and used `../dev/alldiffs.mjs` to inspect every divergence
for each document reached in order (doc-01 through doc-26). Later documents
passed through the same general fixes; stopped when the full scorer reached
**720/720**, as requested. Final generated document count: **40/40**;
all **680/680** spec cases also pass. Final validation:
`node ../dev/score.mjs` => `PASS 720/720` (3469 ms).

Retained fixes include:

- Suppress GFM bare autolinks in Markdown link text and after unclosed raw
  anchor tags, while retaining angle autolinks and valid raw HTML in labels.
- Refine emphasis delimiter pairing around nested emphasis/strong spans and
  preserve marked's code/link masking behavior with unmatched backtick runs.
- Pair nested single/double tilde strikethrough, including escaped tildes.
- Trim URL semicolons and unmatched opening parentheses, while preserving
  balanced trailing parentheses after earlier unmatched closing parentheses.
- Recognize email addresses immediately before active underscore closers.
- Keep tab-only table rows, allow angle autolinks in table rows, and stop
  tables at space-only blank lines.
- Match raw HTML/comment newline behavior for empty versus whitespace-only
  following lines, and preserve literal tabs in raw HTML.
- Validate backtick fences before allowing paragraph interruption; preserve
  marked's tilde-fence indentation and tab dedenting behavior.
- Correct list continuation after backtick fences and on successive lazy
  lines; preserve short continuation indentation.
- Preserve blockquote continuation indentation and stop lazy continuation
  at interrupting HTML blocks.

Full-score milestones saved to `parse.js.best`: 681, 683, 689, 690, 691,
692, 693, 695, 696, 698, 699, 700, 701, 705, 707, 710, 711, 712, 713,
715, and **720**. Trials that regressed spec cases or previously unlocked
required documents were revised before proceeding. Final `parse.js` and
`parse.js.best` are identical. `parse.js.bak680` is untouched. No commit was
made and no files outside this repo were modified.

## Session 2026-11-16: speed optimization — 720/720 retained

Final scorer: `node ../dev/score.mjs` => **PASS 720/720** (2383 ms,
including scorer overhead). `parse.js` and `parse.js.best` are identical.
No commit, cross-call caching, dependencies, or historical-backup edits.

`bench.mjs` imports this renderer and a fresh `Marked` instance, warms each
once over all 720 practice cases, and reports the best of three full passes.
Starting profiled benchmark: ours **2741.0 ms**, marked **704.6 ms**.
Final unprofiled benchmark after restoring the best implementation:

- Ours: 1154.4, 1121.1, **1034.2 ms**.
- Marked: **679.5**, 683.8, 693.4 ms.
- Approximately **2.65x faster** than the measured starting renderer;
  still **1.52x** marked's render time.

Retained optimizations (each passed the full scorer before benchmarking):

- Only join remaining block lines and run the definition regex when the
  current line can start a reference definition. Best: 2020.4 ms.
- Read neighboring Unicode code points directly for delimiter flanking,
  preserving surrogate-pair behavior, instead of Array.from on full prefixes
  and suffixes. Best: 1880.0 ms.
- Bulk-copy ordinary inline text after the boundary character has been
  processed, stopping at syntax, whitespace, and possible autolink boundaries.
  Best: 1373.0 ms.
- Guard inline recognizers by their required first character and evaluate
  autolink boundary conditions before running the URL regex. Best: 1009.6 ms
  (marked 672.1 ms in that run).

CPU profiles identified repeated definition scans, inline dispatch, and
allocation as the main costs. An additional 10,000 deterministic mixed-syntax
inputs matched the original renderer byte-for-byte, including surrogate input.
This supplements, rather than replaces, the full practice scorer.

Rejected trials were restored and the restoration rescored: an early small
regex-guard trial (1919.2 ms), then after the final improvement, skipping
backtick masks / delimiter output allocation (1027.2 ms) and sharing the HTML
escape lookup/callback (1063.9 ms). Stopped after those final **two consecutive
non-improvements**, as requested; marked's speed target was not reached.
Timing varies between runs; the final fresh measurement above is authoritative.

## Session 2026-11-16: generated-only speed profiling

Baseline `node bench.mjs`: ours best **1039.8 ms**, marked best **682.5 ms**
(ratio 1.52x). A CPU profile over only the 40 generated documents (warmup plus
five passes, `node --cpu-prof profile-docs.mjs`) found these parse.js
self-time hotspots: `inline` **2015** aggregated ticks, `render` **612**, and
`blocks` **309**; helper `esc` accounted for **207**. The paragraph render call (line 223) had **535** ticks; within `inline`,
mask construction (line 25) had **313**, and delimiter/URL handling
(lines 79/57) **388/138**. These are the targets for
the optimization attempts below.

First optimization attempt: direct scanning instead of allocating a regex for
delimiter runs passed 720/720 but measured 1034.3/674.2 ms (1.53x), worse
than the baseline ratio, so it was reverted.

Second optimization attempt targeted `render` and its repeated calls into
`inline`: tight list items rendered every child twice and discarded the first
result. Skip that first pass when the item's token subtree has no possible raw
anchor opener. Preserve the old double pass for possible `<a>` tags because
its link-state side effects affect output (for example `- www.a.com <a>`).
The guard inspects text, descendants, and table cells; no cross-call cache.
A whole-document guard was tested first but unnecessarily disabled the
optimization across generated documents, so the guard is local to each item.

Final full scorer: **PASS 720/720**. An additional **10,000** deterministic
mixed list/anchor cases matched the session-start renderer byte-for-byte.
Final benchmarks (best of three full practice passes):

- Ours **841.7 ms**, marked **702.8 ms**, ratio **1.198x**.
- Confirmation: ours **837.4 ms**, marked **706.2 ms**, ratio **1.186x**.

Saved the passing, faster implementation to `parse.js.best`; it matches
`parse.js`. Stopped at the requested 1.0–1.2 ratio. No commit or files outside
this repo were modified. Profiling artifacts: `profile-docs.mjs` and
`docs.cpuprofile`; original session implementation: `parse.js.session-start`.

## Session 2026-11-16: final engineering pass (session 15)

Both entrypoint and renderer finished and verified. No commit, dependencies,
cross-call caching, or writes outside this repo.

`main.ts`: retain one synchronous UTF-8 read, one JSON parse, one ordered render
loop, one JSON serialization, and one write. Reuse the parsed cases array for
HTML strings instead of allocating a second array; replacing each consumed case
also releases its reference earlier. Keep path joining and environment defaults.
Ran the README entrypoint exactly with Node 24.22.1:

```
MAKEFUN_INPUT_DIR=../markdown-render-speed-02-kit/practice/input MAKEFUN_OUTPUT_DIR=.verify-output node main.ts
```

`cmp` confirmed byte-identical serialized output against the reference HTML
array in input case order (720 cases). The kit's actual `expected.json` is a
metadata object with groups and `{id, group, html}` records, not an entrypoint
output array, so literal whole-file comparison to it cannot pass the required
harness format. Reference projection uses case IDs and JSON.stringify once.
Also ran the original session-start main.ts and confirmed the same bytes.

`parse.js`: three retained structural attempts, each independently followed by
the full scorer and bench.mjs; no failing or slower attempt was retained:

1. Precompute an ASCII syntax/whitespace action table. Dispatch ordinary runs
   before creating a remaining-source slice or visiting recognizers; share
   boundary classification, retaining Unicode whitespace semantics.
2. Scan leading line indentation directly, expanding only prefixes containing
   tabs and reusing unchanged lines. Remove repeated paragraph joining and
   regex matching whose conditional selected identical expressions. This also
   removes quadratic copying as paragraphs grow.
3. Reject incompatible delimiter openers before checking nested emphasis;
   scan node/delimiter ranges directly instead of slice/some allocations and
   assemble matched bodies directly instead of slice/map/join arrays.

Benchmarks below report best of three full practice passes, milliseconds:

| Revision | Ours | marked | Ours / marked |
| --- | ---: | ---: | ---: |
| Session-start baseline | 864.3 | 681.5 | 1.268x |
| After main.ts change (renderer unchanged) | 879.5 | 676.5 | 1.300x |
| Inline dispatch | 840.0 | 669.4 | 1.255x |
| Block line handling | 706.2 | 668.7 | 1.056x |
| Delimiter processing | 698.0 | 673.6 | 1.036x |
| Final confirmation | 720.9 | 673.3 | 1.071x |

Final confirmation individual passes: ours 943.7, 737.6, 720.9 ms; marked
707.7, 673.3, 738.4 ms. Final scorer **PASS 720/720** (1867 ms including
scorer overhead). An additional 10,000 deterministic mixed-syntax inputs,
including Unicode whitespace, surrogate input, links, delimiters, lists, tabs,
and HTML, matched the session-start renderer byte-for-byte. Final entrypoint
output was rechecked after all renderer changes. `parse.js.best` was updated
only after each passing, faster attempt and is byte-identical to `parse.js`.
Stopped with both files verified and the requested below-1.19x target met.
Temporary verification files were removed.
