/**
 * Local-expert knowledge-proof answers (Leon, Nov 11, 2026, 12:16 PM ET).
 *
 * One pair and one count. The application counter, the continue gate and
 * `insertLocalExpertFormSchema` all import this module. The number the counter
 * shows is the number the server enforces.
 *
 * Count is trimmed length after whitespace runs collapse to a single space.
 * Leading, trailing and repeated spaces do not add to the count.
 *
 * The sentences in this file are placeholders. They are not approved copy.
 */

export const EXPERT_ANSWER_MIN_CHARS = 250;
export const EXPERT_ANSWER_TARGET_CHARS = 750;

export function countExpertAnswerChars(value: string): number {
  return value.trim().replace(/\s+/g, " ").length;
}

/** The text a knowledge-proof entry is counted on. Objects use `answer`. */
export function expertAnswerText(entry: unknown): string {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && "answer" in entry) {
    const answer = (entry as { answer?: unknown }).answer;
    if (typeof answer === "string") return answer;
  }
  return "";
}

export function expertAnswerMinimumLine(count: number): string {
  return `${count} characters — minimum ${EXPERT_ANSWER_MIN_CHARS} to continue`;
}

export function expertAnswerTargetLine(count: number): string {
  return `${count} characters — aim for ${EXPERT_ANSWER_TARGET_CHARS} for best results`;
}

export function expertAnswerTargetMetLine(count: number): string {
  return `${count} characters ✓ Great detail`;
}

/** The full counter line for a counted answer. Below the minimum, this is also the server message. */
export function expertAnswerCounterLine(count: number): string {
  if (count < EXPERT_ANSWER_MIN_CHARS) return expertAnswerMinimumLine(count);
  if (count < EXPERT_ANSWER_TARGET_CHARS) return expertAnswerTargetLine(count);
  return expertAnswerTargetMetLine(count);
}
