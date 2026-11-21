#!/usr/bin/env bash
# kth-efh-eval.sh — run a snippet against the LIVE EFH Sakattestera form via `myco nav`.
#
#   kth-efh-eval.sh <page-id> '<javascript expression>'
#
# Helpers available to the snippet are defined in kth-efh-prelude.js (same directory) —
# read that file for the list and for the `myco nav eval` constraints they work around.
# Quick reference:
#
#   live  g("_276_RowValue")  api(url)  docText(uuid)  currentDocUuid()
#   openTaskList()  openQueue()  pickInvoice(vernr)  invoiceList()
#   state()  dimSearchSync(fieldId, term)  setDim(id, v, d)  setComment(text)
#   sakattestera()      <- never without user-confirmed comment + per-invoice consent
#   taskCounts()
#
# Example:
#   kth-efh-eval.sh p123 'state()'
#   kth-efh-eval.sh p123 'dimSearchSync("276","ddls")'
set -uo pipefail

PAGE="${1:?usage: kth-efh-eval.sh <page-id> '<js expression>'}"
EXPR="${2:?usage: kth-efh-eval.sh <page-id> '<js expression>'}"

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRELUDE_FILE="$HERE/kth-efh-prelude.js"
[ -r "$PRELUDE_FILE" ] || { echo "missing $PRELUDE_FILE" >&2; exit 1; }

SCRIPT_FILE="$(mktemp -t kth-efh-eval.XXXXXX.js)"
trap 'rm -f "$SCRIPT_FILE"' EXIT

{
  printf '(function(){\n'
  cat "$PRELUDE_FILE"
  printf '\nvar __r = (%s);\n' "$EXPR"
  printf 'return (typeof __r === "string") ? __r : JSON.stringify(__r);\n})()\n'
} > "$SCRIPT_FILE"

myco nav eval "$PAGE" "@$SCRIPT_FILE"
