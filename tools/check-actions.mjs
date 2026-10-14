#!/usr/bin/env node
/*
 * Checks the action layouts under actions/ (Loungepad's docs/ACTION-SHARING.md, "Community layouts"):
 *
 *   node tools/check-actions.mjs                  every layout's shape; duplicates for what changed
 *                                                 since origin/main (everything, without git)
 *   --base <ref>      duplicates for what changed since <ref>: the pull request's base, in CI
 *   --all             duplicates for every layout against every other
 *   --allow-overlap   the maintainer's `not-a-duplicate` label: a layout close to another passes
 *
 * A layout is data the launcher cleans again on every PC, so nothing here is a line of defence. It
 * is what keeps the repository tidy and saves a review: the shape, the text, chords the launcher
 * can send, nothing that acts on Windows itself, no button a pad cannot give an action, and no
 * layout that is another one again. It first checks itself against the launcher's own test cases
 * (launcher-data.json), so a rule that drifted from the launcher's fails here, not on a PC.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORMAT, LIMITS, MAX_FILE_BYTES, MAX_ITEMS, MAX_TABS, chordSet, cleanButton, fingerprint, hasWin, isReservedButton,
  loadLauncherData, normalize, overlap, shape,
} from "./actions-lib.mjs";

const ID = /^[a-z][a-z0-9-]{0,39}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const EXE = /^[a-z0-9][a-z0-9 ._+()-]{0,63}$/;
/** Exe names that are not one program: a layout for one would show up on many. */
export const GENERIC_EXES = new Set([
  "launcher", "app", "application", "game", "main", "start", "run", "play", "setup", "install", "installer", "uninstall",
  "unins000", "update", "updater", "client", "helper", "host", "service", "java", "javaw", "python", "pythonw", "py",
  "node", "electron", "cmd", "powershell", "pwsh", "conhost", "rundll32", "svchost", "dllhost", "applicationframehost",
]);
/** At or over this share of chords in common with another layout for the same program, it is that layout again. */
export const OVERLAP = 0.8;
const FOLDER_FILES = new Set(["layout.json", "README.md"]);
const BAD_CHARS = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}<>]/u;

/** The launcher's own test cases, run against this copy of its rules. Empty when they agree. */
export function selfTest(data) {
  const wrong = [];
  for (const v of data.vectors.chords) {
    const got = normalize(v.keys, data.named);
    if (got !== v.normal) wrong.push(`"${v.keys}" reads as ${got}, the launcher says ${v.normal}`);
  }
  for (const f of data.vectors.fingerprints) {
    const got = fingerprint({ app: { exes: f.exes }, tabs: f.tabs.map(t => ({ actions: t.map(keys => ({ keys })) })) }, data.named);
    if (got !== f.sha256) wrong.push(`a fingerprint reads as ${got}, the launcher says ${f.sha256}`);
  }
  return wrong;
}

