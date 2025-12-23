import { describe, expect, it } from "bun:test";
import { applyBulkIssues } from "../lib/bulkApply";
import type { Issue } from "../lib/types";

const baseIssue: Omit<Issue, "original" | "suggestion"> = {
  type: "spelling",
  category: "typo",
  severity: "error",
  explanation: "typo",
};

describe("applyBulkIssues", () => {
  it("applies multiple replacements using explicit positions", () => {
    const text = "teh cat and teh dog";
    const issues: Issue[] = [
      { ...baseIssue, original: "teh", suggestion: "the", start: 0, end: 3 },
      { ...baseIssue, original: "teh", suggestion: "the", start: 12, end: 15 },
    ];

    const result = applyBulkIssues(text, issues);
    expect(result.text).toBe("the cat and the dog");
    expect(result.appliedIssues.length).toBe(2);
    expect(result.skippedIssues.length).toBe(0);
  });

  it("skips overlapping ranges", () => {
    const text = "abcde";
    const issues: Issue[] = [
      { ...baseIssue, original: "abc", suggestion: "ABC", start: 0, end: 3 },
      { ...baseIssue, original: "cde", suggestion: "CDE", start: 2, end: 5 },
    ];

    const result = applyBulkIssues(text, issues);
    expect(result.text).toBe("ABCde");
    expect(result.appliedIssues.length).toBe(1);
    expect(result.skippedIssues.length).toBe(1);
  });

  it("honors explicit ranges for repeated substrings", () => {
    const text = "foo bar foo";
    const issues: Issue[] = [
      { ...baseIssue, original: "foo", suggestion: "baz", start: 8, end: 11 },
    ];

    const result = applyBulkIssues(text, issues);
    expect(result.text).toBe("foo bar baz");
  });

  it("skips no-op suggestions", () => {
    const text = "stay the same";
    const issues: Issue[] = [
      { ...baseIssue, original: "same", suggestion: "same", start: 9, end: 13 },
    ];

    const result = applyBulkIssues(text, issues);
    expect(result.text).toBe("stay the same");
    expect(result.appliedIssues.length).toBe(0);
    expect(result.skippedIssues.length).toBe(1);
  });
});
