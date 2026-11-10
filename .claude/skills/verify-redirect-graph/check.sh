#!/bin/sh
# verify-redirect-graph: send every URL of the bound through the real app() router of this checkout,
# follow each redirect, and compare the broken rules with the known findings B1 and B2.
# Usage: .claude/skills/verify-redirect-graph/check.sh   (no argument; run from anywhere inside the checkout)
# Exit: 0 expected (B1 B2 reproduce, every other rule holds), 1 changed, 2 tooling missing, 3 check could not run.
# Copies the working tree (tracked and untracked files, no ignored files, no .env) to a temporary directory
# and builds there. Writes nothing into the checkout.
set -eu
SKILL=$(cd "$(dirname "$0")" && pwd)
ROOT=$(git -C "$SKILL" rev-parse --show-toplevel)
KNOWN_IDS="none"
# id:rule:start URLs broken at the sync commit
KNOWN=""

finish() { echo "RESULT: $1"; exit "$2"; }
missing() { echo "TOOLING MISSING: $1"; finish "TOOLING MISSING ($1); known findings $KNOWN_IDS not checked" 2; }
broke() { echo "CHECK FAILED: $1"; finish "CHECK FAILED ($1); known findings $KNOWN_IDS not checked" 3; }

command -v cargo >/dev/null 2>&1 || missing "cargo is not on PATH (Rust toolchain from rustup)"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/verify-redirect-graph.XXXXXX")
trap 'rm -rf "$WORK/target"' EXIT
mkdir -p "$WORK/src"
git -C "$ROOT" ls-files -z --cached --others --exclude-standard -- ':(exclude).env*' ':(exclude)*/.env*' \
  | (cd "$ROOT" && tar --null --ignore-failed-read -T - -cf -) | tar -xf - -C "$WORK/src"
cp "$SKILL/redirect_graph.rs" "$WORK/src/src/redirect_graph.rs"
printf '\n#[cfg(test)]\n#[path = "redirect_graph.rs"]\nmod redirect_graph;\n' >> "$WORK/src/src/main.rs"
echo "checking the working tree of $ROOT (HEAD $(git -C "$ROOT" rev-parse --short HEAD)) in $WORK"

(cd "$WORK/src" && CARGO_TARGET_DIR="$WORK/target" cargo test --offline --quiet -j 2 redirect_graph -- --nocapture > "$WORK/cargo.log" 2>&1) \
  || broke "cargo test of redirect_graph.rs failed, see $WORK/cargo.log (crates missing? run 'cargo fetch' once in the checkout)"
grep -E '^(ENUMERATED|BROKEN) ' "$WORK/cargo.log" | tee "$WORK/result.txt"
grep -q '^ENUMERATED ' "$WORK/result.txt" || broke "the enumeration printed nothing, see $WORK/cargo.log"

changed=
for k in $KNOWN; do
  id=${k%%:*} rest=${k#*:}
  rule=${rest%%:*} count=${rest#*:}
  got=$(sed -n "s/^BROKEN $rule \([0-9]*\)x.*/\1/p" "$WORK/result.txt")
  if [ "$got" = "$count" ]; then
    echo "$id still reproduces: $rule broken on $count start URLs"
  else
    echo "CHANGED $id: $rule broken on ${got:-0} start URLs, known finding says $count"
    changed="$changed $id"
  fi
done
for rule in $(sed -n 's/^BROKEN \([A-Za-z]*\) .*/\1/p' "$WORK/result.txt"); do
  case " $KNOWN " in *":$rule:"*) ;; *) echo "CHANGED: $rule newly broken"; changed="$changed $rule" ;; esac
done
echo "work dir: $WORK"
[ -z "$changed" ] && finish "EXPECTED; known findings $KNOWN_IDS; all rules hold" 0
finish "CHANGED ($(echo $changed)); known findings are $KNOWN_IDS, read SKILL.md 'Read the result'" 1
