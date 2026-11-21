/* kth-efh-prelude.js — helper functions injected into every `kth-efh-eval.sh` call.
 *
 * Lives in its own file ON PURPOSE: embedding it in the shell script meant the JS could
 * not contain a single quote (it sits inside a '…' shell string), which silently broke
 * the two places that need a ['"] character class. Keep it here, `cat` it in.
 *
 * `myco nav eval` constraints these are written around (learned 2026-11-21):
 *   • no await — a promise serialises to {}, so every request is a SYNCHRONOUS XHR
 *   • a top-level `var` makes the eval return null, so callers wrap everything in a function
 *   • globals do not persist between calls, so this file is re-injected every time
 *
 * The invoice-form mechanics (dead CopyContainer clone, lookup fields, the load-bearing
 * LeaveDataListControl blur, never touching Konto) are documented in kth-efh-sakattest.js.
 */

var live = null;
(function () {
  function walk(d) {
    try {
      var w = d.defaultView;
      var stub = typeof w.__doPostBack === "function" &&
        /^function\s*\(\s*\)\s*\{\s*\}$/.test(String(w.__doPostBack).replace(/\s+/g, " ").trim());
      if (/ContentContainer\.aspx/.test(d.location.href) &&
          /menu_id=AP278/.test(d.location.href) && !stub && d.forms.length) live = d;
      [...d.querySelectorAll("iframe,frame")].forEach(function (f) {
        try { if (f.contentDocument) walk(f.contentDocument); } catch (e) {}
      });
    } catch (e) {}
  }
  walk(document);
})();

/* value of the first element whose id ENDS WITH the given suffix */
function g(suffix) {
  if (!live) return null;
  var e = live.querySelector("[id$=" + JSON.stringify(suffix) + "]");
  return e ? e.value : null;
}

function api(url) {
  var x = new XMLHttpRequest();
  x.open("GET", url, false);
  x.setRequestHeader("Accept", "application/json");
  x.send();
  return x.responseText;
}

/* the EI02 / PEPPOL invoice document as readable plain text */
function docText(uuid) {
  var t = api("/agrprod/api/documents/UF/EI02/" + uuid +
              "/1/1/1?_parentAccessId=AP278&_accessId=CR398");
  var d = document.implementation.createHTMLDocument("");
  d.body.innerHTML = t.replace(/<style[\s\S]*?<\/style>/gi, "");
  return d.body.innerText.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n");
}

