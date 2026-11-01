"use strict";

// Data guard & jejak audit Kantor AI SGRC.
// - redact(): data L4 (nasabah teridentifikasi) tidak boleh terkirim ke LLM.
// - AuditChain: log JSONL ber-hash berantai (SHA-256) untuk setiap aksi agen.

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PATTERNS = [
  { label: "NIK", re: /\b\d{16}\b/g },
  { label: "NPWP", re: /\b\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.\d{3}\b/g },
  { label: "REKENING", re: /\b(?:rek(?:ening)?\.?\s*(?:no\.?|nomor)?\s*:?\s*)\d[\d\-\s]{6,20}\d\b/gi },
  { label: "KARTU", re: /\b(?:\d[ -]?){13,19}\b/g },
  { label: "EMAIL", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { label: "TELEPON", re: /(?:\+62|\b0)8\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,5}\b/g },
];

function redact(text) {
  let out = String(text || "");
  const hits = {};
  for (const { label, re } of PATTERNS) {
    out = out.replace(re, () => {
      hits[label] = (hits[label] || 0) + 1;
      return `[DISAMARKAN:${label}]`;
    });
  }
  return { text: out, hits };
}

class AuditChain {
  constructor(file) {
    this.file =
      file ||
      process.env.SGRC_AUDIT_LOG ||
      path.join(process.env.HERMES_STATE_DIR || path.join(os.homedir(), ".hermes"), "sgrc", "audit.jsonl");
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.prevHash = this.#lastHash();
  }

  #lastHash() {
    try {
      const lines = fs.readFileSync(this.file, "utf8").trim().split("\n").filter(Boolean);
      if (!lines.length) return "GENESIS";
      return JSON.parse(lines[lines.length - 1]).hash || "GENESIS";
    } catch {
      return "GENESIS";
    }
  }

  append(entry) {
    const record = { ts: new Date().toISOString(), prev: this.prevHash, ...entry };
    const hash = crypto.createHash("sha256").update(JSON.stringify(record)).digest("hex");
    const line = JSON.stringify({ ...record, hash });
    fs.appendFileSync(this.file, line + "\n");
    this.prevHash = hash;
    return hash;
  }

  // Verifikasi seluruh rantai; mengembalikan { ok, count, brokenAt }.
  verify() {
    let prev = "GENESIS";
    let count = 0;
    let lines = [];
    try {
      lines = fs.readFileSync(this.file, "utf8").trim().split("\n").filter(Boolean);
    } catch {
      return { ok: true, count: 0 };
    }
    for (const line of lines) {
      const rec = JSON.parse(line);
      const { hash, ...rest } = rec;
      const calc = crypto.createHash("sha256").update(JSON.stringify(rest)).digest("hex");
      if (rest.prev !== prev || calc !== hash) return { ok: false, count, brokenAt: count };
      prev = hash;
      count += 1;
    }
    return { ok: true, count };
  }
}

const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);

module.exports = { redact, AuditChain, sha };
