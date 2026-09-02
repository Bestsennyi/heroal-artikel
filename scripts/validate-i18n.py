#!/usr/bin/env python3
"""Recursively validate src/locales/translations.json language matrix."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DICT_PATH = ROOT / "src" / "locales" / "translations.json"
I18N_JS = ROOT / "src" / "i18n.js"

def supported_langs():
    src = I18N_JS.read_text(encoding="utf-8")
    m = re.search(r"SUPPORTED_LANGS\s*=\s*\[([^\]]+)\]", src)
    if not m:
        raise SystemExit("SUPPORTED_LANGS not found in src/i18n.js")
    return [p.strip().strip("\"'") for p in m.group(1).split(",") if p.strip()]

def is_leaf(node, langs):
    return isinstance(node, dict) and all(isinstance(node.get(code), str) for code in langs)

def walk(node, prefix, langs, issues):
    if not isinstance(node, dict):
        issues.append({"path": prefix or "(root)", "kind": "not_object"})
        return
    if is_leaf(node, langs):
        keys = set(node)
        missing = [c for c in langs if c not in keys]
        extra = [c for c in keys if c not in langs]
        if missing:
            issues.append({"path": prefix, "kind": "missing_langs", "missing": missing})
        if extra:
            issues.append({"path": prefix, "kind": "extra_langs", "extra": extra})
        de = str(node.get("de", "")).strip() if isinstance(node.get("de"), str) else ""
        for code in langs:
            val = node.get(code)
            if not isinstance(val, str):
                issues.append({"path": f"{prefix}.{code}", "kind": "not_string"})
                continue
            if not val.strip():
                issues.append({"path": f"{prefix}.{code}", "kind": "empty"})
            if (
                code != "de"
                and de
                and val.strip() == de
                and len(de) > 12
                and not re.fullmatch(r"[A-Za-z0-9./+\-–—•©| ]+", de)
            ):
                issues.append(
                    {
                        "path": f"{prefix}.{code}",
                        "kind": "same_as_de",
                        "hint": "long string identical to German",
                    }
                )
        return
    for key, child in node.items():
        walk(child, f"{prefix}.{key}" if prefix else key, langs, issues)

def main():
    langs = supported_langs()
    dict_data = json.loads(DICT_PATH.read_text(encoding="utf-8"))
    issues = []
    walk(dict_data, "", langs, issues)
    hard = [i for i in issues if i["kind"] != "same_as_de"]
    soft = [i for i in issues if i["kind"] == "same_as_de"]
    for i in soft:
        print("WARN", i["path"], i.get("hint", ""), file=sys.stderr)
    if hard:
        print(f"i18n validation failed ({len(hard)} issues):", file=sys.stderr)
        for i in hard:
            print(" -", json.dumps(i, ensure_ascii=False), file=sys.stderr)
        return 1
    print(f"i18n OK: all leaves have [{', '.join(langs)}] in {DICT_PATH.relative_to(ROOT)}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
