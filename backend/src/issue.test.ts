import assert from "node:assert/strict";
import { test } from "node:test";
import { parseClosingIssues } from "./issue.ts";

test("finds closing keywords", () => {
  assert.deepEqual(parseClosingIssues("Fixes #12 and closes #7"), [12n, 7n]);
  assert.deepEqual(parseClosingIssues("RESOLVED: #3"), [3n]);
});
test("dedupes and ignores unrelated references", () => {
  assert.deepEqual(parseClosingIssues("fixes #5, fixed #5"), [5n]);
  assert.deepEqual(parseClosingIssues("see #9, related to #10"), []);
});
test("ignores other-repo references and #0", () => {
  assert.deepEqual(parseClosingIssues("fixes other/repo#5"), []);
  assert.deepEqual(parseClosingIssues("fixes #0"), []);
});