/* the uuid of whichever invoice document the UI currently has loaded */
function currentDocUuid() {
  var out = [];
  function walk(d) {
    try {
      out.push(d.location.href);
      [...d.querySelectorAll("iframe,frame")].forEach(function (f) {
        try { if (f.contentDocument) walk(f.contentDocument); } catch (e) {}
      });
    } catch (e) {}
  }
  walk(document);
  var u = out.filter(function (h) { return /api\/documents\/UF\/EI02\//.test(h); }).pop();
  return u ? u.split("/EI02/")[1].split("/")[0] : null;
}

function openTaskList() {
  var b = document.querySelector("div.u4-applicationtool-tasks a.x-btn");
  if (!b) return "bell not found";
  b.click();
  return "bell clicked";
}

function openQueue() {
  var e = [...document.querySelectorAll("div,td,span,a")]
    .filter(function (x) { return /^Sakattestera \(\d+\)$/.test((x.innerText || "").trim()); });
  if (!e.length) return "queue row not found";
  var t = e[e.length - 1];
  t.click();
  var p = t;
  for (var i = 0; i < 3; i++) { p = p.parentElement; if (p) p.click(); }
  return "opened " + t.innerText.trim();
}

function pickInvoice(vernr) {
  if (!live) return "no live frame";
  var e = [...live.querySelectorAll("div.HeaderValue")]
    .filter(function (x) { return x.textContent.trim() === String(vernr); })[0];
  if (!e) return "vernr not in queue";
  e.closest("tr").click();
  return "clicked " + vernr;
}

/* the queue, as rows — the header pane repeats 6 values per invoice */
function invoiceList() {
  if (!live) return [];
  var v = [...live.querySelectorAll("div.HeaderValue")].map(function (x) { return x.textContent.trim(); });
  var out = [];
  for (var i = 0; i + 5 < v.length; i += 6)
    out.push({ supplier: v[i], amount: v[i + 1], cur: v[i + 2], due: v[i + 3], invNo: v[i + 4], vernr: v[i + 5] });
  return out;
}

/* which invoice is on screen, and what the coding row currently says */
function state() {
  if (!live) return { err: "no live frame" };
  var t = live.body.innerText, di = t.indexOf("Detaljer");
  var m = t.match(/Fakturanummer\s*\n([^\n]+)[\s\S]*?Verifikationsnummer\s*\n([^\n]+)[\s\S]*?Ska godk.nnas\s*\n([^\n]+)/);
  return {
    invNo: m && m[1].trim(), vernr: m && m[2].trim(), toApprove: m && m[3].trim(),
    error: (t.match(/Korrigera f.jande:[\s\S]{0,160}/) || [""])[0].replace(/\s+/g, " ").trim(),
    konto: g("_123_RowValue"),
    proj: g("_276_RowValue"), projDesc: g("_276_RowDescription"),
    orgLooksRight: /SKEG/.test(t.slice(di, di + 320)),
    comment: g("wf_comment_i")
  };
}

/* valid values for a dimension. 123=Konto 276=Proj 281=Dim7 282=Momskod */
function dimSearchSync(fieldId, term) {
  if (!live) return "no live frame";
  var ctl = live.getElementById("b_s66_g149s6_row0_" + fieldId + "_Control");
  if (!ctl) return "no control " + fieldId;
  var ctx = ctl.attributes.getNamedItem("context").value;   // GUID rotates — re-read each call
  var base = live.location.href.split("/agrprod/")[0] + "/agrprod";
  var x = new XMLHttpRequest();
  x.open("POST", base + "/System/Services/DataListService.aspx", false);
  x.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
  x.send("Search=" + encodeURIComponent(term) + "&Context=" + encodeURIComponent(ctx) +
         "&BatchStart=1&BatchSize=50");
  var dec = function (s) {
    return s.replace(/&amp;#(\d+);/g, function (m, c) { return String.fromCharCode(+c); })
            .replace(/&amp;/g, "&");
  };
  return [...x.responseText.matchAll(/<item><value>([^<]*)<\/value><descr>([^<]*)<\/descr><\/item>/g)]
    .map(function (m) { return { v: m[1], d: dec(m[2]) }; });
}

/* select a value the way a human does: pick from the list, force dirty, then blur */
function setDim(fieldId, value, descr) {
  if (!live) return "no live frame";
  var w = live.defaultView;
  var el = live.getElementById("b_s66_g149s6_row0_" + fieldId + "_Editor");
  if (!el) return "no editor " + fieldId;
  var o = w.FindDataListObject(el.id);
  el.focus();
  o.Popup.SetEditorValues(value, descr);
  live.getElementById("b_s66_g149s6_row0_" + fieldId + "_IsDirty").value = "true";
  try { w.LeaveDataListControl(null, el); } catch (e) {}   // the blur recomputes Org
  return "set " + fieldId + "=" + value + " + blur (wait ~15s for the postback)";
}

function setComment(text) {
  if (!live) return "no live frame";
  var c = live.getElementById("b_s66_s190_s170_s39_l170s39_ctl00_wf_comment_i");
  if (!c) return "no comment box";
  c.value = text;
  var d = live.getElementById("b_s66_s190_s170_s39_l170s39_ctl00_wf_comment_IsDirty");
  if (d) d.value = "true";
  return c.value;
}

/* NEVER call without a user-confirmed comment AND explicit per-invoice consent */
function sakattestera() {
  if (!live) return "no live frame";
  var w = live.defaultView;
  var b = [...live.querySelectorAll("a")]
    .filter(function (a) { return /^Sakattestera$/.test((a.textContent || "").trim()); })[0];
  if (!b) return "button not found";
  var m = (b.getAttribute("onclick") || "")
    .match(/checkFocusAndDoPostBack\(event,\s*['"]([^'"]+)['"]/);
  if (!m) return "no postback id";
  w.__doPostBack(m[1], "");
  return "attest fired " + m[1];
}

/* authoritative pending counts — the header badge goes stale */
function taskCounts() {
  return JSON.parse(api("/agrprod/api/tasknotifications/UF/WEIO?page=1&start=0&limit=25"))
    .map(function (x) { return { step: x.step, count: x.count }; });
}
