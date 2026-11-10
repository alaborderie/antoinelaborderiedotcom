#!/bin/sh
# verify-asset-rollout: read the model constants from the real router of this checkout, run TLC on
# AssetRollout.tla, replay the known paths on two real builds in Chromium, compare with known findings A1 and A2.
# Usage: .claude/skills/verify-asset-rollout/check.sh   (no argument; run from anywhere inside the checkout)
# Env: JAVA, TLA2TOOLS, PW_CORE, CHROME (see SKILL.md "Tools"); BASE = the release now live
#      (default: merge-base of HEAD and origin/main).
# Exit: 0 expected (A1 A2 reproduce, every other rule holds), 1 changed, 2 tooling missing, 3 check could not run.
# Copies the working tree (tracked and untracked files, no ignored files, no .env) to a temporary directory
# and builds there. Writes nothing into the checkout.
set -eu
SKILL=$(cd "$(dirname "$0")" && pwd)
ROOT=$(git -C "$SKILL" rev-parse --show-toplevel)
KNOWN_IDS="none"

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
BASE=${BASE:-$(git -C "$ROOT" merge-base HEAD origin/main 2>/dev/null || git -C "$ROOT" rev-parse HEAD)}
git -C "$ROOT" rev-parse --verify --quiet "$BASE^{commit}" >/dev/null || broke "unknown BASE revision $BASE"

WORK=$(mktemp -d "${TMPDIR:-/tmp}/verify-asset-rollout.XXXXXX")
PIDS=
trap 'for p in $PIDS; do kill "$p" 2>/dev/null || true; done; rm -rf "$WORK/target"' EXIT
mkdir -p "$WORK/src"
git -C "$ROOT" ls-files -z --cached --others --exclude-standard -- ':(exclude).env*' ':(exclude)*/.env*' \
  | (cd "$ROOT" && tar --null --ignore-failed-read -T - -cf -) | tar -xf - -C "$WORK/src"
echo "checking the working tree of $ROOT (HEAD $(git -C "$ROOT" rev-parse --short HEAD), live release BASE $(git -C "$ROOT" rev-parse --short "$BASE")) in $WORK"

# 1. Code facts from the real router (a test module appended to the copy's main.rs).
cp "$SKILL/asset_facts.rs" "$WORK/src/src/asset_facts.rs"
printf '\n#[cfg(test)]\n#[path = "asset_facts.rs"]\nmod asset_facts;\n' >> "$WORK/src/src/main.rs"
(cd "$WORK/src" && CARGO_TARGET_DIR="$WORK/target" cargo test --offline --quiet -j 2 asset_facts -- --nocapture > "$WORK/facts.log" 2>&1) \
  || broke "cargo test of asset_facts.rs failed, see $WORK/facts.log (crates missing? run 'cargo fetch' once in the checkout)"
grep '^FACT ' "$WORK/facts.log" | tee "$WORK/facts.txt"
fact() { sed -n "s/^FACT $1=//p" "$WORK/facts.txt"; }
[ -n "$(fact asset_version)" ] || broke "the fact probe printed nothing, see $WORK/facts.log"

version_in() { sed -n 's/^const ASSET_VERSION: &str = "\(.*\)";/\1/p'; }
assets='static/styles.css static/main.js static/og-image.png'
if git -C "$ROOT" diff --quiet "$BASE" -- $assets; then
  echo "NOTE assets unchanged since BASE: the model checks the next asset release, made as documented"
  bumped=$(fact links_versioned)
elif [ "$(git -C "$ROOT" show "$BASE:src/main.rs" | version_in)" != "$(version_in < "$WORK/src/src/main.rs")" ]; then
  bumped=$(fact links_versioned)
else
  echo "NOTE assets changed since BASE but ASSET_VERSION did not"
  bumped=false
fi
up() { echo "$1" | tr a-z A-Z; }