/** One layout's folder: its problems, and the layout when it could be read. */
export function checkLayout(root, id, data) {
  const where = `actions/${id}`;
  const problems = [];
  const problem = (text) => problems.push(`${where}: ${text}`);
  if (!ID.test(id)) problem("the folder name is not an id (lower-case letters, digits and hyphens, starting with a letter, 40 at most)");
  const dir = join(root, "actions", id);
  for (const name of readdirSync(dir)) {
    if (statSync(join(dir, name)).isDirectory()) problem(`"${name}" is a folder; a layout is layout.json and, if you like, README.md`);
    else if (!FOLDER_FILES.has(name)) problem(`"${name}" is not part of a layout; a layout is layout.json and, if you like, README.md`);
  }
  const file = join(dir, "layout.json");
  if (!existsSync(file)) { problem("no layout.json"); return { problems }; }
  if (statSync(file).size > MAX_FILE_BYTES) { problem(`layout.json is over ${MAX_FILE_BYTES / 1024} KB`); return { problems }; }
  let layout;
  try { layout = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, "")); }
  catch (e) { problem(`layout.json is not JSON: ${e.message}`); return { problems }; }
  if (!layout || typeof layout !== "object" || Array.isArray(layout)) { problem("layout.json is not an object"); return { problems }; }

  const only = (at, obj, allowed) => {
    for (const k of Object.keys(obj)) if (!allowed.includes(k)) problem(`${at} has "${k}", which a layout does not have`);
  };
  const text = (at, value, max, required) => {
    if (value === undefined || value === null) { if (required) problem(`${at} is missing`); return; }
    if (typeof value !== "string") { problem(`${at} is not text`); return; }
    if (required && !value.trim()) problem(`${at} is empty`);
    if (value.length > max) problem(`${at} is ${value.length} characters; ${max} at most`);
    if (BAD_CHARS.test(value)) problem(`${at} holds a control or invisible character, or < or >`);
    else if (value !== value.trim().replace(/\s+/g, " ")) problem(`${at} has spaces at an end, or more than one in a row`);
    if (/:\/\/|www\./i.test(value)) problem(`${at} holds a web address`);
  };

  only("layout.json", layout, ["format", "app", "title", "summary", "author", "version", "minLauncher", "tabs"]);
  if (layout.format !== FORMAT) problem(`format must be "${FORMAT}"`);
  text("title", layout.title, LIMITS.title, true);
  text("summary", layout.summary, LIMITS.summary, true);
  text("author", layout.author, LIMITS.author, true);
  if (!VERSION.test(String(layout.version ?? ""))) problem(`version "${layout.version ?? ""}" is not major.minor.patch`);
  if (layout.minLauncher !== undefined && !VERSION.test(String(layout.minLauncher))) problem(`minLauncher "${layout.minLauncher}" is not major.minor.patch`);

  const app = layout.app;
  if (!app || typeof app !== "object" || Array.isArray(app)) problem("app is missing");
  else {
    only("app", app, ["name", "exes", "product"]);
    text("app.name", app.name, LIMITS.name, true);
    text("app.product", app.product, LIMITS.product, false);
    const exes = Array.isArray(app.exes) ? app.exes : [];
    if (!exes.length) problem("app.exes names no program");
    if (exes.length > LIMITS.exes) problem(`app.exes names ${exes.length} programs; ${LIMITS.exes} at most`);
    if (new Set(exes).size !== exes.length) problem("app.exes names a program twice");
    for (const exe of exes) {
      if (typeof exe !== "string" || !EXE.test(exe)) problem(`app.exes: "${exe}" is not an exe name (lower case, without .exe, like "thorium")`);
      else if (exe.endsWith(".exe")) problem(`app.exes: "${exe}" is written without .exe`);
      else if (GENERIC_EXES.has(exe)) problem(`app.exes: "${exe}" is the name of too many programs to be one`);
    }
  }

  const tabs = Array.isArray(layout.tabs) ? layout.tabs : [];
  if (!tabs.length) problem("tabs is missing or empty");
  if (tabs.length > MAX_TABS) problem(`${tabs.length} tabs; an app holds ${MAX_TABS}`);
  const chords = new Map(), buttons = new Map(), tabNames = new Set();
  tabs.forEach((t, ti) => {
    const at = `tab ${ti + 1}`;
    if (!t || typeof t !== "object" || Array.isArray(t)) { problem(`${at} is not an object`); return; }
    only(at, t, ["name", "actions"]);
    text(`${at}'s name`, t.name, LIMITS.tab, true);
    if (typeof t.name === "string") {
      if (tabNames.has(t.name.toLowerCase())) problem(`two tabs are called "${t.name}"`);
      tabNames.add(t.name.toLowerCase());
    }
    const actions = Array.isArray(t.actions) ? t.actions : [];
    if (!actions.length) problem(`${at} has no actions`);
    if (actions.length > MAX_ITEMS) problem(`${at} has ${actions.length} actions; a tab holds ${MAX_ITEMS}`);
    actions.forEach((a, ai) => {
      const here = `${at}, action ${ai + 1}${a && typeof a.name === "string" ? ` ("${a.name}")` : ""}`;
      if (!a || typeof a !== "object" || Array.isArray(a)) { problem(`${here} is not an object`); return; }
      only(here, a, ["name", "keys", "desc", "button"]);
      text(`${here}'s name`, a.name, LIMITS.name, true);
      text(`${here}'s desc`, a.desc, LIMITS.desc, false);
      const chord = typeof a.keys === "string" ? normalize(a.keys, data.named) : null;
      if (!chord) problem(`${here}: "${a.keys ?? ""}" is not a shortcut Loungepad can send`);
      else {
        if (chord !== a.keys) problem(`${here}: write "${a.keys}" as "${chord}"`);
        if (hasWin(chord)) problem(`${here}: ${chord} acts on Windows, not on the program; a layout keeps to its program`);
        if (chords.has(chord)) problem(`${here}: ${chord} is also "${chords.get(chord)}"; a shortcut does one thing in a program`);
        chords.set(chord, a.name);
      }
      if (a.button !== undefined && a.button !== null) {
        const combo = cleanButton(a.button);
        if (!combo) problem(`${here}: "${a.button}" is not a button`);
        else {
          if (combo !== a.button) problem(`${here}: write the button "${a.button}" as "${combo}"`);
          if (isReservedButton(combo)) problem(`${here}: ${combo} on its own cannot be an action's button (A and B click, Windows keeps Guide)`);
          if (buttons.has(combo)) problem(`${here}: ${combo} is also "${buttons.get(combo)}"'s button`);
          buttons.set(combo, a.name);
        }
      }
    });
  });
  return { layout, problems };
}

