# Parser implementation and validation

`parse.js` exports `parse(markdown)`, returning HTML synchronously. It rejects
non-string input and normalizes CRLF and lone carriage returns to newlines.
The entrypoint calls this function once for each input document.

## Parsing model

Block scanning builds tokens and collects reference definitions before HTML
rendering. Recursive scans handle list items and blockquotes. The scanner
supports paragraphs, ATX and setext headings, thematic breaks, indented and
fenced code, seven HTML block categories, references, lists, and GFM tables.
Indentation uses four-column tab stops; raw HTML retains its original tabs.

Inline scanning recognizes code, escapes, hard breaks, HTML, autolinks, links,
images, entities, emphasis, and strikethrough. Ordinary text is copied in runs
using an ASCII dispatch table, with Unicode whitespace handled separately.
Numeric character references are decoded and invalid scalar values replaced.
Named entities remain verbatim to match the supplied marked 18.1.3 output.

Emphasis uses CommonMark delimiter runs: Unicode punctuation and whitespace
flanking, underscore restrictions, the rule of three, and repeated one- or
two-marker consumption. Matched spans remove intervening delimiter entries
while retaining their output. Link labels have independent inline scopes;
image alt text uses the same parser without formatting wrappers. Code/link
masks and nested delimiter adjustments preserve marked's observed precedence.
Single and double tilde runs provide GFM strikethrough.

## Compatibility fixes by group

- Autolinks: URI and email angle forms, GFM bare addresses, punctuation and
  parenthesis trimming, scheme case handling, and email/underscore boundaries.
  Bare links are suppressed within Markdown links and open raw anchors.
- References and links: block-local definition collection, normalized label
  case/whitespace, escaped brackets, balanced destinations, angle destinations,
  multiline titles, nested-label precedence, and shortcut-reference fallback.
- Lists: marker-specific grouping, content-column indentation, blank boundaries,
  tight/loose rendering, nested ordered interruption, and lazy continuation.
  Task checkboxes apply only to an item's initial paragraph.
- Images: recursively rendered text-only labels, nested images, reference forms,
  and attribute/title escaping.
- Tables: escaped pipes, delimiter validation, alignment, header-width padding
  and truncation, single-column tables, and tab-only body rows.
- HTML: category-specific terminators, paragraph interruption, complete inline
  tags, and exact comment/container newline boundaries.
- Blockquotes and fences: source-column tab expansion, paragraph-only lazy
  continuation, interruption by HTML/other blocks, fence validation, and
  indentation-sensitive code content.
- Emphasis: the delimiter implementation completed all 132 emphasis cases and
  the five link cases previously blocked by emphasis/label boundaries.

Generated-document investigation also refined nested strikethrough, unmatched
backtick masking, raw-anchor state, HTML whitespace, and list continuation.
Tight items retain a preliminary rendering pass when raw anchors can change
state; otherwise they avoid the redundant pass.

## Tests and measured performance

The practice scorer compares HTML byte-for-byte with the supplied references.
The completed implementation passes **720/720**: **680/680** specification
cases and **40/40** generated documents. The development tools are located in
`../dev/`; `alldiffs.mjs` reports divergence regions for selected case IDs.

Earlier optimization sessions recorded separate sets of 10,000 deterministic
mixed-syntax differential inputs and mixed list/anchor inputs, each matching
its session-start renderer. A later engineering pass also recorded 10,000
mixed-syntax comparisons, including Unicode whitespace and surrogate input.
These checks supplement the practice corpus; they are historical measurements,
not newly executed random tests in this authorship session.

The recorded final benchmark used warmup and the best of three full practice
passes: this renderer **720.9 ms**, marked **673.3 ms**, or **1.071x** marked's
render time (approximately **1.07x**). Individual passes were 943.7, 737.6,
720.9 ms for this renderer and 707.7, 673.3, 738.4 ms for marked. These are
historical timings; this rewrite has not rerun the benchmark.

## Recorded re-authoring

Both this document and `parse.js` were rewritten in the current session.
The public API, recognition order, delimiter rules, HTML serialization, and
raw-anchor side effects were preserved. Private helpers were renamed and
organized for readability, reference-key normalization was shared, and block
rendering uses explicit token dispatch. No dependencies or cross-call caches
were introduced. The rewritten parser passed `node ../dev/score.mjs` with
**PASS 720/720**. Differential validation covers all 40 generated documents.
