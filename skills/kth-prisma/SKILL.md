---
name: kth-prisma
description: Fill and edit grant applications in Prisma (prisma.research.se), the Swedish Research Council (Vetenskapsrådet / VR) grant portal, via the Claude Chrome extension (claude-in-chrome MCP). Use whenever the user asks to draft, fill, review, or update a VR/Prisma application or their Prisma profile/CV. Prisma is an ASP.NET MVC + jQuery + TinyMCE form app; this skill is the fast-path recipe (scripted javascript_tool over screenshot-clicking) plus the hard rules (never type the password, never click Register/Submit — the user does both). Load the main `kth` skill first for the SSO/session model.
license: Proprietary — internal automation; educational reference for the SCI Agenthon.
compatibility: Requires the Claude Chrome extension (claude-in-chrome MCP server) connected to the user's Chrome browser. Designed for Claude Code on macOS / Linux.
metadata:
  repo: kth-agent-skills
  service: prisma-vr
  start_url: https://prisma.research.se/
---

# Prisma (Vetenskapsrådet / VR grant portal)

Prisma is the Swedish Research Council's grant portal. You operate it in
the **user's own Chrome** via the `mcp__claude-in-chrome__*` tools — same
browser, same session, same SAML cookie as every other KTH/VR service.

> ⚠️ **Money- and identity-critical. Read the two hard rules first.**
>
> 1. **Never type the user's password.** The user logs in themselves
>    (username + password + any MFA). You navigate; they authenticate.
> 2. **Never click the final Register / Submit / Sign button.** A VR
>    registration is the applicant's *electronic signature*. You prepare
>    every field and verify the whole application; the **user** performs
>    the final Register click. This is the same
>    `irreversible-writes-stay-in-browser` principle the other KTH skills
>    follow — you prepare, the user commits.
>
> Also: if there is a **second** ongoing application, never touch it
> except for an explicitly-authorised step (e.g. copying CV items). Always
> confirm you are on the right `applicationId` before editing.

## Stack (what you are automating)

- **ASP.NET MVC + jQuery + TinyMCE 5/6. No Knockout/Angular.** The page
  is a classic server-rendered form; values are read from the DOM on Save
  and posted back with an anti-forgery token.
- **Field `name`/`id` attributes are GUIDs.** A field is addressed by its
  GUID, and the GUID is usually the `name`, not the `id`. Yes/No/option
  *values* inside a `<select>` are also per-select GUIDs — so always match
  options by visible **text**, never by hard-coded value.
- Add/Remove links are **unobtrusive-AJAX** (`<a data-ajax>` / `data-ajax-url`).
- Because the session and anti-CSRF token live in the page, the fast path
  is **scripted `javascript_tool` running inside the live page** — *not*
  external curl. (Pure-curl writes are not viable here: anti-forgery token
  + server-side form state. Curl is only useful for read-scraping if ever.)

## Tool loading prerequisite

All `mcp__claude-in-chrome__*` tools are deferred. Load each before first
use, e.g. `ToolSearch query="select:mcp__claude-in-chrome__javascript_tool"`.
The workhorses here: `navigate`, `javascript_tool` (95% of the work),
`computer` (only for real clicks the form demands — see below), `read_page`,
`get_page_text`.

## The golden workflow: discover once, then script

This is the repo-wide `discovery-then-script` methodology applied to Prisma:

1. **Discover (once, interactive):** use `computer`/`read_page` to learn a
   page's field GUIDs, option texts, and which controls demand real clicks.
2. **Script (every time after):** drive everything with `javascript_tool` —
   set fields, read counters, verify. No screenshot→click loops for
   repeated work.

After login the page is in **READ mode** — fix that *first* (next section),
or every write silently no-ops.

---

## CRITICAL gotchas (these cost the most time if forgotten)

### 1. Read-mode after every (re)login → click "Open in edit mode"
After login or any session re-auth, the application opens **read-only**:
every field is `disabled`, char counters show `0/0`, selects report
`disabled=true`, and the cascading widgets carry `data-is-readonly="true"`.
There is an **"Open in edit mode"** button at the top — click it before
any field-setting. If your sets seem to do nothing, this is almost always
why.

