import { describe, expect, it } from "bun:test";
import type { Issue } from "../lib/types";
import { assignIssueOffsetsFromCorrection } from "../lib/issueOffsets";

const baseIssue: Omit<Issue, "original" | "suggestion"> = {
  type: "grammar",
  category: "test",
  severity: "error",
  explanation: "",
};

describe("assignIssueOffsetsFromCorrection", () => {
  it("computes offsets for simple replacements", () => {
    const original = "I seen it.";
    const corrected = "I saw it.";
    const issues: Issue[] = [
      {
        ...baseIssue,
        original: "seen",
        suggestion: "saw",
        start: 0,
        end: 1,
      },
    ];

    const result = assignIssueOffsetsFromCorrection(original, corrected, issues);
    expect(result[0]?.start).toBe(2);
    expect(result[0]?.end).toBe(6);
  });

  it("handles repeated occurrences", () => {
    const original = "teh teh cat";
    const corrected = "the the cat";
    const issues: Issue[] = [
      {
        ...baseIssue,
        original: "teh",
        suggestion: "the",
      },
      {
        ...baseIssue,
        original: "teh",
        suggestion: "the",
      },
    ];

    const result = assignIssueOffsetsFromCorrection(original, corrected, issues);
    expect(result[0]?.start).toBe(0);
    expect(result[0]?.end).toBe(3);
    expect(result[1]?.start).toBe(4);
    expect(result[1]?.end).toBe(7);
  });

  it("maps replacements that expand text", () => {
    const original = "runned away quick";
    const corrected = "ran away quickly";
    const issues: Issue[] = [
      {
        ...baseIssue,
        original: "runned",
        suggestion: "ran",
      },
      {
        ...baseIssue,
        original: "quick",
        suggestion: "quickly",
      },
    ];

    const result = assignIssueOffsetsFromCorrection(original, corrected, issues);
    expect(result[0]?.start).toBe(0);
    expect(result[0]?.end).toBe(6);
    expect(result[1]?.start).toBe(12);
    expect(result[1]?.end).toBe(17);
  });
});
