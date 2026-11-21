#!/usr/bin/env bash
# kth-mfa-login.sh — drive a `myco nav` browser page through KTH ADFS MFA to a target URL.
#
#   kth-mfa-login.sh <target-url> [page-id]
#
# Prints the final host and, on success, the page id on the last line as `PAGE=<id>`.
#
# WHY THIS EXISTS (2026-11-21)
# ---------------------------
# `kth-login` only recognises wisum.its.umu.se as "landed", and `kthmfa-approve <digits>`
# reports "digits typed, YES tapped" while the Authenticator field stays EMPTY — it looked
# like a successful approval three times in a row while the login page timed out with
# "We didn't receive a response". This script verifies the dump instead of trusting a verdict.
#
# Hard-won details:
#   * NEVER `adb shell input keyevent 4` to clear a stale dialog — it sends Authenticator to
#     the home screen and then the push dialog never renders at all. Use `am start` to
#     foreground the app instead.
#   * The whole read-digits → type → YES sequence must finish inside the ~60 s challenge
#     window, so it is one unbroken run here, not separate agent tool calls.
#   * Verify `text="<digits>"` on auth_enter_correct_num_text_input AND positiveButton
#     enabled="true" BEFORE tapping YES. That is the only real evidence the tap will count.
#   * Tap targets on the 1080x2400 kthpixel AVD: number field (542,898), YES (881,1045).
#     Re-measure from the dump if a future app version moves them.
set -uo pipefail

TARGET="${1:?usage: kth-mfa-login.sh <target-url> [page-id]}"
PAGE="${2:-}"

SDK="${ANDROID_SDK_ROOT:-/usr/local/share/android-commandlinetools}"
ADB="$SDK/platform-tools/adb"
FIELD_TAP="542 898"
YES_TAP="881 1045"

say() { printf '  %s\n' "$*" >&2; }

ev() { myco nav eval "$PAGE" "$1" 2>/dev/null | sed -n 's/^  "value": //p'; }

page_text() { ev 'document.body.innerText'; }
page_host() { ev 'location.host' | tr -d '"'; }

# ---- 1. make sure we have a page pointed at the target -----------------------
if [ -z "$PAGE" ]; then
  PAGE=$(myco nav open "$TARGET" --background --id 2>/dev/null | tr -d '[:space:]')
  say "opened page $PAGE"
else
  myco nav goto "$PAGE" "$TARGET" >/dev/null 2>&1
  say "navigated page $PAGE"
fi
[ -n "$PAGE" ] || { say "could not get a page id"; exit 1; }

# ---- 2. foreground Authenticator so the push dialog can render ---------------
"$ADB" shell am start -n com.azure.authenticator/.ui.LaunchActivity >/dev/null 2>&1
sleep 3

# ---- 3. wait for either the landing host or an MFA number --------------------
DIG=""
TARGET_HOST=$(printf '%s' "$TARGET" | sed -E 's#^https?://([^/]+).*#\1#')
for _ in $(seq 1 20); do
  sleep 2
  H=$(page_host)
  case "$H" in
    "$TARGET_HOST") say "already landed on $H"; echo "PAGE=$PAGE"; exit 0 ;;
  esac
  DIG=$(page_text | grep -oE 'sign in\.[^0-9]*([0-9]{2,3})' | grep -oE '[0-9]{2,3}$' | head -1)
  [ -n "$DIG" ] && break
done

if [ -z "$DIG" ]; then
  say "no MFA number appeared; page host is $(page_host)"
  say "page says: $(page_text | tr '\n' ' ' | cut -c1-200)"
  exit 1
fi
say "challenge number: $DIG"

# ---- 4. wait for the dialog, type, VERIFY, then tap YES ----------------------
GOT=0
for i in $(seq 1 25); do
  "$ADB" shell uiautomator dump /sdcard/mfa.xml >/dev/null 2>&1
  if "$ADB" shell cat /sdcard/mfa.xml 2>/dev/null | grep -q auth_enter_correct_num_text_input; then GOT=1; break; fi
  sleep 1
done
[ "$GOT" = 1 ] || { say "approval dialog never rendered in Authenticator"; exit 1; }

"$ADB" shell input tap $FIELD_TAP; sleep 1
"$ADB" shell input text "$DIG"; sleep 1
"$ADB" shell uiautomator dump /sdcard/mfa2.xml >/dev/null 2>&1
STATE=$("$ADB" shell cat /sdcard/mfa2.xml 2>/dev/null | tr '<' '\n<' \
        | grep -E 'auth_enter_correct_num_text_input"|positiveButton')
echo "$STATE" | grep -q "text=\"$DIG\"" \
  || { say "field did not take the digits — refusing to tap YES"; exit 1; }
echo "$STATE" | grep positiveButton | grep -q 'enabled="true"' \
  || { say "YES button still disabled — refusing to tap"; exit 1; }
say "field shows $DIG and YES is enabled — tapping"
"$ADB" shell input tap $YES_TAP

# ---- 5. confirm we actually landed (never trust the tap alone) ---------------
for _ in $(seq 1 15); do
  sleep 3
  H=$(page_host)
  case "$H" in
    "$TARGET_HOST") say "landed on $H"; echo "PAGE=$PAGE"; exit 0 ;;
  esac
done
say "did not land; host is $(page_host): $(page_text | tr '\n' ' ' | cut -c1-200)"
exit 1
