#!/usr/bin/env node
/**
 * Recursively checks src/locales/translations.json:
 * every leaf must contain the same set of language codes, none empty.
 *
 * Usage: node scripts/validate-i18n.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DICT_PATH = path.join(ROOT, "src", "locales", "translations.json");
const I18N_JS = path.join(ROOT, "src", "i18n.js");

function readSupportedLangs() {
  const src = fs.readFileSync(I18N_JS, "utf8");
  const m = src.match(/SUPPORTED_LANGS\s*=\s*\[([^\]]+)\]/);
  if (!m) throw new Error("SUPPORTED_LANGS not found in src/i18n.js");
  return m[1]
    .split(",")
    .map((s) => s.replace(/['"\s]/g, ""))
    .filter(Boolean);
}

function isLangLeaf(node, langs) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return false;
  return langs.every((code) => typeof node[code] === "string");
}

function walk(node, prefix, langs, issues) {
  if (!node || typeof node !== "object") {
    issues.push({ path: prefix || "(root)", kind: "not_object" });
    return;
  }
  if (isLangLeaf(node, langs)) {
    const keys = Object.keys(node).sort();
    const expected = langs.slice().sort();
    const missing = expected.filter((c) => keys.indexOf(c) === -1);
    const extra = keys.filter((c) => expected.indexOf(c) === -1);
    if (missing.length) {
      issues.push({ path: prefix, kind: "missing_langs", missing });
    }
    if (extra.length) {
      issues.push({ path: prefix, kind: "extra_langs", extra });
    }
    expected.forEach((code) => {
      const val = node[code];
      if (typeof val !== "string") {
        issues.push({ path: prefix + "." + code, kind: "not_string" });
        return;
      }
      if (!val.trim()) {
        issues.push({ path: prefix + "." + code, kind: "empty" });
      }
    });
    const de = typeof node.de === "string" ? node.de.trim() : "";
    langs.forEach((code) => {
      if (code === "de") return;
      const val = typeof node[code] === "string" ? node[code].trim() : "";
      if (!de || !val) return;
      if (val === de && !/^[A-Z0-9./+\-–—•©| ]+$/i.test(de) && de.length > 12) {
        issues.push({
          path: prefix + "." + code,
          kind: "same_as_de",
          hint: "long string identical to German; confirm this is intentional",
        });
      }
    });
    return;
  }
  Object.keys(node).forEach((key) => {
    walk(node[key], prefix ? prefix + "." + key : key, langs, issues);
  });
}

function main() {
  const langs = readSupportedLangs();
  const dict = JSON.parse(fs.readFileSync(DICT_PATH, "utf8"));
  const issues = [];
  walk(dict, "", langs, issues);
  const hard = issues.filter((i) => i.kind !== "same_as_de");
  const soft = issues.filter((i) => i.kind === "same_as_de");
  if (soft.length) {
    console.warn("Warnings (" + soft.length + " possible untranslated strings):");
    soft.forEach((i) => console.warn("  -", i.path, i.hint));
  }
  if (hard.length) {
    console.error("i18n validation failed (" + hard.length + " issues):");
    hard.forEach((i) => console.error("  -", JSON.stringify(i)));
    process.exit(1);
  }
  console.log(
    "i18n OK: all leaves have [" + langs.join(", ") + "] in " + path.relative(ROOT, DICT_PATH),
  );
}

main();
