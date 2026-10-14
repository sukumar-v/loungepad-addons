#!/usr/bin/env node
/*
 * Tests for check-actions.mjs: `node tools/test-check-actions.mjs`. Each case is a throwaway
 * repository in the temp folder with a few layouts in it, and what the checks must say about it.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRepo } from "./check-actions.mjs";
import { loadLauncherData } from "./actions-lib.mjs";

const data = loadLauncherData();
let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) pass++; else fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  -- " + detail : ""}`);
}

const good = (over = {}) => ({
  format: "loungepad-actions/1",
  app: { name: "Thorium", exes: ["thorium"] },
  title: "Thorium from the sofa",
  summary: "Browsing with one hand: tabs on the shoulders.",
  author: "couchpotato",
  version: "1.0.0",
  tabs: [{ name: "Sofa", actions: [
    { name: "New tab", keys: "Ctrl+T", desc: "Opens a new tab.", button: "Y" },
    { name: "Next tab", keys: "Ctrl+Tab", button: "RB" },
    { name: "Previous tab", keys: "Ctrl+Shift+Tab", button: "LB" },
    { name: "Reload", keys: "F5" },
    { name: "Close tab", keys: "Ctrl+W" },
  ] }],
  ...over,
});

/** A repository holding these layouts by id (an object), or raw text for one. */
function run(layouts, opts = {}, extraFiles = {}) {
  const root = mkdtempSync(join(tmpdir(), "check-actions-"));
  try {
    for (const [id, l] of Object.entries(layouts)) {
      mkdirSync(join(root, "actions", id), { recursive: true });
      writeFileSync(join(root, "actions", id, "layout.json"), typeof l === "string" ? l : JSON.stringify(l, null, 2));
    }
    for (const [path, text] of Object.entries(extraFiles)) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    return checkRepo(root, { data, ...opts });
  } finally { rmSync(root, { recursive: true, force: true }); }
}
const says = (r, text) => r.problems.some(p => p.includes(text));
const clean = (r) => r.problems.length === 0;

// ---- the launcher's own test cases ----
check("this copy of the rules agrees with the launcher's test cases", clean(run({})));
const drifted = JSON.parse(JSON.stringify(data));
drifted.vectors.chords.push({ keys: "Ctrl+Foo", normal: "Ctrl+Foo" });
const rd = checkRepo(mkdtempSync(join(tmpdir(), "check-actions-")), { data: drifted });
check("a rule that drifted from the launcher's fails before anything else", says(rd, "no longer reads chords"));

