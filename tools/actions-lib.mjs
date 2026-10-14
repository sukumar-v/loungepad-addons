/*
 * The launcher's rules for action layouts, in JavaScript: for check-actions.mjs and build-index.mjs.
 *
 * The launcher is the authority (Loungepad/Models/Actions.cs and ActionLayout.cs); this is a copy,
 * and launcher-data.json carries the test cases both have to pass (`vectors`), so a difference
 * fails the checks here rather than reaching anybody's PC. launcher-data.json is generated in the
 * Loungepad repository: `node tools/action-data.mjs > ../loungepad-addons/tools/launcher-data.json`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FORMAT = "loungepad-actions/1";
export const MAX_TABS = 12, MAX_ITEMS = 8;
export const LIMITS = { name: 48, tab: 24, desc: 120, title: 48, summary: 120, author: 40, product: 64, exes: 8, exe: 64 };
export const MAX_FILE_BYTES = 64 * 1024;
/** The first launcher that reads layouts from the catalogue. */
export const ACTIONS_MIN_LAUNCHER = "1.10.0";

export function loadLauncherData(file = fileURLToPath(new URL("./launcher-data.json", import.meta.url))) {
  return JSON.parse(readFileSync(file, "utf8"));
}

const MODIFIERS = ["Ctrl", "Shift", "Alt", "Win"];
const isModifier = (p) => MODIFIERS.some(m => m.toLowerCase() === p.toLowerCase());

/** ShortcutKeys.Parts: "Ctrl+Shift+T" into its parts; the key is the last, "+" on its own is a key. */
export function parts(keys) {
  const s = String(keys ?? "").trim();
  const list = [];
  let i = 0;
  while (i < s.length) {
    const j = s.indexOf("+", i);
    if (j < 0 || j === s.length - 1) { list.push(s.slice(i).trim()); break; }
    const part = s.slice(i, j).trim();
    list.push(part.length > 0 ? part : "+");
    i = j + 1;
  }
  return list.filter(p => p.length > 0);
}

function canonicalKey(key, named) {
  if (key.length === 1) return key.toUpperCase();
  if ((key.length === 2 || key.length === 3) && /^[fF]\d+$/.test(key)) return "F" + key.slice(1);
  if (key.length === 4 && /^num\d$/i.test(key)) return "Num" + key[3];
  return named.find(n => n.toLowerCase() === key.toLowerCase()) ?? key;
}

/**
 * ShortcutKeys.IsValid then Normalize: the chord as the launcher spells it, or null when the
 * launcher could not send it. One difference, on purpose: a punctuation key is accepted only when
 * it is printable ASCII, which every common layout types; the launcher asks the layout in use.
 */
export function normalize(keys, named) {
  const ps = parts(keys);
  if (!ps.length) return null;
  const mods = ps.slice(0, -1);
  if (!mods.every(isModifier)) return null;
  const key = ps[ps.length - 1];
  if (isModifier(key)) return null;
  if (key.length === 1) {
    if (!/^[\x21-\x7E]$/.test(key)) return null;
  } else if ((key.length === 2 || key.length === 3) && /^[fF]\d+$/.test(key) && +key.slice(1) >= 1 && +key.slice(1) <= 24) {
    // F1 to F24
  } else if (key.length === 4 && /^num\d$/i.test(key)) {
    // Num0 to Num9
  } else if (!named.some(n => n.toLowerCase() === key.toLowerCase())) {
    return null;
  }
  const order = MODIFIERS.filter(m => mods.some(p => p.toLowerCase() === m.toLowerCase()));
  return [...order, canonicalKey(key, named)].join("+");
}

export const hasWin = (chord) => parts(chord).slice(0, -1).some(p => p.toLowerCase() === "win");

/* ActionService.CleanButton: a combo in the launcher's names and order. */
const BUTTON_ORDER = ["LT", "RT", "LB", "RB", "LS", "RS", "View", "Menu", "Guide", "A", "B", "X", "Y", "Up", "Down", "Left", "Right"];
const BUTTON_NAMES = {
  A: "A", B: "B", X: "X", Y: "Y", LB: "LB", RB: "RB", LT: "LT", RT: "RT", LS: "LS", RS: "RS",
  VIEW: "View", BACK: "View", MENU: "Menu", START: "Menu", GUIDE: "Guide", XBOX: "Guide", PS: "Guide",
  UP: "Up", DOWN: "Down", LEFT: "Left", RIGHT: "Right",
};
export function cleanButton(button) {
  if (button == null || !String(button).trim()) return null;
  const ps = [...new Set(String(button).split("+").map(p => p.trim()).filter(Boolean).map(p => BUTTON_NAMES[p.toUpperCase()]).filter(Boolean))];
  return ps.length ? BUTTON_ORDER.filter(b => ps.includes(b)).join(" + ") : null;
}
export const isReservedButton = (combo) => combo === "A" || combo === "B" || combo === "Guide";

/**
 * ActionLayouts.Fingerprint: the programs, then each tab's chords in order. Names, descriptions
 * and buttons are left out, so rewording a layout does not make it another one.
 */
export function fingerprint(layout, named) {
  const exes = [...new Set(((layout.app && layout.app.exes) || []).map(e => String(e).toLowerCase()))].sort();
  let s = exes.join(",");
  for (const t of layout.tabs || []) s += "\n" + (t.actions || []).map(a => normalize(a.keys, named) ?? "").join("|");
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** The tabs' chords alone, for comparing a layout with a pack whatever programs either names. */
export function shape(layout, named) {
  return (layout.tabs || []).map(t => (t.actions || []).map(a => normalize(a.keys, named) ?? "").join("|")).join("\n");
}

export function chordSet(layout, named) {
  return new Set((layout.tabs || []).flatMap(t => (t.actions || []).map(a => normalize(a.keys, named))).filter(Boolean));
}

/** Shared over all: 1 for the same chords, 0 for none in common. */
export function overlap(a, b) {
  if (!a.size && !b.size) return 1;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return shared / (a.size + b.size - shared);
}
