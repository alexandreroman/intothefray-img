#!/usr/bin/env bash
# Checks that img.intothefray.xyz serves a key with the immutable
# Cache-Control and that Cloudflare caches it at the edge: two GETs, the
# second must be a cache HIT.
#
# Usage: scripts/verify-cdn.sh [key] [manifest]
# Without a key, the first face key of the manifest is used, else
# assets/back-player.avif.
set -euo pipefail

readonly BASE_URL="https://img.intothefray.xyz"
readonly EXPECTED_CACHE_CONTROL="public, max-age=31536000, immutable"

key="${1:-}"
manifest="${2:-}"

if [[ -z "$key" && -f "$manifest" ]]; then
  key="$(node -e '
    const manifest = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    const face = Object.values(manifest.faces ?? {})[0];
    console.log(face?.en?.key ?? face?.fr?.key ?? "");
  ' "$manifest")"
fi
key="${key:-assets/back-player.avif}"
url="$BASE_URL/$key"

# Prints the value of a header (case-insensitive name) from the headers in $headers.
header() {
  grep -i "^$1:" <<<"$headers" | head -n 1 | cut -d ' ' -f 2- || true
}

echo "$url"
for attempt in 1 2; do
  headers="$(curl --silent --show-error --output /dev/null --dump-header - "$url" | tr -d '\r')"
  status="$(head -n 1 <<<"$headers" | cut -d ' ' -f 2)"
  content_type="$(header content-type)"
  cache_control="$(header cache-control)"
  cf_cache_status="$(header cf-cache-status)"
  echo "GET $attempt: status $status, content-type: $content_type," \
    "cache-control: $cache_control, cf-cache-status: $cf_cache_status"
done

failed=0
if [[ "$status" != "200" ]]; then
  echo "error: status $status, expected 200" >&2
  failed=1
fi
if [[ "$cache_control" != "$EXPECTED_CACHE_CONTROL" ]]; then
  echo "error: cache-control is \"$cache_control\", expected \"$EXPECTED_CACHE_CONTROL\"" >&2
  failed=1
fi
if [[ "$cf_cache_status" != "HIT" ]]; then
  echo "error: second answer is cf-cache-status \"$cf_cache_status\", expected HIT" \
    "(see README, Cloudflare setup, Caching)" >&2
  failed=1
fi
exit "$failed"
