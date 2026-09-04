/**
 * heroal Artikel — UI i18n helper (static chrome only).
 *
 * Dictionary: src/locales/translations.json
 * Nested leaves: { de, en, ru, pl, ar }
 * Lookup: t("auth.login_btn") or legacy flat t("login_btn")
 */
(function (global) {
  var SUPPORTED_LANGS = ["de", "en", "ru", "pl", "ar"];
  var DEFAULT_LANG = "de";
  var STORAGE_KEY = "lagerguide_lang";
  var LEGACY_STORAGE_KEY = "heroal_lang";
  var CACHE_KEY = "heroal_ui_i18n_v2";
  var DICT_URL = "./src/locales/translations.json";
  var RTL_LANGS = [];

  var tree = {};
  var overlay = {};
  var currentLang = DEFAULT_LANG;
  var readyResolve;
  var ready = new Promise(function (resolve) {
    readyResolve = resolve;
  });

  function usableText(val) {
    if (val == null) return "";
    var s = String(val).trim();
    if (!s || /^null$/i.test(s) || /^undefined$/i.test(s)) return "";
    return s;
  }

  function isLangLeaf(node) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    return SUPPORTED_LANGS.every(function (code) {
      return typeof node[code] === "string";
    });
  }

  function normalizeLang(raw) {
    if (raw == null) return DEFAULT_LANG;
    var v = String(raw).trim().toLowerCase();
    if (SUPPORTED_LANGS.indexOf(v) !== -1) return v;
    if (v === "deutsch" || v === "ger" || v === "german") return "de";
    if (v === "english") return "en";
    if (v === "рус" || v === "russian") return "ru";
    if (v === "polish" || v === "polski") return "pl";
    if (v === "arabic" || v === "عربي") return "ar";
    return DEFAULT_LANG;
  }

  function readSavedLang() {
    try {
      var next = localStorage.getItem(STORAGE_KEY);
      if (next) return normalizeLang(next);
      var legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) return normalizeLang(legacy);
    } catch (e) {}
    return DEFAULT_LANG;
  }

  function persistLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      localStorage.setItem(LEGACY_STORAGE_KEY, lang.toUpperCase());
    } catch (e) {}
  }

  function walkLeaves(node, prefix, visit) {
    if (!node || typeof node !== "object") return;
    if (isLangLeaf(node)) {
      visit(prefix, node);
      return;
    }
    Object.keys(node).forEach(function (key) {
      var next = prefix ? prefix + "." + key : key;
      walkLeaves(node[key], next, visit);
    });
  }

  function getByPath(root, path) {
    if (!path || !root) return undefined;
    var parts = String(path).split(".");
    var node = root;
    for (var i = 0; i < parts.length; i++) {
      if (!node || typeof node !== "object") return undefined;
      node = node[parts[i]];
    }
    return node;
  }

  function findLeafByName(root, name) {
    var found = null;
    walkLeaves(root, "", function (path, leaf) {
      var last = path.split(".").pop();
      if (last === name && !found) found = leaf;
    });
    return found;
  }

  function leafText(leaf, lang) {
    if (!leaf) return "";
    return (
      usableText(leaf[lang]) ||
      usableText(leaf[DEFAULT_LANG]) ||
      ""
    );
  }

  function overlayText(path, lang) {
    var table = overlay[lang] || {};
    var direct = usableText(table[path]);
    if (direct) return direct;
    var leaf = path.indexOf(".") === -1 ? path : path.split(".").pop();
    return usableText(table[leaf]);
  }

  function builtinText(path, lang) {
    var node = getByPath(tree, path);
    if (isLangLeaf(node)) return leafText(node, lang);
    if (String(path).indexOf(".") === -1) {
      var byName = findLeafByName(tree, path);
      if (byName) return leafText(byName, lang);
    }
    return "";
  }

  function t(path, fallback) {
    var k = usableText(path);
    if (!k) return usableText(fallback);
    var lang = currentLang;
    var fromOverlay = overlayText(k, lang);
    var fromTree = builtinText(k, lang);
    var deTree = builtinText(k, DEFAULT_LANG);
    if (
      lang !== DEFAULT_LANG &&
      fromOverlay &&
      deTree &&
      fromOverlay === deTree &&
      fromTree &&
      fromTree !== deTree
    ) {
      return fromTree;
    }
    var out = fromOverlay || fromTree || deTree || usableText(fallback) || k;
    return out;
  }

  function tf(path, vars, fallback) {
    var s = t(path, fallback);
    Object.keys(vars || {}).forEach(function (key) {
      s = s.split("{" + key + "}").join(String(vars[key]));
    });
    return s;
  }

  function applyDocumentLang() {
    if (typeof document === "undefined") return;
    document.documentElement.lang = currentLang;
    document.documentElement.dir =
      RTL_LANGS.indexOf(currentLang) !== -1 ? "rtl" : "ltr";
  }

  function emitChanged() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(
      new CustomEvent("languageChanged", { detail: { lang: currentLang } }),
    );
  }

  function setLanguage(lang) {
    var next = normalizeLang(lang);
    var changed = next !== currentLang;
    currentLang = next;
    persistLang(currentLang);
    applyDocumentLang();
    if (changed) emitChanged();
    return currentLang;
  }

  function getCurrentLanguage() {
    return currentLang;
  }

  function getBuiltin(lang, path) {
    return builtinText(path, normalizeLang(lang));
  }

  function mergeOverlay(bundle) {
    if (!bundle || typeof bundle !== "object") return;
    SUPPORTED_LANGS.forEach(function (lang) {
      if (!overlay[lang]) overlay[lang] = {};
      if (bundle[lang] && typeof bundle[lang] === "object") {
        Object.keys(bundle[lang]).forEach(function (key) {
          var val = usableText(bundle[lang][key]);
          if (!val) return;
          if (lang !== DEFAULT_LANG) {
            var deVal = builtinText(key, DEFAULT_LANG);
            var local = builtinText(key, lang);
            if (local && deVal && val === deVal && local !== deVal) return;
          }
          overlay[lang][key] = val;
        });
      }
    });
    Object.keys(bundle).forEach(function (key) {
      if (SUPPORTED_LANGS.indexOf(key) !== -1) return;
      var row = bundle[key];
      if (!row || typeof row !== "object") return;
      SUPPORTED_LANGS.forEach(function (lang) {
        var val = usableText(row[lang]);
        if (!val) return;
        if (lang !== DEFAULT_LANG) {
          var deVal = builtinText(key, DEFAULT_LANG);
          var local = builtinText(key, lang);
          if (local && deVal && val === deVal && local !== deVal) return;
        }
        if (!overlay[lang]) overlay[lang] = {};
        overlay[lang][key] = val;
      });
    });
  }

  function cacheTree(next) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch (e) {}
  }

  function readCachedTree() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function applyTree(next) {
    if (next && typeof next === "object") tree = next;
  }

  function loadDictionary() {
    var cached = readCachedTree();
    if (cached) applyTree(cached);
    return fetch(DICT_URL)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        applyTree(json);
        cacheTree(json);
        return tree;
      })
      .catch(function (err) {
        if (!cached) console.warn("[i18n] could not load translations.json:", err);
        return tree;
      });
  }

  currentLang = readSavedLang();
  applyDocumentLang();

  var boot = loadDictionary().then(function () {
    applyDocumentLang();
    readyResolve(currentLang);
    emitChanged();
    return currentLang;
  });

  var api = {
    SUPPORTED_LANGS: SUPPORTED_LANGS,
    DEFAULT_LANG: DEFAULT_LANG,
    ready: ready,
    t: t,
    tf: tf,
    setLanguage: setLanguage,
    getCurrentLanguage: getCurrentLanguage,
    normalizeLang: normalizeLang,
    mergeOverlay: mergeOverlay,
    getBuiltin: getBuiltin,
    usableText: usableText,
    loadDictionary: loadDictionary,
    boot: boot,
  };

  global.HeroalI18n = api;
  global.t = t;
  global.tf = tf;
  global.setLanguage = setLanguage;
  global.getCurrentLanguage = getCurrentLanguage;
})(typeof window !== "undefined" ? window : globalThis);
