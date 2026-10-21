#!/usr/bin/env node
/**
 * ONE FILE PER RULING (ledger `2026-10-21-ledger-one-file`).
 *
 * Sequenced rows:  docs/decisions/NNNNN-<id>.md   (5-digit append order)
 * Pending rows:    docs/decisions/pending/<id>.md (a PR adds this; the stamp numbers it)
 * Preamble:        docs/DECISIONS.md              (rules, lane-local list, guard registry — no rows)
 *
 * `loadEntries` order is the ledger's file order: sequenced files by seq, then pending
 * files by filename. That is the order `check-decision-guards.cjs` lints.
 *
 * Node built-ins only.
 */
const fs = require("fs");
const path = require("path");
const { ROW_ID_PREFIX_RE } = require("./check-decision-guards.cjs");

const ROOT = path.resolve(__dirname, "..");
const PREAMBLE_REL = "docs/DECISIONS.md";
const DIR_REL = "docs/decisions";
const PENDING_REL = "docs/decisions/pending";
const SEQ_NAME_RE = /^(\d{5})-(.+)\.md$/;

function rowIdOf(line) {
  const m = String(line).match(ROW_ID_PREFIX_RE);
  return m ? m[1] : null;
}

function sequencedRel(seq, id) {
  return `${DIR_REL}/${String(seq).padStart(5, "0")}-${id}.md`;
}

function pendingRel(id) {
  return `${PENDING_REL}/${id}.md`;
}

function listSequenced(root = ROOT) {
  const dir = path.join(root, DIR_REL);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => SEQ_NAME_RE.test(name))
    .sort()
    .map((name) => {
      const m = name.match(SEQ_NAME_RE);
      return {
        seq: Number(m[1]),
        idFromName: m[2],
        rel: `${DIR_REL}/${name}`,
        abs: path.join(dir, name),
        pending: false,
      };
    });
}

function listPending(root = ROOT) {
  const dir = path.join(root, PENDING_REL);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => ({
      seq: null,
      idFromName: name.slice(0, -".md".length),
      rel: `${PENDING_REL}/${name}`,
      abs: path.join(dir, name),
      pending: true,
    }));
}

/** A decision file is exactly one LF-terminated line. */
function readRowFile(abs) {
  const text = fs.readFileSync(abs, "utf8");
  if (text.includes("\r")) return { ok: false, line: text, reason: "CR is not allowed" };
  if (!text.endsWith("\n") || text.slice(0, -1).includes("\n")) {
    return { ok: false, line: text.replace(/\n$/, ""), reason: "not exactly one line ending in a newline" };
  }
  return { ok: true, line: text.slice(0, -1), reason: null };
}

function loadEntries(root = ROOT) {
  return [...listSequenced(root), ...listPending(root)].map((file) => {
    const read = readRowFile(file.abs);
    return { ...file, ...read, id: read.ok ? rowIdOf(read.line) : null };
  });
}

function readPreamble(root = ROOT) {
  const abs = path.join(root, PREAMBLE_REL);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
}

/** Row lines in file order, then the preamble (lane-local list and guard registry). */
function assembleLedgerText(root = ROOT, entries = null, preamble = null) {
  const rows = (entries || loadEntries(root)).map((e) => e.line || "").join("\n");
  const pre = preamble != null ? preamble : readPreamble(root);
  return `${rows}\n${pre}`;
}

module.exports = {
  ROOT,
  PREAMBLE_REL,
  DIR_REL,
  PENDING_REL,
  SEQ_NAME_RE,
  rowIdOf,
  sequencedRel,
  pendingRel,
  listSequenced,
  listPending,
  readRowFile,
  loadEntries,
  readPreamble,
  assembleLedgerText,
};
