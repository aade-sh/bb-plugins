#!/bin/sh
# Vendor a bb plugin from its upstream repository at a pinned tag.
#
# Usage: scripts/vendor.sh <upstream-git-url> <tag> <name> [<subdirectory>]
#
# Copies the plugin source at <tag> into plugins/<name>, records the commit
# in provenance.json, and prints what it did. The copy is verbatim upstream
# source; review the diff before installing it.
set -eu

[ $# -ge 3 ] || { echo "usage: $0 <upstream-git-url> <tag> <name> [<subdirectory>]" >&2; exit 2; }
URL=$1
TAG=$2
NAME=$3
SUBDIR=${4:-}
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

git clone -q "$URL" "$TMP/upstream"
COMMIT=$(git -C "$TMP/upstream" rev-list -n1 "$TAG") || exit 1

DEST="$ROOT/plugins/$NAME"
rm -rf "$DEST"
mkdir -p "$DEST"
if [ -n "$SUBDIR" ]; then
  STRIP=$(printf '%s' "$SUBDIR" | awk -F/ '{print NF}')
  git -C "$TMP/upstream" archive "$TAG" "$SUBDIR" | tar -x -C "$DEST" --strip-components="$STRIP"
else
  git -C "$TMP/upstream" archive "$TAG" | tar -x -C "$DEST"
fi

VERSION=$(node -e "console.log(require('$DEST/package.json').version)")
echo "vendored $NAME $VERSION from $URL at $TAG ($COMMIT)"

node - "$ROOT/provenance.json" "$NAME" "$URL" "$VERSION" "$TAG" "$COMMIT" "$SUBDIR" <<'EOF'
const fs = require("fs");
const [path, name, url, version, tag, commit, subdir] = process.argv.slice(2);
const doc = JSON.parse(fs.readFileSync(path, "utf8"));
const entry = {
  name,
  upstream: url.replace(/\.git$/, ""),
  ...(subdir ? { subdirectory: subdir } : {}),
  version,
  tag,
  commit,
};
const others = doc.plugins.filter((p) => p.name !== name);
const previous = doc.plugins.find((p) => p.name === name) || {};
doc.plugins = [...others, { ...previous, ...entry }].sort((a, b) => a.name.localeCompare(b.name));
fs.writeFileSync(path, JSON.stringify(doc, null, 2) + "\n");
EOF

echo "updated provenance.json — review the diff, then re-audit if upstream changed behavior"
