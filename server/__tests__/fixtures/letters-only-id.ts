/**
 * lettersOnlyId — a random fixture token made of lower-case letters only, never a digit.
 *
 * The blog/event drafters refuse a draft that states a number its facts do not carry
 * (`firstInventedNumber`, `@shared/draft-facts-check`). Fixture ids and titles reach those facts, so
 * a hex or uuid token ("a1b2…") would plant digit runs the checker counts as facts — which can make
 * an "invented number is refused" assertion pass or fail by chance. Every fixture id in a suite that
 * feeds that checker is built from this token instead.
 */
import crypto from "node:crypto";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export function lettersOnlyId(length = 8): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(length)), (b) => LETTERS[b % LETTERS.length]).join("");
}