/** What changed under actions/ since a ref, committed or not; null when git cannot say. */
function changedSince(root, ref) {
  const ids = new Set();
  const take = (path) => { const m = /^actions\/([^/]+)\//.exec(path.trim().replace(/^"|"$/g, "")); if (m) ids.add(m[1]); };
  try {
    execFileSync("git", ["rev-parse", "--verify", "--quiet", ref], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["diff", "--name-only", `${ref}...HEAD`, "--", "actions"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).forEach(take);
    execFileSync("git", ["status", "--porcelain", "--untracked-files=all", "--", "actions"], { cwd: root, encoding: "utf8" })
      .split(/\r?\n/).filter(Boolean).forEach(l => take(l.slice(3).split(" -> ").pop()));
    return ids;
  } catch { return null; }
}

/**
 * Every layout's shape, then duplicates for `changed` (a Set of ids, or "all"): the same layout as
 * another, too close to another for the same program, or exactly a bundled pack.
 */
export function checkRepo(root, { changed = "all", allowOverlap = false, data = loadLauncherData() } = {}) {
  const problems = [], notes = [];
  const drift = selfTest(data);
  if (drift.length) {
    problems.push("tools/actions-lib.mjs no longer reads chords the way the launcher does:", ...drift.map(d => "  " + d));
    return { problems, notes, count: 0 };
  }
  const dir = join(root, "actions");
  const ids = existsSync(dir) ? readdirSync(dir).filter(n => statSync(join(dir, n)).isDirectory() && !n.startsWith(".")).sort() : [];
  const layouts = new Map();
  for (const id of ids) {
    const r = checkLayout(root, id, data);
    problems.push(...r.problems);
    if (r.layout && !r.problems.length) layouts.set(id, r.layout);
  }

  const compare = changed === "all" ? [...layouts.keys()] : [...layouts.keys()].filter(id => changed.has(id));
  const done = new Set();
  for (const id of compare) {
    const l = layouts.get(id);
    const exes = new Set(l.app.exes);
    const fp = fingerprint(l, data.named), mine = chordSet(l, data.named);
    for (const [other, o] of layouts) {
      if (other === id || !o.app.exes.some(e => exes.has(e))) continue;
      const pair = [id, other].sort().join(" ");
      if (done.has(pair)) continue;
      done.add(pair);
      if (fingerprint(o, data.named) === fp) {
        problems.push(`actions/${id} is actions/${other} again: the same programs and the same shortcuts in the same order`);
        continue;
      }
      const share = overlap(mine, chordSet(o, data.named));
      if (share >= OVERLAP) {
        const say = `actions/${id} has ${Math.round(share * 100)}% of its shortcuts in common with actions/${other}`;
        if (allowOverlap) notes.push(`${say} (allowed: not-a-duplicate)`);
        else problems.push(`${say}. Improve that layout with a pull request instead; or, if this one is for a different use of the program, say so and a maintainer can label it not-a-duplicate`);
      }
    }
    for (const pack of data.packs) {
      if (!pack.exes.length || !l.app.exes.every(e => pack.exes.includes(e))) continue;
      if (shape(l, data.named) === shape(pack, data.named))
        problems.push(`actions/${id} is ${pack.name}'s own layout as Loungepad ships it, so it adds nothing for ${pack.name}`);
    }
  }
  return { problems, notes, count: layouts.size, compared: compare.length };
}

const runDirectly = process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (runDirectly) {
  const args = process.argv.slice(2);
  const root = join(fileURLToPath(import.meta.url), "..", "..");
  const allowOverlap = args.includes("--allow-overlap") || /^(1|true)$/i.test(process.env.ALLOW_OVERLAP || "");
  let changed = "all";
  if (!args.includes("--all")) {
    const ref = args.includes("--base") ? args[args.indexOf("--base") + 1] : "origin/main";
    changed = changedSince(root, ref) ?? "all";
  }
  const r = checkRepo(root, { changed, allowOverlap });
  for (const n of r.notes) console.log("note: " + n);
  if (r.problems.length) {
    console.error(`action layouts: ${r.problems.length} problem(s)\n  ` + r.problems.join("\n  "));
    process.exit(1);
  }
  console.log(`action layouts: ${r.count} checked, ${r.compared} compared for duplicates${changed === "all" ? "" : " (what changed)"}`);
}
