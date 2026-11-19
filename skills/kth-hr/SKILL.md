---
name: kth-hr
description: Navigate KTH-HR, KTH's Visma HR system at https://kth.hrplus.visma.se — HR+ (cases/ärenden, employment management, my profile) and the linked Visma Medvind self-reporting app at https://kth.medvind.visma.com (calendar, absence, working time). Use when the user asks about KTH-HR, HR+, Visma, Medvind, Egenrapportering, self-reporting, their payslip/lönespecifikation, ongoing or processed cases (pågående/avslutade ärenden), reporting absence or leave — semester (vacation), sjukfrånvaro (sick leave), VAB, föräldraledighet (parental leave), tjänstledighet — registering children or next-of-kin in personal details, working time (arbetstid), shift swapping (passmarknad), or pastes a kth.hrplus.visma.se / kth.medvind.visma.com URL. Read-only navigation and discovery; the user submits anything that changes HR records.
compatibility: Drive the browser with `myco nav` (this workspace) or the Claude Chrome extension (claude-in-chrome MCP). SSO must be valid — run `kth-login` first.
metadata:
  service: hr
  start_url: https://kth.hrplus.visma.se/Case/Case/OngoingCases
  landed_url_substring: kth.hrplus.visma.se
  second_host: kth.medvind.visma.com
---

# KTH-HR (Visma HR+ / Medvind) — service skill

KTH-HR is **two Visma products behind one SSO**:

| Host | Product | What lives there |
| ---- | ------- | ---------------- |
| `kth.hrplus.visma.se` | **HR+** | Cases (ärenden), Employment management, My libraries, My profile, payslip |
| `kth.medvind.visma.com` | **Medvind WFM** ("Egenrapportering" / Self-reporting) | Calendar, **absence & leave reporting**, working time, shift market |

HR+ links into Medvind through an SSO bridge — `/SeamlessMedvind?...` on the HR+ host
redirects to `kth.medvind.visma.com/Seamless/MvEmployee/#...` already authenticated.
⚠ **Personal data.** This system holds employee personal data, and if the user is a manager it
holds *other people's*. Never copy names, personnummer, salaries, sick-leave or family details
into repo files, notes, commits or memory. Report them in chat only.

## Prerequisites

1. `kth-login https://kth.hrplus.visma.se/Case/Case/OngoingCases` — note this script often prints
   `✘ login did not complete` while having actually landed; **verify the page before retrying**.
2. First visit to Medvind shows a **cookie dialog** (Ext JS). Prefer
   *Customize/show details* → **Confirm my choices** (keeps defaults) over *Accept All*;
   do not opt the user into tracking on their behalf.

## Map of the system (verified 2026-11-19)

### HR+ top menu (`kth.hrplus.visma.se`)
| Menu | URL |
| ---- | --- |
| Cases → Ongoing cases | `/Case/Case/OngoingCases` |
| Cases → Processed Cases | `/Case/Case/ProcessedCases` |
| Employment management | `/Employment/Employment/List` |
| My libraries | `/Library/Report` |
| account_circle → My profile | `/MyProfile/Account` |
| account_circle → Delegations | `/MyProfile/Delegations` |

### Self-reporting menu → Medvind modules
All are `https://kth.hrplus.visma.se/SeamlessMedvind?...`:

| Item | query |
| ---- | ----- |
| Start | `module=START` |
| Min arbetstid | `module=PERSONPERIOD` |
| Passmarknad | `module=TIMESWAP` |
| Översikt planering | `module=VIEW_PLAN` |
| Mina meddelanden | `module=VIEW_PERSONMSG` |
| INSIDER | `module=INSIDER` |
| **NYA MEDVIND (calendar)** | `application=MvEmployee&module=calendar` |
| Mina Inställningar | `module=MYPROFILE` |

Medvind calendar lands on
`https://kth.medvind.visma.com/Seamless/MvEmployee/#calendar/month/<YYYY-MM-DD>`
with views Month / Week / Day / Agenda, a **Mark ready** button, and an **Add** button offering:
**Work shift · Time · Absence · Other compensation · Note**.