### 2. Aggressive inactivity timeout → Save after every page
The session drops after a few minutes idle. When it does, an AJAX postback
redirects to `/Account/LogOn?returnUrl=…` and the tab navigates away,
**losing all unsaved DOM values**. Mitigate:
- Tick **"Remember me" / "Håll mig inloggad"** at login.
- **Save early and often:** click the top **Save** after *each* page or
  section. Do **not** batch the whole form and save once at the end.
- Auto-save covers most text fields on blur, but **grids/cascades (SCB
  codes, tables) only persist on an explicit Save.** Never rely on
  auto-save for those.

### 3. `await` at top level of `javascript_tool` throws
"await is only valid in async function". Wrap in an IIFE
(`(async()=>{…})()`) or split into separate `javascript_tool` calls.

### 4. Some commits require a REAL trusted click — JS `.click()` no-ops
jQuery `.trigger('click')` and ref-based clicks **silently fail** on
certain controls. Use a real `computer` coordinate click for:
- the **Add** button on the cascading SCB selector,
- **Add new row** in budget/activity grids,
- **Add / Remove** on the application-CV copy lists,
- sometimes the publication-form **Save** (try JS submit first, fall back
  to a coordinate click).
Coordinate caveat: the screenshot pixel grid can differ from the JS
viewport (e.g. 1541×784 screenshot vs 1440×733 viewport → multiply JS
coords by ≈ screenshotW/viewportW ≈ 1.07). Read the real button rect, then
scale.

---

## Field-setting recipes (run via `javascript_tool`)

Reusable helpers — paste this block, then call the helpers. (Native value
setter + event dispatch is required so jQuery validation and char-counters
react.)

```js
// --- Prisma field helpers (jQuery form; values read from DOM on Save) ---
function byName(guid){ return document.getElementsByName(guid)[0]; }

// Text input / textarea. Char counters show REMAINING chars (e.g. "92/200" = 108 used).
function setText(guid, val){
  const el = byName(guid); if(!el) return 'missing:'+guid;
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto,'value').set;
  setter.call(el, val);
  ['input','change','keyup','blur'].forEach(t=>el.dispatchEvent(new Event(t,{bubbles:true})));
  return el.value.length;
}

// <select>: match by visible text, then let jQuery fire the cascade.
function setSelectByText(guid, text){
  const sel = byName(guid); if(!sel) return 'missing:'+guid;
  const opt = [...sel.options].find(o=>o.text.trim()===text.trim());
  if(!opt) return 'no-option:'+text;
  jQuery(sel).val(opt.value).trigger('change');     // 'change' drives cascade AJAX
  return opt.value;
}

// Checkbox: click only if it needs to flip (fires native + jQuery handlers).
function setCheck(guid, on){
  const cb = byName(guid); if(!cb) return 'missing:'+guid;
  if(cb.checked!==!!on) cb.click();
  return cb.checked;
}

// TinyMCE rich text (Abstract, Popular-science summary, justifications, ...).
// editor id = 'id_' + textareaGuid. Pass HTML ('<p>…</p>').
function setRichText(guid, html){
  const ed = tinyMCE.get('id_'+guid); if(!ed) return 'no-editor:'+guid;
  ed.setContent(html);
  ed.fire('input'); ed.fire('change'); ed.save();   // .save() writes back to the <textarea>
  const ta = document.getElementById('id_'+guid);
  if(ta) ['input','change','keyup','blur'].forEach(t=>ta.dispatchEvent(new Event(t,{bubbles:true})));
  return ed.getContent({format:'text'}).length;     // verify against source char count
}
```

**Verify lengths.** When injecting long verbatim text, compare the
returned length against the source's known character count. Zero-drift
method: pull the text from the source DOCX via Python (`zipfile` →
`word/document.xml`, strip `<w:t>` tags) and inject it as a JS template
literal — no manual retyping, no transcription drift.

---

## Cascading SCB classification selector (research-area codes)

The SCB-code picker is a 3-level cascading widget that is fussy:

- **Re-discover the widget every time** — its container/select instance
  IDs **regenerate on every commit and every page reload**. Never cache an
  ID. Find the level-1 select by content, e.g. the enabled
  `select.cascading-select[data-depth-level="1"]` (or whose
  `options[0].text === 'Select level 1'`).
