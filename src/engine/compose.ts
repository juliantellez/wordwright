//
// Grading a composed sentence.
//
// Two layers, kept apart on purpose.
//
// Mechanics are the rules that hold for every sentence anyone writes: it starts with a
// capital, it ends with a stop, it has one space between words. They are checked on
// every answer and they are not what you are being scored on.
//
// The exercise checks are the lesson. "Did you actually put the verb in the active
// voice", "did you use the word you were given", "did you keep it under fifteen words".
// Those are the score, and each one fails with a hint that teaches rather than scolds.
//
// There is no model in the loop. Every verdict here is a rule you can read, which is
// what makes the feedback repeatable and the tool usable on a train.
//

import type { ComposeCheck, ComposeExercise } from "../types.ts";

export interface CheckResult {
  check: ComposeCheck;
  passed: boolean;
  /** Empty when it passed. */
  hint: string;
}

export interface FormFinding {
  /** What is off, in one line, written as a fix rather than a complaint. */
  message: string;
}

export interface ComposeGrade {
  answer: string;
  results: CheckResult[];
  mechanics: FormFinding[];
  /** 0 to 1: the share of exercise checks that passed. */
  score: number;
  /** True only when every check passed and the mechanics are clean. */
  clean: boolean;
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Matches a word and its ordinary inflections, so an exercise asking for "elide" is
 * satisfied by "elides" and "eliding". Being strict about the exact form would grade
 * grammar you were not asked about.
 */
export function usesWord(text: string, word: string): boolean {
  const stem = escapeRegex(word.trim());
  // English drops the silent e before ing and ed, so elide has to reach eliding as well.
  const clipped = stem.endsWith("e") ? stem.slice(0, -1) : stem;
  return new RegExp(`\\b(${stem}(s|es|d|ed|ing|ly)?|${clipped}(ing|ed))\\b`, "i").test(text);
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

export function runCheck(answer: string, check: ComposeCheck): CheckResult {
  const pass = (passed: boolean): CheckResult => ({ check, passed, hint: passed ? "" : check.hint });

  switch (check.kind) {
    case "requires_word":
      return pass(usesWord(answer, check.word));
    case "requires_pattern": {
      const expression = safeRegex(check.pattern);
      return pass(expression ? expression.test(answer) : false);
    }
    case "forbids_pattern": {
      const expression = safeRegex(check.pattern);
      return pass(expression ? !expression.test(answer) : false);
    }
    case "min_words":
      return pass(countWords(answer) >= check.count);
    case "max_words":
      return pass(countWords(answer) <= check.count);
  }
}

/**
 * The long dash and the short dash, built from their code points so neither character
 * appears literally in this repository.
 */
const LONG_DASH = String.fromCharCode(0x2014);
const SHORT_DASH = String.fromCharCode(0x2013);
const DASHES = new RegExp(`[${LONG_DASH}${SHORT_DASH}]`);

/** The rules that hold for any sentence, checked on every answer. */
export function mechanics(answer: string): FormFinding[] {
  const found: FormFinding[] = [];
  const text = answer.trim();
  if (text.length === 0) return [{ message: "Nothing was written." }];

  const first = text[0] ?? "";
  if (/[a-z]/.test(first)) {
    found.push({ message: "Open with a capital letter." });
  }
  if (!/[.!?]["')\]]?$/.test(text)) {
    found.push({ message: "Close the sentence with a full stop, a question mark or an exclamation mark." });
  }
  if (/ {2,}/.test(text)) {
    found.push({ message: "One space between words, not two." });
  }
  if (/\s+[,.;:!?]/.test(text)) {
    found.push({ message: "Punctuation sits against the word before it, with no space in front." });
  }
  if (DASHES.test(text) || / - /.test(text)) {
    found.push({
      message: "Swap the dash for a comma, a colon, or two sentences. A dash usually hides a decision about the join.",
    });
  }
  if (/\bi\b/.test(text)) {
    found.push({ message: "The pronoun I is always a capital." });
  }
  if (/,\s*(and|but|so)\s+\w+.*,\s*(and|but|so)\b/i.test(text)) {
    found.push({ message: "Two joins in one sentence usually wants to be two sentences." });
  }
  return found;
}

export function grade(answer: string, exercise: ComposeExercise): ComposeGrade {
  const results = exercise.checks.map((check) => runCheck(answer, check));
  const passedCount = results.filter((result) => result.passed).length;
  const form = mechanics(answer);
  return {
    answer,
    results,
    mechanics: form,
    score: results.length > 0 ? passedCount / results.length : 1,
    clean: passedCount === results.length && form.length === 0,
  };
}
