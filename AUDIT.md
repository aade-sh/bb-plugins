# Security audit — 2026-11-19

Audited by an agent, at the request of the repository owner. Scope: every
non-builtin bb plugin installed on the bb server (machine `yavin`) at audit
time. Each plugin was reviewed at the **exact commit that is installed** (see
`provenance.json`); upstream `main` may be newer.

## Method

For each plugin:

1. `package.json`: install-time scripts, runtime dependencies, bb entries.
2. Full-text scan of all source for: network calls (`fetch`, `http*`, `ws`,
   `net`, `dns`, `tls`), process execution (`child_process`, `exec`, `spawn`,
   `eval`, `new Function`), credential and secret access (`.ssh`, keychain,
   `auth.json`, env vars), obfuscation (base64/hex blobs, encoded strings),
   and file writes outside the plugin's own storage.
3. Manual read of every server and host entry point (the code bb runs with
   full trust), plus a skim of frontend code that captures input.

## Verdict: no nefarious behavior found in any plugin

No plugin exfiltrates data, no plugin hides code, no plugin runs shell
commands behind your back at install time. Details and trust surfaces per
plugin below.

## Findings per plugin

### agent-board (0.7.0)

- No network access anywhere in the plugin.
- `child_process` appears only in `scripts/verify-package.mjs`, a manual
  packaging check (`npm run verify:package`); it never runs at install time.
- Reads thread, workflow, and project data through the bb SDK only, on
  demand. Persists only attention-dismissal preferences in bb plugin storage.
- Hygiene worth noting: it parses git remote URLs and deliberately strips
  embedded credentials before display (tested behavior).
- Trust surface: `.npmrc` sets `allow-scripts=better-sqlite3,node-pty,@parcel/watcher`.
  These are mainstream native packages, but they compile and run native code
  when the plugin is installed/built.

### agent-traces (1.0.0)

- One network feature: exporting a turn as OTLP traces. It POSTs the turn's
  trace to an endpoint **you must configure yourself** in the plugin settings
  (`otlpEndpoint`), and only when you run an export command, or continuously
  if you turn on `autoExport` (default off). Headers are marked secret and
  stored by bb as such.
- Everything else is reads through the bb SDK plus its own trace cache in bb
  plugin storage.

### bb-sidebar (0.3.12, own fork of yusuf8834/bb-sidebar)

- Host entry runs local commands via `execFile` (no shell, fixed argument
  lists, 5s timeout): `lsof` and `ps` to list listening ports and attribute
  them to bb threads, and `gh pr view <url> --json ...` to enrich PR rows.
  `ps eww -o command=` reads the environment of those processes to attribute
  ports — local introspection, in line with the advertised feature.
- Frontend fetches project favicons from the bb server's own origin, not from
  third parties.
- Trust surface: `package.json` has `"prepare": "lefthook install"`, which
  runs when npm installs inside a checkout of this plugin. It only registers
  git hooks (dev tooling), but it is an install-time script, so it is
  recorded here.
- Vendored from the owner's fork (`aade-sh/bb-sidebar`) at the exact commit
  the server runs, not from upstream.

### bbium (0.1.5)

- Frontend-only. The server entry only declares settings.
- `keys.ts` listens to `keydown` at the window level and routes vim-style
  keys to actions. It is inert while focus is in a text field (`isTyping`), it
  stores nothing, and it sends nothing. It does call
  `e.stopImmediatePropagation()` for keys it handles, which is the feature,
  not a risk.

### burn (0.9.4)

- Reads local agent data on the machine bb runs it on: pi session logs,
  `~/.claude/projects` (respecting `CLAUDE_CONFIG_DIR`), the opencode
  database, and XDG data/cache dirs. All read-only (`readdir`, `stat`,
  `open`, `readFileSync`). No writes to those locations, no network access.
- Keeps a backup copy of **its own settings** (budgets, price overrides —
  no secrets) in bb plugin storage so they survive a plugin reinstall. This
  is documented in its source and is the plugin's own data only.
- Has a file watcher on the pi session dir to refresh cost chips live;
  bounded and disposed on unload.

### flexoki (0.1.5)

- Theme-only. The server entry is an empty factory; the plugin ships CSS and
  code-theme JSON.
- Note: the vendored copy contains an upstream `AGENTS.md` (plugin
  development notes, reviewed, benign). Any agent working inside
  `plugins/flexoki/` will have it injected as instructions — see
  "Instruction files in vendored plugins" below.

### fonts (0.2.0)

- Frontend-only typography preferences; the server entry only logs. No
  network, no storage beyond bb's own client-side settings mechanism.
- "Remote browser" code paths are about rendering in a bb remote-browser
  window via DOM custom events — no external network calls.

## Instruction files in vendored plugins

`plugins/flexoki/AGENTS.md` and `plugins/bb-sidebar/{AGENTS.md,CLAUDE.md}`
are upstream developer instructions that ride along with the source. Their
content was reviewed and is benign. But be aware: coding agents treat these
files as instructions when they work in those directories, and a future
upstream sync could change their content. If you do not want vendored code
to carry instruction files, delete them at vendor time and note the
deletion here.

## Out of scope (not vendored)

- All `builtin:` plugins — they ship inside the bb app itself.
- `preview-layout` — the owner's own plugin (no upstream, `private: true`).

## Residual risks that remain after this audit

1. **Dependencies.** Installing or building any of these plugins still
   resolves npm packages from the registry. The runtime dependency sets are
   small and mainstream (`zod`, Radix UI components, icon packs), but a
   compromised upstream dependency would still reach you. Committed
   `package-lock.json` files exist for bbium, burn, flexoki, and fonts.
2. **Updates.** This audit covers the pinned commits in `provenance.json`
   only. A future upstream release is unaudited until you re-vendor and
   re-review it.
3. **The `prepare` script in bb-sidebar** and the `.npmrc` native script
   allow-list in agent-board, both documented above.
