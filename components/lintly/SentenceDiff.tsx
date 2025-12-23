import { useMemo } from "react";
import { DiffMatchPatch, DiffOp, type Diff } from "diff-match-patch-ts";

interface SentenceDiffProps {
  before: string;
  after: string;
}

const WORD_TOKEN_REGEX =
  /[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*|\s+|[^A-Za-z0-9\s]+/g;

function tokenizeWords(text: string): string[] {
  return text.match(WORD_TOKEN_REGEX) ?? [];
}

function diffWordsToChars(text1: string, text2: string): {
  chars1: string;
  chars2: string;
  tokenArray: string[];
} {
  const tokenArray: string[] = [];
  const tokenHash = new Map<string, number>();

  const encode = (text: string): string => {
    const tokens = tokenizeWords(text);
    let chars = "";
    for (const token of tokens) {
      let tokenIndex = tokenHash.get(token);
      if (tokenIndex === undefined) {
        tokenArray.push(token);
        tokenIndex = tokenArray.length;
        tokenHash.set(token, tokenIndex);
      }
      chars += String.fromCharCode(tokenIndex);
    }
    return chars;
  };

  return {
    chars1: encode(text1),
    chars2: encode(text2),
    tokenArray,
  };
}

function diffCharsToWords(diffs: Diff[], tokenArray: string[]): Diff[] {
  return diffs.map(([op, text]) => {
    let result = "";
    for (const char of text) {
      const code = char.charCodeAt(0);
      if (code === 0) continue;
      const token = tokenArray[code - 1];
      if (token) {
        result += token;
      }
    }
    return [op, result];
  });
}

export function SentenceDiff({ before, after }: SentenceDiffProps) {
  const dmp = useMemo(() => new DiffMatchPatch(), []);

  const diffs = useMemo(() => {
    if (before === after) return [];
    const { chars1, chars2, tokenArray } = diffWordsToChars(before, after);
    const wordDiffs = dmp.diff_main(chars1, chars2, false);
    dmp.diff_cleanupSemantic(wordDiffs);
    return diffCharsToWords(wordDiffs, tokenArray);
  }, [before, after, dmp]);

  if (!before && !after) return null;

  return (
    <div className="lintly-sentence-diff">
      {diffs.length === 0 ? (
        <span>{before}</span>
      ) : (
        diffs.map(([op, text], index) => {
          if (!text) return null;
          if (op === DiffOp.Insert) {
            return (
              <span key={index} className="diff-add">
                {text}
              </span>
            );
          }
          if (op === DiffOp.Delete) {
            return (
              <span key={index} className="diff-del">
                {text}
              </span>
            );
          }
          return <span key={index}>{text}</span>;
        })
      )}
    </div>
  );
}
