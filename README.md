# Loungepad add-ons

Community themes, extensions and action layouts for [Loungepad](https://github.com/sukumar-v/Loungepad),
the controller-first launcher for a TV. Themes and extensions are installed from inside the
launcher, under **Settings → Add-ons**, and updated from there when a new version is merged. Action
layouts are found under each program's wheel in **Settings → Actions** (Y Options, then Community layouts).

```
themes/<id>/              a theme: theme.css, with theme.json and theme.html as it needs
extensions/<id>/          an extension: manifest.json and its module
actions/<id>/layout.json  an action layout: one program's keyboard shortcuts, on tabs (CC0, see actions/LICENSE)
index.json                what the launcher reads -- built from the folders, never edited by hand
tools/build-index.mjs     rebuilds index.json
tools/check-actions.mjs   checks the action layouts; tools/test-check-actions.mjs tests it
tools/launcher-data.json  the launcher's packs, key names and test cases, copied from Loungepad
```

## Contributing

1. Put your theme under `themes/<id>` or your extension under `extensions/<id>`, where `<id>` is
   letters, digits and hyphens, starting with a letter. The id is the folder name, forever.
2. Give it a `version` of the form `major.minor.patch` in its manifest, and bump it in every pull
   request that changes it: the version is how the launcher knows there is an update.
3. Run `node tools/build-index.mjs` and commit `index.json` with your change (the checks fail
   otherwise; a merge to `main` rebuilds it anyway).
4. Open a pull request against `main`. Say what it does and, for an extension, what it reaches.

How to write one, and what an extension may and may not do, is in Loungepad's
[docs/ADDONS.md](https://github.com/sukumar-v/Loungepad/blob/main/docs/ADDONS.md); themes are in
[docs/THEMES.md](https://github.com/sukumar-v/Loungepad/blob/main/docs/THEMES.md).

### An action layout

A layout is a program's keyboard shortcuts on tabs, with a button for any you like: what you set
up under Settings → Actions, shared. You do not write one by hand.

1. In Loungepad, arrange the program's wheel under **Settings → Actions**, then **Y Options → Save
   to a file**. That writes `<Program>.actions.json`.
2. Add a `summary` (a sentence: who it is for, what is on the shoulders), your `author` name and a
   `version` (`1.0.0`). Check the `title` and the program's `exes` (its exe names, lower case,
   without `.exe`; several when the same layout fits several programs, like Chromium browsers).
3. Put it in `actions/<id>/layout.json`, where `<id>` starts with the program: `thorium-sofa`.
   A `README.md` beside it is welcome; nothing else goes in the folder.
4. Run `node tools/check-actions.mjs` and fix what it says, then `node tools/build-index.mjs`.
5. Open a pull request. By submitting it you dedicate the layout to the public domain (CC0, see
   [actions/LICENSE](actions/LICENSE)).

**What the checks refuse**, and why:

- **A shortcut Loungepad cannot send**, or one written another way than the launcher writes it
  (`shift+ctrl+t` is `Ctrl+Shift+T`). The check says what to write.
- **A Win shortcut.** It acts on Windows, not on the program, and a layout keeps to its program.
- **A, B or Guide alone as a button** (A and B click, Windows keeps Guide), and one button or one
  shortcut twice.
- **Markup, invisible characters or web addresses** in any text, and doubled spaces.
- **An exe name that is many programs**: `launcher`, `game`, `javaw` and the like.
- **The same layout again**: the same programs and the same shortcuts in the same order, however
  it is worded. **One that is mostly another**: 80% or more of its shortcuts in common with a layout
  for the same program. Improve that one with a pull request instead; if yours is for a different
  use of the program (Photoshop for painting, not for photographs), say so, and a maintainer can
  label the pull request `not-a-duplicate`.
- **A program's own layout as Loungepad ships it.** Everyone has that one already.

A layout cannot run anything: the launcher cleans it again on every PC, shows every shortcut beside
its name before anything changes, keeps a program's own shortcuts under its own names, and brings
buttons in only when asked. The review is about whether the shortcuts do what the names say.

`tools/launcher-data.json` is the launcher's packs, key names and test cases. When those change in
Loungepad, refresh it from a Loungepad checkout beside this one:
`node ../Loungepad/tools/action-data.mjs > tools/launcher-data.json`.

### What a review looks for

- **It does what it says.** An extension's `permissions.hosts` names every host it talks to, and
  nothing else; what it stores per game is what its `gameFacts` describe.
- **It is readable.** Plain JavaScript, no minified or generated code, no `eval`, no code fetched
  at run time. A reviewer has to be able to read the whole thing in one sitting.
- **It matches carefully.** A metadata source takes a result only when it is certainly the game.
  A wrong answer looks exactly like a right one, and "Portal" must never match "Portal 2".
- **It is polite to the site it uses.** No more requests than the job needs; the launcher paces
  them, but a search per game is the budget.
- **A theme is CSS and markup.** `<script>` and `on*` attributes are stripped by the launcher
  anyway; a theme that needs them is not a theme.

### Testing before you submit

An extension folder should carry a `test.mjs` that runs the module under Node against the live
site with a stand-in `loungepad` (HowLongToBeat's is the pattern). In the launcher, **Install from
a file → a folder** installs your working copy, **Reload from the folder** picks up an edit, and
**Open developer tools** on the add-on's page is its console.

## What is here

| | | |
|---|---|---|
| **HowLongToBeat** | extension | how long each game takes to beat, from howlongtobeat.com, on its page |
| **Nova** | theme | a console home screen: square icons over full-screen art, each game's hub (Play, achievements, stats, mods, activities, media, game info) under them, and a game library with Installed and Your Collection |
| **Zen Browser from the sofa** | action layout | Zen Browser's shortcuts on four tabs: browsing, tabs and workspaces, compact mode and split view, the page; new tab, back and tabs on the pad |
