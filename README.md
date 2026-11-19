# bb-plugins

Personal, audited copies of every third-party bb plugin in use. One repo,
one owner: no code here is pulled from the community marketplace at install
time. See `AUDIT.md` for the security review of each vendored version and
`provenance.json` for the exact upstream commit each copy came from.

## Layout

```
plugins/           one directory per plugin, verbatim upstream source
  agent-board/     github.com/aaronphifer/bb-plugin-agent-board
  agent-traces/    github.com/charpeni/bb-plugins (plugins/agent-traces)
  bb-sidebar/     own fork: github.com/aade-sh/bb-sidebar (upstream: yusuf8834)
  bbium/           github.com/kuringer/bb-plugin-bbium
  burn/            github.com/kalindudc/burn
  flexoki/         github.com/ponomr/bb-plugin-flexoki
  fonts/           github.com/gtramontina/bb-plugin-fonts
.bb/plugins.json   bb collection manifest (lets bb resolve --plugin <name>)
provenance.json    upstream URL, version, tag, commit, license per plugin
AUDIT.md           security audit report, dated, per pinned commit
scripts/vendor.sh  re-vendor a plugin from its upstream at a pinned tag
```

## Install from this repo

bb refuses to install a plugin that is already installed, so first remove
the marketplace/upstream install, then install from here. Removing a plugin
deletes its bb-managed settings (burn keeps its own backup copy of its
settings for exactly this case):

```sh
bb plugin remove burn
bb plugin install "git:https://github.com/aade-sh/bb-plugins.git@main" --plugin burn
```

The `--plugin` name resolves through `.bb/plugins.json`. Use
`--subdirectory plugins/burn` instead if you prefer naming the path. A
local-path install (`bb plugin install path:/path/to/checkout --plugin
burn`) works when the checkout is readable on the bb server's machine.

Note: `--yes` skips bb's confirmation prompt. Prefer running without it the
first time, and read the resolved source it shows.

## Updating a plugin from upstream

```sh
scripts/vendor.sh <upstream-git-url> <tag> <name> [<subdirectory>]
```

For example, to move burn to upstream `v0.10.0`:

```sh
scripts/vendor.sh https://github.com/kalindudc/burn.git v0.10.0 burn
```

The script copies the source at the tag into `plugins/<name>`, updates
`provenance.json`, and prints the commit it vendored. Re-read the diff and
`AUDIT.md` before installing a re-vendored version: a new upstream release
is unaudited code until reviewed.

The bb version range in `engines.bb` / `engines.bbPluginSdk` of each plugin
still applies; bb rejects candidates the host cannot run.

## Changing plugin behavior

Edit the code in `plugins/<name>` directly — this repo is the source of
truth. Keep modifications out of upstream sync conflicts in mind: the more
you diverge, the more the next `vendor.sh` run will hurt. bb-sidebar is the
model for the alternative: an own fork with `origin` pointing at your GitHub
and `upstream` at the original.

## Upstream drift at audit time (2026-11-19)

- agent-board: installed 0.7.0; upstream also has 0.7.1.
- burn: installed 0.9.4; upstream also has 0.10.0.
- bbium, flexoki, fonts: installed version equals upstream latest.
