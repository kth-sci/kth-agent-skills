/* kth-efh-sakattest.js — browser-side helpers for KTH EFH "Sakattestera".
 *
 * Run these with:  myco nav eval <page> @<file>
 * (or paste into DevTools on the EFH tab)
 *
 * WHY THIS EXISTS
 * ---------------
 * Unit4 EFH renders the invoice form TWICE:
 *   ContentContainer.aspx  → the LIVE, interactive form           ← drive this
 *   CopyContainer.aspx     → a visual CLONE for the display pane  ← looks identical, is DEAD
 * `System/Scripts/copyContainer.js` deliberately replaces these with empty functions in the
 * clone: __doPostBack, setDirty, PostBack, HighlightTextBox, ResetTextBox,
 * checkFocusAndDoPostBack, trapEnter, postBackOnEnter …
 * So in the clone every postback silently does NOTHING and no field can be marked dirty.
 * Always resolve the frame with liveFrame() below — never "the first doc that has the field id".
 *
 * THE FIELD IS A LOOKUP, NOT A TEXT BOX
 * -------------------------------------
 * <datalistcontrol> + hidden _RowValue/_RowDescription carry the real value; the visible
 * _Editor is cosmetic. Typing text alone is discarded by the server.
 * Backend search API (seen in ServersideLookup, and in the browser's network tab):
 *   POST /agrprod/System/Services/DataListService.aspx
 *   Search=<term>&Context=<base64>&BatchStart=1&BatchSize=50
 *   → <list><item><value>89256</value><descr>KAW DDLS fellows Wei(…)</descr></item>…</list>
 *   Context = the <datalistcontrol context="…"> attribute (base64:
 *   "TFI004^<activity-guid>^AP278^UF^<fieldId>^n"). The GUID rotates — re-read it every time.
 *
 * THE SEQUENCE THAT ACTUALLY COMMITS  (matches what a human does)
 * ---------------------------------------------------------------
 *   1. pick the value from the list      → Popup.SetEditorValues(value, description)
 *   2. force the dirty flag              → _IsDirty.value = "true"
 *   3. CLICK OUTSIDE (this is the key!)  → LeaveDataListControl(null, editorEl)
 *        ⇒ server recomputes Org/dim_1: VAX LEVSKULD EFH → SKEG Biofysik Ouyang
 *   4. comment + its _IsDirty = "true"
 *   5. __doPostBack(<Sakattestera button id>, "")
 *
 * PITFALLS (each one cost hours)
 *   • NEVER change Konto. The server reverts it AND it breaks the Org derivation, producing
 *     "Korrigera följande: Org: Värdet för fältet dim_1 = 'SKEG' är fast."
 *   • NEVER call CheckIfControlIsDirty() first — it re-evaluates and CLEARS IsDirty (because
 *     SetEditorValues already synced Editor↔RowValue), so the server discards the change.
 *   • PostBack(base) alone sets the value but does NOT recompute Org. Use LeaveDataListControl.
 *   • The Sakattestera button id is not stable (b$tbl_headbutt_10 / _11 …) — find it by text.
 *   • Org/dim_1 has NO input in the DOM. It is derived. Don't go looking for it.
 *
 * Field ids on the coding row: 123=Konto, 276=Proj, 281=Dim 7, 282=Momskod
 */

/* ---- resolve the LIVE frame (not the stubbed clone) ---------------------- */
function liveFrame(root) {
  let live = null;
  const walk = d => {
    try {
      const w = d.defaultView;
      const isStub = typeof w.__doPostBack === "function" &&
        /^function\s*\(\s*\)\s*\{\s*\}$/.test(String(w.__doPostBack).replace(/\s+/g, " ").trim());
      if (/ContentContainer\.aspx/.test(d.location.href) &&
          /menu_id=AP278/.test(d.location.href) &&
          isStub === false && d.forms.length) live = d;
      [...d.querySelectorAll("iframe,frame")].forEach(f => {
        try { if (f.contentDocument) walk(f.contentDocument); } catch (e) {}
      });
    } catch (e) {}
  };
  walk(root || document);
  return live;
}