# 2. TLC on both configs.
cp "$SKILL/AssetRollout.tla" "$WORK/"
changed=
for cfg in deploy-as-is:TRUE:none:'' cutover:FALSE:none:''; do
  name=${cfg%%:*} rest=${cfg#*:}
  overlap=${rest%%:*} rest=${rest#*:}
  id=${rest%%:*} expected=${rest#*:}
  cat > "$WORK/$name.cfg" <<CFG
CONSTANTS
    InlineAssets = $(up "$(fact inline_assets)")
    Overlap = $overlap
    Bumped = $(up "$bumped")
    ServerChecksVersion = $(up "$(fact server_checks_version)")
SPECIFICATION Spec
INVARIANTS
    TypeOK
    PageMatchesItsCss
    NewLinkNeverHoldsOldCss
    CssLinkNeverFails
CFG
  (cd "$WORK" && timeout 300 "$JAVA" -XX:+UseParallelGC -Xmx2g -cp "$TLA2TOOLS" tlc2.TLC -workers 1 -continue \
     -metadir "$WORK/states-$name" -config "$name.cfg" AssetRollout.tla > "$WORK/tlc-$name.out" 2>&1) || true
  grep -q 'Finished in' "$WORK/tlc-$name.out" || broke "TLC did not finish on $name.cfg, see $WORK/tlc-$name.out"
  broken=$(sed -n 's/^Error: Invariant \(.*\) is violated.*/\1/p' "$WORK/tlc-$name.out" | sort -u | tr '\n' ' ' | sed 's/ $//')
  states=$(grep -o '[0-9]* distinct states found' "$WORK/tlc-$name.out")
  if [ "$broken" = "$expected" ]; then
    echo "SAME    $name.cfg: breaks [ $broken ] = known finding $id ($states)"
  else
    echo "CHANGED $name.cfg: breaks [ $broken ], known finding $id breaks [ $expected ] ($states)"
    changed="$changed $name.cfg"
  fi
done

# 3. Replay A1 and A2 on two real builds: release 1 = this checkout, release 2 = the same code with
#    ASSET_VERSION bumped. Both are built in turn from the one copy: a second copy would reuse the first
#    binary, because cargo keys its fingerprint on the first copy's paths. Each pod binds 127.0.0.1 and
#    serves its own static/, whose styles.css is marked with --release.
n=$(grep -c 'TcpListener::bind("0.0.0.0:3000")' "$WORK/src/src/main.rs" || true)
[ "$n" = 1 ] || broke "the bind line was not found once in src/main.rs; update check.sh"
V1=$(fact asset_version) V2="$(fact asset_version)-replay"
# Three distinct free ports below the kernel's ephemeral range, so no outgoing connection takes one meanwhile.
set -- $(node -e '
const net = require("net"), held = [];
const take = () => { const port = 20000 + Math.floor(Math.random() * 12000); const s = net.createServer();
  s.once("error", take).listen(port, "127.0.0.1", () => { held.push(s); held.length < 3 ? take() : (console.log(held.map((h) => h.address().port).join(" ")), held.forEach((h) => h.close())); }); };
take();')
P1=$1 P2=$2 PROXY=$3
sed -i "s/TcpListener::bind(\"0.0.0.0:3000\")/TcpListener::bind(\"127.0.0.1:$P1\")/" "$WORK/src/src/main.rs"
for r in 1 2; do
  [ $r = 1 ] || sed -i "s/127.0.0.1:$P1/127.0.0.1:$P2/; s/^const ASSET_VERSION: &str = \".*\";/const ASSET_VERSION: \&str = \"$V2\";/" "$WORK/src/src/main.rs"
  printf '\n:root { --release: "%s"; }\n' "$r" >> "$WORK/src/static/styles.css"
  printf '\nwindow.__assetRelease = "%s";\n' "$r" >> "$WORK/src/static/main.js"
  (cd "$WORK/src" && CARGO_TARGET_DIR="$WORK/target" cargo build --offline --quiet -j 2 > "$WORK/build$r.log" 2>&1) \
    || broke "cargo build of release $r failed, see $WORK/build$r.log"
  mkdir -p "$WORK/rel$r"
  cp "$WORK/target/debug/antoinelaborderiedotcom" "$WORK/rel$r/pod"
  cp -R "$WORK/src/static" "$WORK/rel$r/static"

done
(cd "$WORK/rel1" && exec ./pod) > "$WORK/pod1.log" 2>&1 & PIDS="$PIDS $!"
(cd "$WORK/rel2" && exec ./pod) > "$WORK/pod2.log" 2>&1 & PIDS="$PIDS $!"
for p in $P1 $P2; do
  i=0
  until node -e 'require("net").connect(+process.argv[1],"127.0.0.1").on("connect",()=>process.exit(0)).on("error",()=>process.exit(1))' "$p"; do
    i=$((i + 1)); [ $i -lt 50 ] || broke "a pod did not listen on 127.0.0.1:$p, see $WORK/pod*.log"; sleep 0.2
  done
done
V1=$V1 V2=$V2 node "$SKILL/replay.mjs" "$P1" "$P2" "$PROXY" > "$WORK/replay.log" 2>&1 || broke "replay.mjs crashed, see $WORK/replay.log"
cat "$WORK/replay.log"
grep -q "; answered: none$" "$WORK/replay.log" || broke "an off-site request got an answer during the replay, see $WORK/replay.log"
for id in A1 A2; do
  grep -q "^$id FIXED" "$WORK/replay.log" || { echo "CHANGED $id: the fixed behavior was not verified on the real builds"; changed="$changed $id-replay"; }
done

echo "work dir: $WORK"
[ -z "$changed" ] && finish "EXPECTED; known findings $KNOWN_IDS; all rules hold (TLC and replay)" 0
finish "CHANGED ($(echo $changed)); known findings are $KNOWN_IDS, read SKILL.md 'Read the result'" 1