// ---- shape ----
check("a good layout passes", clean(run({ "thorium-sofa": good() })), JSON.stringify(run({ "thorium-sofa": good() }).problems));
check("README.md beside it is fine", clean(run({ "thorium-sofa": good() }, {}, { "actions/thorium-sofa/README.md": "# Thorium" })));
check("any other file is not", says(run({ "thorium-sofa": good() }, {}, { "actions/thorium-sofa/run.ps1": "x" }), "not part of a layout"));
check("a folder name that is not an id", says(run({ "Thorium_Sofa": good() }), "not an id"));
check("not JSON", says(run({ a: "{ nope" }), "not JSON"));
check("another format", says(run({ a: good({ format: "loungepad-actions/2" }) }), "format must be"));
check("title, summary and author are required", ["title", "summary", "author"].every(k => says(run({ a: good({ [k]: undefined }) }), `${k} is missing`)));
check("a version is major.minor.patch", says(run({ a: good({ version: "1.0" }) }), "not major.minor.patch"));
check("a field a layout does not have", says(run({ a: good({ script: "x" }) }), `has "script"`));
check("an action's field it does not have", says(run({ a: good({ tabs: [{ name: "T", actions: [{ name: "A", keys: "F1", onclick: "x" }] }] }) }), `has "onclick"`));
check("a title too long", says(run({ a: good({ title: "x".repeat(49) }) }), "48 at most"));
check("markup in a name", says(run({ a: good({ title: "<b>Thorium</b>" }) }), "or < or >"));
check("a hidden character in a name", says(run({ a: good({ title: "Thor\u202Eium" }) }), "invisible character"));
check("a zero-width space", says(run({ a: good({ author: "couch\u200Bpotato" }) }), "invisible character"));
check("a line break", says(run({ a: good({ summary: "One\nTwo" }) }), "invisible character"));
check("doubled spaces", says(run({ a: good({ title: "Thorium  sofa" }) }), "more than one in a row"));
check("a web address", says(run({ a: good({ summary: "See https://example.com" }) }), "web address") && says(run({ a: good({ summary: "See www.example.com" }) }), "web address"));
check("no program", says(run({ a: good({ app: { name: "X", exes: [] } }) }), "names no program"));
check("an exe written with .exe", says(run({ a: good({ app: { name: "X", exes: ["thorium.exe"] } }) }), "without .exe"));
check("an exe in capitals or with a path", says(run({ a: good({ app: { name: "X", exes: ["Thorium"] } }) }), "not an exe name") && says(run({ a: good({ app: { name: "X", exes: ["c:\\x\\thorium"] } }) }), "not an exe name"));
check("a generic exe name", says(run({ a: good({ app: { name: "X", exes: ["launcher"] } }) }), "too many programs") && says(run({ a: good({ app: { name: "X", exes: ["javaw"] } }) }), "too many programs"));
check("no tabs", says(run({ a: good({ tabs: [] }) }), "tabs is missing or empty"));
check("thirteen tabs", says(run({ a: good({ tabs: Array.from({ length: 13 }, (_, i) => ({ name: "T" + i, actions: [{ name: "A" + i, keys: "F" + (i + 1) }] })) }) }), "an app holds 12"));
check("nine on a tab", says(run({ a: good({ tabs: [{ name: "T", actions: Array.from({ length: 9 }, (_, i) => ({ name: "A" + i, keys: "Ctrl+" + i })) }] }) }), "a tab holds 8"));
check("two tabs of one name", says(run({ a: good({ tabs: [{ name: "T", actions: [{ name: "A", keys: "F1" }] }, { name: "t", actions: [{ name: "B", keys: "F2" }] }] }) }), "two tabs are called"));
check("a chord the launcher cannot send", says(run({ a: good({ tabs: [{ name: "T", actions: [{ name: "A", keys: "Ctrl+Foo" }] }] }) }), "not a shortcut Loungepad can send"));
check("a chord not in its normal spelling", says(run({ a: good({ tabs: [{ name: "T", actions: [{ name: "A", keys: "shift+ctrl+t" }] }] }) }), `as "Ctrl+Shift+T"`));
check("a Win chord", says(run({ a: good({ tabs: [{ name: "T", actions: [{ name: "Snap", keys: "Win+Left" }] }] }) }), "acts on Windows"));
check("a chord twice", says(run({ a: good({ tabs: [{ name: "T", actions: [{ name: "A", keys: "F1" }] }, { name: "U", actions: [{ name: "B", keys: "F1" }] }] }) }), "is also"));
check("A, B or Guide alone as a button", ["A", "B", "Guide"].every(b => says(run({ a: good({ tabs: [{ name: "T", actions: [{ name: "X", keys: "F1", button: b }] }] }) }), "cannot be an action's button")));
check("a button in another spelling", says(run({ a: good({ tabs: [{ name: "T", actions: [{ name: "X", keys: "F1", button: "y + lb" }] }] }) }), `as "LB + Y"`));
check("not a button at all", says(run({ a: good({ tabs: [{ name: "T", actions: [{ name: "X", keys: "F1", button: "Q" }] }] }) }), "is not a button"));
check("a button twice", says(run({ a: good({ tabs: [{ name: "T", actions: [{ name: "X", keys: "F1", button: "Y" }, { name: "Z", keys: "F2", button: "Y" }] }] }) }), "button"));
check("over 64 KB", says(run({ a: JSON.stringify(good({ summary: "x".repeat(70000) })) }), "over 64 KB"));

// ---- duplicates ----
const reworded = good({ title: "Another sofa", summary: "Different words.", tabs: [{ name: "Couch", actions: good().tabs[0].actions.map(a => ({ ...a, name: a.name + "!", button: undefined })) }] });
check("the same programs and chords in the same order are the same layout, however worded",
  says(run({ "thorium-sofa": good(), "thorium-couch": reworded }), "again"));
const close = good({ title: "Close", tabs: [{ name: "Sofa", actions: [...good().tabs[0].actions.slice(0, 4).reverse(), { name: "Zoom in", keys: "Ctrl+=" }, { name: "Close tab", keys: "Ctrl+W" }] }] });
const rc = run({ "thorium-sofa": good(), "thorium-close": close });
check("a layout with 80% of another's chords for the same program is refused", says(rc, "in common with"), JSON.stringify(rc.problems));
check("unless a maintainer allowed it", clean(run({ "thorium-sofa": good(), "thorium-close": close }, { allowOverlap: true })));
check("the same chords for a different program are not a duplicate", clean(run({ "thorium-sofa": good(), "brave-sofa": good({ app: { name: "Arc", exes: ["arc"] } }) })));
const far = good({ title: "Far", tabs: [{ name: "Sofa", actions: [{ name: "New tab", keys: "Ctrl+T" }, { name: "Find", keys: "Ctrl+F" }, { name: "Print", keys: "Ctrl+P" }] }] });
check("one chord in common is no duplicate", clean(run({ "thorium-sofa": good(), "thorium-far": far })));
check("only what changed is compared", clean(run({ "thorium-sofa": good(), "thorium-close": close }, { changed: new Set(["unrelated"]) }))
  && says(run({ "thorium-sofa": good(), "thorium-close": close }, { changed: new Set(["thorium-close"]) }), "in common with"));
const chrome = data.packs.find(p => p.id === "chrome");
const asShipped = good({ title: "Chrome", app: { name: "Google Chrome", exes: ["chrome"] }, tabs: chrome.tabs.map(t => ({ name: t.name + " (mine)", actions: t.actions.map(a => ({ name: a.name, keys: a.keys })) })) });
check("a bundled pack's own layout adds nothing", says(run({ "chrome-same": asShipped }), "adds nothing"));
check("the pack's chords for another program do", clean(run({ "thorium-chrome": { ...asShipped, app: { name: "Thorium", exes: ["thorium"] } } })));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