/* ---- which invoice is on screen ----------------------------------------- */
function currentInvoice() {
  const live = liveFrame(); if (!live) return { err: "no live frame" };
  const t = live.body.innerText;
  const m = t.match(/Fakturanummer\s*\n([^\n]+)[\s\S]*?Verifikationsnummer\s*\n([^\n]+)[\s\S]*?Ska godkännas\s*\n([^\n]+)/);
  const g = s => { const e = live.querySelector('[id$="' + s + '"]'); return e ? e.value : null; };
  return { invNo: m && m[1].trim(), vernr: m && m[2].trim(), amount: m && m[3].trim(),
           konto: g("_123_RowValue"), proj: g("_276_RowValue"), comment: g("wf_comment_i") };
}

/* ---- search valid values for any dimension (the backend API) ------------- */
/*   await dimSearch("276", "ddls")  →  [{v:"89256", d:"KAW DDLS fellows Wei(…)"}, …]      */
function dimSearch(fieldId, term) {
  const live = liveFrame(); if (!live) return Promise.reject("no live frame");
  const ctl = live.getElementById("b_s66_g149s6_row0_" + fieldId + "_Control");
  const ctx = ctl.attributes.getNamedItem("context").value;      // re-read: the GUID rotates
  const base = live.location.href.split("/agrprod/")[0] + "/agrprod";
  const dec = s => s.replace(/&amp;#(\d+);/g, (m, c) => String.fromCharCode(+c)).replace(/&amp;/g, "&");
  return fetch(base + "/System/Services/DataListService.aspx", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "Search=" + encodeURIComponent(term) + "&Context=" + encodeURIComponent(ctx) +
          "&BatchStart=1&BatchSize=50"
  }).then(r => r.text()).then(t =>
    [...t.matchAll(/<item><value>([^<]*)<\/value><descr>([^<]*)<\/descr><\/item>/g)]
      .map(m => ({ v: m[1], d: dec(m[2]) })));
}

/* ---- set a dimension the way a human does (select + click outside) ------- */
function setDim(fieldId, value, description) {
  const live = liveFrame(); if (!live) return "no live frame";
  const w = live.defaultView;
  const el = live.getElementById("b_s66_g149s6_row0_" + fieldId + "_Editor");
  const o = w.FindDataListObject(el.id);
  el.focus();
  o.Popup.SetEditorValues(value, description);                    // = picking from the list
  live.getElementById("b_s66_g149s6_row0_" + fieldId + "_IsDirty").value = "true";
  try { w.LeaveDataListControl(null, el); } catch (e) {}          // = clicking outside
  return "set " + fieldId + "=" + value + " + blur (wait ~15s for the postback)";
}

/* ---- comment ------------------------------------------------------------- */
function setComment(text) {
  const live = liveFrame(); if (!live) return "no live frame";
  const c = live.getElementById("b_s66_s190_s170_s39_l170s39_ctl00_wf_comment_i");
  c.value = text;
  const d = live.getElementById("b_s66_s190_s170_s39_l170s39_ctl00_wf_comment_IsDirty");
  if (d) d.value = "true";
  return c.value;
}

/* ---- did the last postback complain? ------------------------------------ */
function checkState() {
  const live = liveFrame(); if (!live) return { err: "no live frame" };
  const t = live.body.innerText, di = t.indexOf("Detaljer");
  const g = s => { const e = live.querySelector('[id$="' + s + '"]'); return e ? e.value : null; };
  return {
    error: (t.match(/Korrigera följande:[\s\S]{0,160}/) || [""])[0].replace(/\s+/g, " ").trim(),
    proj: g("_276_RowValue"), projDesc: g("_276_RowDescription"),
    orgLooksRight: /SKEG/.test(t.slice(di, di + 320)),            // must be true before attest
    comment: g("wf_comment_i")
  };
}

/* ---- commit -------------------------------------------------------------- */
function sakattestera() {
  const live = liveFrame(); if (!live) return "no live frame";
  const w = live.defaultView;
  const btn = [...live.querySelectorAll("a")]
    .find(a => /^Sakattestera$/.test((a.textContent || "").trim()));
  if (!btn) return "button not found";
  const m = (btn.getAttribute("onclick") || "")
    .match(/checkFocusAndDoPostBack\(event,\s*['"]([^'"]+)['"]/);
  if (!m) return "no postback id";
  w.__doPostBack(m[1], "");
  return "attest fired " + m[1];
}

/* ---- task counts (authoritative — the header badge goes stale) ----------- */
function taskCounts() {
  return fetch("/agrprod/api/tasknotifications/UF/WEIO?page=1&start=0&limit=25",
               { headers: { Accept: "application/json" } })
    .then(r => r.json()).then(t => t.map(x => ({ step: x.step, count: x.count })));
}
