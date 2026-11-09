#!/bin/sh
# verify-scroll-highlight: serve a build of this checkout on 127.0.0.1, check in Chromium that ScrollTracking.tla
# still describes static/main.js on the real page, replay the known bug paths C1 to C3, run TLC, compare.
# Usage: .claude/skills/verify-scroll-highlight/check.sh   (no argument; run from anywhere inside the checkout)
# Env: JAVA, TLA2TOOLS, PW_CORE, CHROME (see SKILL.md "Tools").
# Exit: 0 expected (C1 C2 C3 reproduce, every other rule holds), 1 changed, 2 tooling missing, 3 check could not run.
# Copies the working tree (tracked and untracked files, no ignored files, no .env) to a temporary directory
# and builds there. Writes nothing into the checkout.
set -eu
SKILL=$(cd "$(dirname "$0")" && pwd)
ROOT=$(git -C "$SKILL" rev-parse --show-toplevel)
KNOWN_IDS="C1 C2 C3"

finish() { echo "RESULT: $1"; exit "$2"; }
missing() { echo "TOOLING MISSING: $1"; finish "TOOLING MISSING ($1); known findings $KNOWN_IDS not checked" 2; }
broke() { echo "CHECK FAILED: $1"; finish "CHECK FAILED ($1); known findings $KNOWN_IDS not checked" 3; }

if command -v mise >/dev/null 2>&1 && { [ -f "$ROOT/mise.toml" ] || [ -f "$ROOT/.mise.toml" ]; }; then
  eval "$(cd "$ROOT" && mise env -s bash)"
fi
JAVA=${JAVA:-$(command -v java || true)}
{ [ -n "$JAVA" ] && "$JAVA" -version >/dev/null 2>&1; } || missing "JAVA: set JAVA to a Java >= 11 binary"
[ -f "${TLA2TOOLS:-}" ] || missing "TLA2TOOLS: set TLA2TOOLS to tla2tools.jar v1.7.4"
command -v cargo >/dev/null 2>&1 || missing "cargo is not on PATH (Rust toolchain from rustup)"
command -v node >/dev/null 2>&1 || missing "node is not on PATH (Node >= 18)"
[ -f "${PW_CORE:-}/index.mjs" ] || missing "PW_CORE: set PW_CORE to a playwright-core package directory"
[ -x "${CHROME:-}" ] || missing "CHROME: set CHROME to a Chromium or chrome-headless-shell binary"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/verify-scroll-highlight.XXXXXX")
SERVER=
trap '[ -z "$SERVER" ] || kill "$SERVER" 2>/dev/null || true; rm -rf "$WORK/target"' EXIT
mkdir -p "$WORK/src"
git -C "$ROOT" ls-files -z --cached --others --exclude-standard -- ':(exclude).env*' ':(exclude)*/.env*' \
  | (cd "$ROOT" && tar --null --ignore-failed-read -T - -cf -) | tar -xf - -C "$WORK/src"
echo "checking the working tree of $ROOT (HEAD $(git -C "$ROOT" rev-parse --short HEAD)) in $WORK"

# The copy's main() binds 127.0.0.1 on a free port below the kernel's ephemeral range instead of 0.0.0.0:3000.
n=$(grep -c 'TcpListener::bind("0.0.0.0:3000")' "$WORK/src/src/main.rs" || true)
[ "$n" = 1 ] || broke "the bind line was not found once in src/main.rs; update check.sh"
PORT=$(node -e '
const net = require("net");
const take = () => { const port = 20000 + Math.floor(Math.random() * 12000); const s = net.createServer();
  s.once("error", take).listen(port, "127.0.0.1", () => { console.log(port); s.close(); }); };
take();')
sed -i "s/TcpListener::bind(\"0.0.0.0:3000\")/TcpListener::bind(\"127.0.0.1:$PORT\")/" "$WORK/src/src/main.rs"
(cd "$WORK/src" && CARGO_TARGET_DIR="$WORK/target" cargo build --offline --quiet -j 2 > "$WORK/build.log" 2>&1) \
  || broke "cargo build failed, see $WORK/build.log (crates missing? run 'cargo fetch' once in the checkout)"
(cd "$WORK/src" && exec "$WORK/target/debug/antoinelaborderiedotcom") > "$WORK/server.log" 2>&1 &
SERVER=$!
i=0
until node -e 'require("net").connect(+process.argv[1],"127.0.0.1").on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))' "$PORT"; do
  i=$((i + 1)); [ $i -lt 50 ] || broke "the server did not listen on 127.0.0.1:$PORT, see $WORK/server.log"; sleep 0.2
done
node "$SKILL/probe.mjs" "http://127.0.0.1:$PORT/" "$SKILL/ScrollTracking.tla" > "$WORK/probe.log" 2>&1 || broke "probe.mjs crashed, see $WORK/probe.log"
kill "$SERVER"; SERVER=
cat "$WORK/probe.log"
grep -q "; answered: none$" "$WORK/probe.log" || broke "an off-site request got an answer during the probe, see $WORK/probe.log"

changed=
if grep -q '^MISMATCH ' "$WORK/probe.log"; then
  echo "CHANGED: MODEL OUT OF DATE, the real page no longer goes through the zones or options of ScrollTracking.tla"
  changed="$changed model-out-of-date"
fi
for id in $KNOWN_IDS; do
  grep -q "^$id REPRODUCED " "$WORK/probe.log" || { echo "CHANGED $id: the replay on the real page did not reproduce it (NOT REPRODUCED or NOT RUN above)"; changed="$changed $id-replay"; }
done

cp "$SKILL/ScrollTracking.tla" "$SKILL/stage.cfg" "$SKILL/scene.cfg" "$WORK/"
for cfg in stage:'C1 C2':'HighlightIsOnScreen HighlightNeverGoesBack' scene:'C3':'HighlightIsOnScreen'; do
  name=${cfg%%:*} rest=${cfg#*:}
  ids=${rest%%:*} expected=${rest#*:}
  (cd "$WORK" && timeout 300 "$JAVA" -XX:+UseParallelGC -Xmx2g -cp "$TLA2TOOLS" tlc2.TLC -workers 1 -continue \
     -metadir "$WORK/states-$name" -config "$name.cfg" ScrollTracking.tla > "$WORK/tlc-$name.out" 2>&1) || true
  grep -q 'Finished in' "$WORK/tlc-$name.out" || broke "TLC did not finish on $name.cfg, see $WORK/tlc-$name.out"
  broken=$(sed -n 's/^Error: Invariant \(.*\) is violated.*/\1/p' "$WORK/tlc-$name.out" | sort -u | tr '\n' ' ' | sed 's/ $//')
  states=$(grep -o '[0-9]* distinct states found' "$WORK/tlc-$name.out")
  if [ "$broken" = "$expected" ]; then
    echo "SAME    $name.cfg: breaks [ $broken ] = known findings $ids ($states)"
  else
    echo "CHANGED $name.cfg: breaks [ $broken ], known findings $ids break [ $expected ] ($states)"
    changed="$changed $name.cfg"
  fi
done

echo "work dir: $WORK"
[ -z "$changed" ] && finish "EXPECTED; known findings $KNOWN_IDS still reproduce (TLC and replay) and every other rule holds" 0
finish "CHANGED ($(echo $changed)); known findings are $KNOWN_IDS, read SKILL.md 'Read the result'" 1
