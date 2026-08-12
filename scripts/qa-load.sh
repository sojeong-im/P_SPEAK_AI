#!/usr/bin/env bash
# Concurrent load test against the deployed pronunciation evaluate endpoint.
# Usage:
#   N=10 BASE=https://speakup-test.vercel.app WAV=/tmp/speakup-test.wav ./scripts/qa-load.sh
set -uo pipefail

BASE="${BASE:-https://speakup-test.vercel.app}"
N="${N:-10}"
WAV="${WAV:-/tmp/speakup-test.wav}"
REF_TEXT="${REF_TEXT:-간장공장 공장장은 강 공장장이고 된장공장 공장장은 공 공장장이다}"
CORE="${CORE:-sent.eval.promax}"

if [[ ! -f "$WAV" ]]; then
  echo "wav not found at $WAV. Generate one with:" >&2
  echo "  say -v Yuna \"$REF_TEXT\" -o /tmp/x.aiff && ffmpeg -y -i /tmp/x.aiff -ac 1 -ar 16000 -sample_fmt s16 $WAV" >&2
  exit 1
fi

OUT_DIR="$(mktemp -d -t qa-load-XXXX)"
echo "Firing $N parallel requests to $BASE/api/pronunciation/evaluate"
echo "Output: $OUT_DIR"
echo ""

# pre-warm health check
echo "[health] $(curl -s "$BASE/api/pronunciation/evaluate")"
echo ""

START_EPOCH=$(date +%s)
for i in $(seq 1 "$N"); do
  (
    T0=$(date +%s.%N)
    HTTP=$(curl -s -o "$OUT_DIR/r$i.json" -w "%{http_code}" -X POST \
      "$BASE/api/pronunciation/evaluate" \
      -F "audio=@$WAV;type=audio/wav" \
      -F "refText=$REF_TEXT" \
      -F "coreType=$CORE" \
      -F "audioType=wav" \
      -F "sampleRate=16000" \
      -F "userId=qa-$i")
    T1=$(date +%s.%N)
    ELAPSED=$(awk "BEGIN {printf \"%.2f\", $T1 - $T0}")
    echo "$i,$HTTP,$ELAPSED" >> "$OUT_DIR/_summary.csv"
  ) &
done
wait
END_EPOCH=$(date +%s)
WALL=$((END_EPOCH - START_EPOCH))

echo ""
echo "── Per-request results ─────────────────────────"
sort -t, -k1 -n "$OUT_DIR/_summary.csv" | awk -F, '{printf "  #%-3s  HTTP=%s  %ss\n", $1, $2, $3}'

echo ""
echo "── Aggregate ───────────────────────────────────"
# External sort by latency (col 3) — macOS BSD awk has no asort()
SORTED=$(sort -t, -k3,3n "$OUT_DIR/_summary.csv")
echo "$SORTED" | awk -F, -v wall="$WALL" '
  { codes[$2]++; n++; total+=$3; lat[NR]=$3+0 }
  END {
    p50_idx = (n>1) ? int(n*0.5+0.5) : 1
    p95_idx = (n>1) ? int(n*0.95+0.5) : 1
    if (p50_idx<1) p50_idx=1; if (p50_idx>n) p50_idx=n
    if (p95_idx<1) p95_idx=1; if (p95_idx>n) p95_idx=n
    printf "  total=%d  wall=%ds  avg=%.2fs  p50=%.2fs  p95=%.2fs\n", n, wall, (n>0?total/n:0), lat[p50_idx], lat[p95_idx]
    for (c in codes) printf "  HTTP %s: %d\n", c, codes[c]
  }'

echo ""
echo "── Sample bodies ───────────────────────────────"
for f in "$OUT_DIR"/r1.json "$OUT_DIR"/r$N.json; do
  [[ -f "$f" ]] || continue
  echo "--- $f"
  head -c 600 "$f"
  echo ""
done

echo ""
echo "── Final queue depth ───────────────────────────"
curl -s "$BASE/api/pronunciation/evaluate" | head -c 200
echo ""