## UI automation notes (important)

Both apps are heavy JS widget toolkits and resist synthetic events:

- HR+ top menu is **Kendo**. Submenus do **not** open on a synthetic or native *click* —
  they open on **hover**: `myco nav act <page> hover <ref>`, then `read` again for the
  submenu refs. Refs go stale after every hover/navigation — always `read` immediately before
  acting.
- Medvind is **Ext JS (modern toolkit)**. Buttons are `div.x-button` / `div.x-menuitem` with ids
  like `ext-button-13`, `ext-CalendarAddButton-1`. Dispatching pointer/mouse/`tap` events opens
  *some* of them (the cookie dialog, the calendar **Add** menu) but **not** the Add-menu entries
  themselves (Work shift / Absence / …) — those did not respond to synthetic events *or* to
  `myco nav act click`. **Leave that final click to the user.** This is the same class of
  trusted-event limitation documented in `kth-efh`.
- `myco nav shot` works here; compare file sizes to tell whether a click changed anything
  (identical byte size ⇒ nothing happened).

## Common verbs → recipes

### "What HR cases do I have?"
```
kth-login https://kth.hrplus.visma.se/Case/Case/OngoingCases
myco nav eval <page> 'document.body.innerText.slice(0,500)'
```
Processed cases: `/Case/Case/ProcessedCases`.

### "Open my self-reporting calendar"
```
myco nav goto <page> "https://kth.hrplus.visma.se/SeamlessMedvind?application=MvEmployee&module=calendar"
```
Handle the cookie dialog (see Prerequisites) on first use.

### "Report absence / apply for leave" (semester, sjuk, VAB, föräldraledighet)
1. Open the Medvind calendar (above).
2. Select the date(s) in the month grid.
3. Click **Add** (`ext-CalendarAddButton-1`) → the Add panel appears.
4. **The user clicks `Absence`** and fills the form — the agent cannot open this
   programmatically (see UI automation notes). Agent may read the form back afterwards.
5. The user submits. Absence affects pay and entitlements — never submit for them.

### "Register a child / next-of-kin in personal details"
The HR+ start page states that first-time users must update personal details including
*"födelsedata (år, månad, dag) på eventuella barn"*. KTH's own manual:
`https://intra.kth.se/administration/kth-hr/guider/for-medarbetare-ny/registrera-personliga-uppgifter-1.1361786`
A child is registered **after birth** (it needs a birth date); an *expected* baby is handled as
parental leave, not as a child record.

### "Parental leave — what applies at KTH?"
Authoritative page: `https://intra.kth.se/anstallning/arbetstid/foraldraledighet-och-vab-1.26442`
- **Apply at least two months in advance** (*"Du bör ansöka om föräldraledighet senast två
  månader i förväg"*); you report the absence yourself in KTH-HR.
- **Föräldralön** from KTH on top of Försäkringskassan's föräldrapenning: until the child is
  36 months, max 360 days; 10 % of calendar-day salary up to the basbelopp ceiling, 90 % above it.
  Leave with föräldralön is semestergrundande.
- The **other parent** gets 10 days tillfällig föräldrapenning at the birth, to be taken within
  60 days.
- Försäkringskassan is a **separate** application — KTH-HR does not do it for you.

## Session-expiry detection
If a page lands on `login.ug.kth.se` / `login.kth.se`, or Medvind bounces to a login form, the SSO
session expired. Re-run `kth-login <url>` and verify the landing page.

## What this skill should never do
- **Never submit anything that changes an HR record** — absence, leave, personal details,
  next-of-kin, employment changes, or a case. The agent navigates and reads; the user submits.
- **Never write personal data to disk** — no names, personnummer, salaries, health/leave details
  or family information in notes, skill files, commits or memory.
- Never accept tracking cookies on the user's behalf (use *Confirm my choices*).
- Never act on another employee's record found via Employment management or Cases without the
  user explicitly asking for that specific person.
