import { describe, expect, it } from "bun:test";
import { parse } from "@hoangvu12/yomi";
import { z } from "zod";

const IssueSchema = z.object({
  type: z.enum(["grammar", "spelling", "punctuation", "clarity", "word_choice"]),
  category: z.string(),
  severity: z.enum(["error", "warning", "suggestion"]),
  original: z.string(),
  suggestion: z.string(),
  explanation: z.string().default(""),
  confidence: z.number().optional(),
  start: z.number().optional(),
  end: z.number().optional(),
});

const AnalyzeResultSchema = z.object({
  corrected_text: z.string(),
  issues: z.array(IssueSchema).default([]),
});

const sampleResponse = String.raw`{
  "corrected_text": "Yesterday, I was walking to the store, and I saw a dog that was much bigger than usual. Its fur was all messed up, and it looked like it hadn\u2019t eaten in a while. My friend and I were thinking maybe someone had lost it, but nobody around seemed to care. I tried to call it over, but the dog ran away quickly, which made me feel kind of bad because I should have helped it more.",
  "issues": [
    {
      "type": "grammar",
      "category": "verb_tense",
      "severity": "error",
      "original": "seen",
      "start": 24,
      "end": 28,
      "suggestion": "saw",
      "confidence": 1,
      "explanation": "The past participle 'seen' should be preceded by a form of 'to have' (e.g., 'have seen'). The simple past tense 'saw' is appropriate here."
    },
    {
      "type": "grammar",
      "category": "comparative_adjective",
      "severity": "error",
      "original": "very more bigger",
      "start": 45,
      "end": 60,
      "suggestion": "much bigger",
      "confidence": 1,
      "explanation": "The comparative form 'bigger' already indicates a greater degree. 'Very more' is redundant and grammatically incorrect. 'Much bigger' or simply 'bigger' is correct."
    },
    {
      "type": "grammar",
      "category": "possessive_pronoun",
      "severity": "error",
      "original": "it\u2019s",
      "start": 77,
      "end": 80,
      "suggestion": "its",
      "confidence": 1,
      "explanation": "'It's' is a contraction for 'it is' or 'it has'. 'Its' is the possessive form of 'it'."
    },
    {
      "type": "grammar",
      "category": "verb_tense",
      "severity": "error",
      "original": "look",
      "start": 98,
      "end": 102,
      "suggestion": "looked",
      "confidence": 1,
      "explanation": "The sentence is in the past tense ('was', 'hadn\u2019t ate'), so 'look' should be in the past tense 'looked'."
    },
    {
      "type": "grammar",
      "category": "verb_tense",
      "severity": "error",
      "original": "ate",
      "start": 119,
      "end": 122,
      "suggestion": "eaten",
      "confidence": 1,
      "explanation": "The past perfect tense requires the past participle. 'Hadn\u2019t eaten' is correct, not 'hadn\u2019t ate'."
    },
    {
      "type": "grammar",
      "category": "subject_verb_agreement",
      "severity": "error",
      "original": "Me and my friend was",
      "start": 136,
      "end": 157,
      "suggestion": "My friend and I were",
      "confidence": 1,
      "explanation": "The subject 'Me and my friend' is plural, so the verb should be 'were', not 'was'. Also, when listing oneself and others, 'I' should come last."
    },
    {
      "type": "grammar",
      "category": "verb_tense",
      "severity": "error",
      "original": "lose",
      "start": 176,
      "end": 180,
      "suggestion": "lost",
      "confidence": 1,
      "explanation": "The context implies a past event ('were thinking'), so the past tense 'lost' is appropriate, not the base form 'lose'."
    },
    {
      "type": "grammar",
      "category": "double_negative",
      "severity": "error",
      "original": "didn\u2019t seem to care",
      "start": 199,
      "end": 218,
      "suggestion": "seemed to care",
      "confidence": 0.9,
      "explanation": "The phrase 'nobody around didn\u2019t seem to care' contains a double negative. 'Nobody' is negative, and 'didn\u2019t' is also negative. Removing 'didn\u2019t' or changing 'nobody' to 'somebody' would correct this. The current suggestion removes 'didn\u2019t' for conciseness."
    },
    {
      "type": "grammar",
      "category": "verb_tense",
      "severity": "error",
      "original": "tryed",
      "start": 220,
      "end": 225,
      "suggestion": "tried",
      "confidence": 1,
      "explanation": "The correct past tense spelling of 'try' is 'tried'."
    },
    {
      "type": "grammar",
      "category": "verb_tense",
      "severity": "error",
      "original": "runned",
      "start": 235,
      "end": 241,
      "suggestion": "ran",
      "confidence": 1,
      "explanation": "'Run' is an irregular verb, and its past tense is 'ran', not 'runned'."
    },
    {
      "type": "grammar",
      "category": "adverb_placement",
      "severity": "warning",
      "original": "runned away quick",
      "start": 235,
      "end": 250,
      "suggestion": "ran away quickly",
      "confidence": 0.9,
      "explanation": "The word modifying the verb 'ran away' should be an adverb ('quickly') rather than an adjective ('quick')."
    },
    {
      "type": "grammar",
      "category": "should_have",
      "severity": "error",
      "original": "should of",
      "start": 285,
      "end": 294,
      "suggestion": "should have",
      "confidence": 1,
      "explanation": "'Should of' is a common phonetic error. The correct phrase is 'should have'."
    },
    {
      "type": "grammar",
      "category": "comparative_adverb",
      "severity": "error",
      "original": "more better",
      "start": 302,
      "end": 313,
      "suggestion": "better",
      "confidence": 1,
      "explanation": "'Better' is already the comparative form of 'good'. 'More better' is redundant and grammatically incorrect."
    },
    {
      "type": "punctuation",
      "category": "missing_comma_after_introductory_clause",
      "severity": "error",
      "original": "Yesterday I was",
      "start": 0,
      "end": 15,
      "suggestion": "Yesterday, I was",
      "confidence": 0.9,
      "explanation": "A comma is needed after an introductory adverbial phrase like 'Yesterday'."
    },
    {
      "type": "punctuation",
      "category": "missing_comma_after_introductory_clause",
      "severity": "error",
      "original": "store and I",
      "start": 31,
      "end": 42,
      "suggestion": "store, and I",
      "confidence": 0.9,
      "explanation": "A comma is needed before 'and' when it connects two independent clauses."
    },
    {
      "type": "punctuation",
      "category": "missing_period",
      "severity": "error",
      "original": "awhile",
      "start": 131,
      "end": 137,
      "suggestion": "awhile.",
      "confidence": 1,
      "explanation": "A sentence should end with appropriate punctuation, such as a period."
    },
    {
      "type": "punctuation",
      "category": "missing_period",
      "severity": "error",
      "original": "care",
      "start": 215,
      "end": 219,
      "suggestion": "care.",
      "confidence": 1,
      "explanation": "A sentence should end with appropriate punctuation, such as a period."
    },
    {
      "type": "punctuation",
      "category": "missing_period",
      "severity": "error",
      "original": "quick",
      "start": 246,
      "end": 251,
      "suggestion": "quick,",
      "confidence": 0.8,
      "explanation": "A comma is often used to separate a main clause from a subordinate clause or participial phrase that follows, especially when it adds explanatory information."
    },
    {
      "type": "punctuation",
      "category": "missing_period",
      "severity": "error",
      "original": "better",
      "start": 310,
      "end": 316,
      "suggestion": "better.",
      "confidence": 1,
      "explanation": "A sentence should end with appropriate punctuation, such as a period."
    }
  ]
}`;

describe("yomi parse", () => {
  it("parses the provided response", () => {
    const result = parse(AnalyzeResultSchema, sampleResponse);
    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error(JSON.stringify(result.error));
    }
    expect(result.data.value.corrected_text.startsWith("Yesterday")).toBe(true);
    expect(result.data.value.issues.length).toBe(19);
  });
});
