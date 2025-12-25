import { describe, expect, it } from "bun:test";
import { generateIssuesFromDiff } from "../lib/issueOffsets";

describe("generateIssuesFromDiff", () => {
  it("preserves leading whitespace for offsets", () => {
    const original = "  Hello world";
    const corrected = "  Hello worlds";

    const result = generateIssuesFromDiff(original, corrected);
    expect(result.issues.length).toBe(1);
    const issue = result.issues[0];
    expect(issue.original).toBe("world");
    expect(issue.suggestion).toBe("worlds");
    expect(issue.start).toBe(8);
    expect(issue.end).toBe(13);
  });

  it("preserves newline offsets", () => {
    const original = "Hello\nworld";
    const corrected = "Hello\nWorld";

    const result = generateIssuesFromDiff(original, corrected);
    expect(result.issues.length).toBe(1);
    const issue = result.issues[0];
    expect(issue.original).toBe("world");
    expect(issue.suggestion).toBe("World");
    expect(issue.start).toBe(6);
    expect(issue.end).toBe(11);
  });

  it("creates insertion issues with zero-length ranges", () => {
    const original = "Hello world";
    const corrected = "Hello brave world";

    const result = generateIssuesFromDiff(original, corrected);
    expect(result.issues.length).toBe(1);
    const issue = result.issues[0];
    expect(issue.original).toBe("");
    expect(issue.suggestion).toBe("brave ");
    expect(issue.start).toBe(6);
    expect(issue.end).toBe(6);
  });
});
