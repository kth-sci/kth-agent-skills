#!/usr/bin/env bash
# kth-efh-attest.sh — code and Sakattestera ONE EFH invoice, end to end, in one run.
#
#   kth-efh-attest.sh <page-id> <vernr> <proj> <proj-description> <comment> [--stage-only]
#
# --stage-only sets Proj + comment and STOPS before the attest click.
#
# ⚠ CONSENT: the final click is only legitimate with the user's explicit, per-invoice
# consent given in the same session, on a comment they have confirmed. This script does
# not and cannot check that — the caller must have it. See CLAUDE.md and skills/kth-efh.
#
# WHY ONE SCRIPT INSTEAD OF SEPARATE STEPS (2026-11-21)
# ----------------------------------------------------
# The Unit4 app session expires after a few minutes idle, and it expires by COLLAPSING
# EVERY FRAME TO Logout.aspx — so a half-finished invoice is simply gone, and `state()`
# starts answering "no live frame". Running login → open queue → pick → setDim → verify →
# comment → attest as one uninterrupted process is what keeps the whole sequence inside
# the window. Doing it as a series of agent tool calls lost the session twice.
#
# The ADFS/SAML cookie outlives the app session, so the relogin here is usually silent
# (no MFA at all) — it is cheap, always do it rather than assuming the session is alive.
#
# Mechanics (read bin/kth-efh-sakattest.js before touching any of this):
#   * only Proj (field 276) is changed; Konto stays 5000 — changing it reverts AND breaks
#     the Org derivation
#   * setDim does select → force dirty → LeaveDataListControl; that BLUR is what makes the
#     server recompute Org VAX LEVSKULD EFH → SKEG, and the attest is refused without it
#   * the postback after the blur takes ~15 s, hence the generous waits + retry below
set -uo pipefail

PAGE="${1:?usage: kth-efh-attest.sh <page-id> <vernr> <proj> <proj-descr> <comment> [--stage-only]}"
VERNR="${2:?missing vernr}"
PROJ="${3:?missing proj}"
PROJD="${4:?missing proj description}"
COMMENT="${5:?missing comment}"
STAGE_ONLY="${6:-}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EV="$HERE/kth-efh-eval.sh"
LOGIN="$HERE/kth-mfa-login.sh"
EFH_URL="https://agrprodweb01.ug.kth.se/agrprod/"

say() { printf '  %s\n' "$*" >&2; }
j()   { python3 -I -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }
ev()  { "$EV" "$PAGE" "$1" 2>/dev/null | sed -n 's/^  "value": //p'; }

# ---- 0. is the app session alive? -------------------------------------------
HOST_PATH=$(myco nav eval "$PAGE" 'location.pathname' 2>/dev/null | sed -n 's/^  "value": //p')
case "$HOST_PATH" in
  *Logout*|'""'|'null'|'')
    say "app session gone ($HOST_PATH) — relogging in"
    "$LOGIN" "$EFH_URL" "$PAGE" >/dev/null 2>&1 || { say "relogin failed"; exit 1; }
    sleep 3 ;;
esac

# ---- 1. open the Sakattestera queue ----------------------------------------
if [ "$(ev 'live ? "yes" : "no"')" != '"yes"' ]; then
  say "$(ev 'openTaskList()')"
  sleep 5
  say "$(ev 'openQueue()')"
  sleep 10
fi
[ "$(ev 'live ? "yes" : "no"')" = '"yes"' ] || { say "no live frame after opening queue"; exit 1; }

# ---- 2. select the invoice and confirm it is really the one -----------------
say "$(ev "pickInvoice(\"$VERNR\")")"
sleep 9
ST=$(ev 'state()')
echo "$ST" | grep -q "\\\\\"vernr\\\\\":\\\\\"$VERNR\\\\\"" || {
  say "wrong invoice loaded, aborting. state=$ST"; exit 1; }
say "loaded $VERNR; before: $ST"

# ---- 3. set Proj (select + dirty + blur), then wait for the postback --------
say "$(ev "setDim(\"276\",\"$PROJ\",$(j "$PROJD"))")"
OK=0
for i in $(seq 1 8); do
  sleep 5
  ST=$(ev 'state()')
  if echo "$ST" | grep -q "\\\\\"proj\\\\\":\\\\\"$PROJ\\\\\"" \
     && echo "$ST" | grep -q 'orgLooksRight\\":true'; then OK=1; break; fi
done
[ "$OK" = 1 ] || { say "Proj/Org did not settle, NOT attesting. state=$ST"; exit 1; }
echo "$ST" | grep -q 'error\\":\\"\\"' || { say "server complained, NOT attesting. state=$ST"; exit 1; }
say "Proj=$PROJ set and Org recomputed to SKEG"

# ---- 4. comment -------------------------------------------------------------
ev "setComment($(j "$COMMENT"))" >/dev/null
ST=$(ev 'state()')
echo "$ST" | grep -q 'comment\\":\\"\\"' && { say "comment did not stick, NOT attesting"; exit 1; }
say "comment set"

if [ "$STAGE_ONLY" = "--stage-only" ]; then
  say "--stage-only: stopping before the attest click"
  echo "$ST"
  exit 0
fi

# ---- 5. attest, then verify against the authoritative count ----------------
BEFORE=$(ev 'taskCounts()')
say "counts before: $BEFORE"
say "$(ev 'sakattestera()')"
sleep 12
AFTER=$(ev 'taskCounts()')
say "counts after:  $AFTER"
echo "$AFTER"