- It loads `disabled` and is enabled by async init **only in edit mode**.
  In read mode it stays disabled forever (see gotcha #1).
- jQuery `.trigger('change')` populates the next level **only when the
  select is enabled AND the value actually transitions** — reset to the
  placeholder first if re-selecting the same value.
- **The Add button stays disabled until a level-3 (5-digit) LEAF is
  chosen.** The form requires 5-digit codes even if the user's draft lists
  3-digit ones. Map each 3-digit code to the right leaf and **confirm the
  leaf with the user** — some human labels don't match the official SCB
  tree (e.g. "305 Health Sciences" is actually *Other Medical and Health
  Sciences*; 303 = *Health Sciences*; clinical-lab work sits at 30223
  under 302 *Clinical Medicine*).
- Per code: JS-set level1 → level2 → level3 (each `trigger('change')`, wait
  for the next level to populate) → **real `computer` click on Add**
  (JS `.click()` does not fire the commit). The cascade then resets to
  level 1 and the code appears in a list with a **Remove** link. **Save.**

## Editable grids (budget cost tables, activity-level table)

Budget personnel/cost tables are custom editable grids (`pp-table-control`).
Cells show `[Required]` and become `<input>`s **only on real click/focus** —
there is no inline input to set blindly via JS. So:
- **Add new row** needs a real `computer` click (registers inconsistently
  via JS).
- Activate a cell (real click), then you can set its input value.
- **Constraints learned:** salary "Percent of salary" caps at **100** (you
  cannot enter 130% for a 1.3-FTE pool — use 100 and note the FTE in the
  justification text). Indirect/overhead costs are entered manually, not
  auto-computed; the summary row auto-totals once cells are filled.
- Detailed SEK figures (salaries/year, running, premises, indirect) are
  **not** in a narrative draft — get the real numbers from the user.

## Profile CV vs application CV (and the snapshot trap)

There are **two** CVs:
- **Profile CV** — `/Person/{personId}/PersonCV/*`. Shared across all of
  the person's applications. Sections: Personal details, Educational
  history, Professional history, Publications, Merits and awards (Docentur
  / Supervised persons / Research grants awarded in competition / Awards
  and distinctions / Other merits), Intellectual property. Merits
  sub-sections are collapsed accordions — click the section header to
  expand and read rows.
- **Application CV** — `/Application/{applicationId}/ApplicationCV/Edit/{personId}?sectionId=…`
  (`education` / `profession` / `merits` / `property`). This page *selects*
  which profile items to copy into one application. Add/Remove are
  unobtrusive-AJAX links that need **real coordinate clicks** (jQuery/ref
  clicks don't fire).

Two caveats that cause silent staleness:
- **Application-CV entries are SNAPSHOTS.** Editing a profile item does
  **not** update the copy already added to an application. To refresh,
  **Remove and re-Add** it in the application CV.
- **Research-grants list caps at 10.** To add an 11th, remove the least
  relevant one first.

### Add-a-publication form recipe (profile CV → Publications/Create)

1. Navigate `…/Publications/Create?parentId={personId}`.
2. Set `PublicationType` (e.g. "Scientific publication - peer-reviewed")
   — **its own `javascript_tool` call**; the subtype field renders async.
3. Set the subtype (e.g. `PublicationFormPeerReviewed` = "Original journal
   article") — own call; scalar fields render async after this.
4. Set scalars (own call): `Title`, `JournalName`, `Volume`,
   `FirstPageNumber`, `LastPageNumber`, `Doi`, `Authors[0].FirstName/LastName`,
   `MagazineStatus`="Published" (reveals `PublicationDate`), `OpenAccessStatus`.
5. Set `PublicationDate` (`YYYY-MM-DD`) and inject co-authors (own call).
6. **Fast multi-author trick (MVC list binding):** instead of clicking the
   author "Add" button per row (a real click that registers ~1 in 2),
   append hidden inputs to the `<form>` — for each extra author *i*:
   `Authors.Index`=i, `Authors[i].FirstName`, `Authors[i].LastName`,
   `Authors[i].ItemIndex`=i. All bind on POST.
7. Submit **Save** (JS submit first; fall back to a coordinate click on the
   visible Save button). Success redirects to `…/PersonCV/Publications`.
   Verify by reading the new row's authors cell.

## File uploads are BLOCKED via the agent

`mcp__claude-in-chrome__file_upload` no longer accepts host filesystem
`paths`, and the `files` parameter isn't in the exposed schema, so **you
cannot upload PDFs.** Prepare the files locally, `open` the folder in
Finder for the user, and **prompt the user to attach them** via the page's
"Choose file" button. (`upload_image` only handles images.)

## PDF attachment compliance (VR formatting rules)

VR enforces hard page/format limits — over-length attachments hurt the
application. Typical limits to check against the specific call text:
- Research plan ≤ a fixed page count; societal-benefit description ≤ 1 page;
  publication lists have their own page caps.
- Minimum body font and page margins are specified (do **not** shrink font
  or margins to cram more in).
Generate with `pandoc` + `xelatex`/`pdflatex`; verify with `pdfinfo`
(page count) and `pdffonts` (embedded font/size) **before** handing the
file to the user to upload.

## Page / navigation map (left nav)

Overview · Descriptive information (`pageIndex=0`) · Research description
(`pageIndex=1`) · Publications and other research outputs · Letters of
support · Budget and research resources (`pageIndex=4`) · Administrating
organisation · Participants · CV · Register.

**"Form recently updated → Refresh/Update" banner:** appears on Overview
and must be actioned before the final Register, but it can re-template the
form and **shift `pageIndex` values / reset fields**. Do **not** click it
unprompted — leave it to the end / to the user.

## Deadlines (so you set expectations correctly)

A VR call has **two** deadlines:
- **Applicant registration** (the user's electronic signature) — the
  headline deadline.
- **Administrating-organisation signature** — performed in the
  organisation's *own* Prisma org account, with a **later** deadline
  (commonly "no later than 7 calendar days after" the applicant deadline;
  confirm in the specific call text). So the applicant registering on time
  is what matters at the headline deadline; the org signature follows.
  Advise the user to notify their research-support/grants office once
  registered.

---

## Key takeaways (the short list to remember)

1. **Never type the password; never click Register/Submit.** Prepare, the
   user commits. Confirm you're on the correct `applicationId`; don't touch
   a second application except for explicitly-authorised steps.
2. **After every login the form is READ-ONLY** → click **"Open in edit
   mode"** before doing anything.
3. **Save after every page.** The session times out fast; tick "Remember
   me". Grids/cascades only persist on explicit Save.
4. **Fields are GUID-named; match select options by text, not value.** Set
   via native setter + dispatch `input/change/keyup/blur`. Char counters
   show *remaining* characters.
5. **TinyMCE:** `get('id_'+guid).setContent(html)` → `fire('input'/'change')`
   → `.save()`. Verify length against the source DOCX char count.
6. **Cascading SCB selector:** re-discover IDs every time; needs a 5-digit
   leaf; **Add requires a real click**; confirm leaf choices with the user.
7. **Budget/activity grids:** cells activate only on real click; "Add new
   row" needs a real click; salary % caps at 100.
8. **CV is two-tier:** profile CV is shared; application CV copies
   *snapshots* — remove+re-add to refresh; grants list caps at 10;
   add/remove need real clicks.
9. **Multi-author publications:** inject `Authors[i].*` hidden inputs +
   `Authors.Index` instead of clicking per-row Add.
10. **File upload is blocked** → user attaches PDFs manually; you prepare +
    verify them (page count, font) first.
11. **`await` at top level of `javascript_tool` throws** — use an IIFE.
12. **Some clicks must be real `computer` clicks** (Add on SCB, grid rows,
    CV add/remove, sometimes Save); scale JS viewport coords to screenshot
    pixels (≈1.07 when 1541×784 vs 1440×733).
13. **Two deadlines:** applicant registration, then a later org signature.

## What to never do

- Never type the password, complete MFA for the user, or click the final
  Register/Submit/Sign.
- Never edit a second, unrelated application without explicit authorisation.
- Never click the "Refresh/Update form" banner unprompted (can reset fields).
- Never commit application content, IDs, cookies, or session tokens to the
  repo. Keep all working files out of version control (see `.gitignore`).
