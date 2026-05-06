-- FID-43: Backfill decode whitespace HTML numeric entities in issue_comments.body.
--
-- Some Telegram clients (notably iOS) emit trailing whitespace as numeric
-- HTML entities ("&#x20;", "&#xA0;", etc.). When markdown is re-pasted, the
-- ampersand may be backslash-escaped to "\&#x20;". Both forms survive the
-- react-markdown pipeline and surface as literal text in the FideliOS UI.
--
-- The ingestion-side fix in packages/plugins/examples/telegram-gateway
-- (worker.ts: decodeWhitespaceEntities) prevents new occurrences. This
-- migration normalizes existing rows so that previously-broken comments
-- (e.g. on FID-39) render cleanly without manual edits.
--
-- Scope is intentionally narrow — only whitespace entities — to avoid
-- changing semantics for comments that legitimately mention "&#xNN;".
-- The optional leading backslash (markdown escape for "&") is consumed
-- along with the entity so we end up with plain whitespace, not "\ ".

-- &#x20; / &#32; / \&#x20; / \&#32;  →  space (U+0020)
UPDATE "issue_comments"
SET "body" = regexp_replace("body", '\\?&#(?:x20|32);', ' ', 'g')
WHERE "body" ~ '\\?&#(?:x20|32);';

-- &#xA0; / &#xa0; / &#160; / \&#xA0; / ...  →  non-breaking space (U+00A0)
UPDATE "issue_comments"
SET "body" = regexp_replace("body", '\\?&#(?:x[Aa]0|160);', U&'\00A0', 'g')
WHERE "body" ~ '\\?&#(?:x[Aa]0|160);';

-- &#x09; / &#9; / \&#x09; / \&#9;  →  tab (U+0009)
UPDATE "issue_comments"
SET "body" = regexp_replace("body", '\\?&#(?:x09|9);', E'\t', 'g')
WHERE "body" ~ '\\?&#(?:x09|9);';

-- &#x0A; / &#x0a; / &#10; / ...  →  line feed (U+000A)
UPDATE "issue_comments"
SET "body" = regexp_replace("body", '\\?&#(?:x0[Aa]|10);', E'\n', 'g')
WHERE "body" ~ '\\?&#(?:x0[Aa]|10);';

-- &#x0D; / &#x0d; / &#13; / ...  →  carriage return (U+000D)
UPDATE "issue_comments"
SET "body" = regexp_replace("body", '\\?&#(?:x0[Dd]|13);', E'\r', 'g')
WHERE "body" ~ '\\?&#(?:x0[Dd]|13);';
