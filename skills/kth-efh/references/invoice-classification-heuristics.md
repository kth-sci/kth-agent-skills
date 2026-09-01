# Invoice classification & funding-routing heuristics

Accumulated takeaways for proposing a **project/funding code** and a
**comment** on EFH supplier invoices (Sakattestera / Ekonomisk attest)
*before* asking the user. These let the agent make a confident first
suggestion instead of asking from scratch every time.

> These are **generic** heuristics. The actual project numbers and
> per-source nicknames (e.g. which grant "GGS" or "DDLS fellow" maps to)
> live in the user-specific, **uncommitted**
> [`project-accounts.yaml`](project-accounts.yaml) — never hard-code real
> project numbers or personal names here. Map a heuristic → a *rule id*
> in that file, then read the number from the file.

## 1. Always read the `GODSMÄRKE` / delivery-mark field

The `Faktura.htm` (Bilaga) usually carries a **`GODSMÄRKE:`** line in
*Fakturameddelande*, and a *Leveransmottagare* address. The godsmärke
typically names **the lab member the goods are for** (e.g. a PhD student
or postdoc). Extract it and:

- put the recipient's name in the draft comment, and
- use it to pick the funding source (goods for person X on grant Y →
  grant Y's project).

If the godsmärke is missing (some suppliers omit it), say so and ask who
the item is for rather than guessing.

## 2. Item → category → funding-rule mapping

Read the **line items** (Rad / Produktnummer / description) from the
`Faktura.htm`, classify, then route to a rule id in `project-accounts.yaml`:

| Item pattern | Category | Default rule id (see yaml) |
| ------------ | -------- | -------------------------- |
| Single-board computers (Raspberry Pi, Arduino, microcontrollers), cameras, optics, cables, sensors, lab electronics | Lab hardware — often **microscope / instrument control** | `hardware-lab` |
| USB hubs, USB-C docks, adapters, presenters (e.g. Logitech Spotlight), small peripherals | Lab **accessories** | `hardware-lab` |
| Laptops / desktops / workstations (MacBook, etc.) | Personal compute — code to **the named recipient's** funding | the recipient's fellowship/grant rule (ask who it's for if unclear) |
| Cloud / compute bills, project-named consumables | Match the **named project** | the matching project rule (e.g. `ri-scale`, `wasp-ddls`, `rdcp`) |

Rules of thumb:

- **Lab consumables & accessories** (hubs, cables, presenters, Pi boards)
  default to the general **lab-hardware** account unless the invoice text
  or the user ties them to a specific named project.
- **Computers are personal**: a laptop is almost always coded to the
  funding of the *named* person receiving it (the godsmärke / the person
  the user names), not the generic lab-hardware account. Confirm the
  person if the invoice doesn't name them.
- A named EU/national **project keyword** in the invoice (grant number,
  project title) overrides the generic categories — route to that
  project's rule.

When two rules could plausibly apply (e.g. a laptop that could be lab
hardware *or* a specific fellowship), **state the choices and ask** —
this is the one place a wrong guess sends money to the wrong grant.

## 3. Comment style (the *kommentar* / *syfte/beskrivning* box)

Keep it **short, factual, Swedish** (the approver chain reads Swedish).
State *what it is* + *for whom / what purpose*. Examples (structure only):

- `<N> st <item> för <purpose> i labbet.`  (e.g. instrument control)
- `<dator> till <namn>, <roll>.`  (e.g. laptop to a named postdoc)
- `<item>, labbtillbehör.`  (small accessories)

One line is enough. Don't restate the supplier/amount (already on the
invoice) — add the *why*.

## 4. Sakattestera screen workflow (Unit4 simplified view)

The on-screen banner spells out the 6 steps:

1. Click the invoice image (Bilaga) — read the `Faktura.htm`.
2. Check price, delivery, etc.
3. Write *syfte/beskrivning* in the **kommentar** box.
4. (escalate/forward only if needed)
5. **Fill in project** — *byt ut dummyproj*: the project coding is set in
   **advanced mode** (`Till avancerat läge`), in the konteringsrader grid
   — **not** on the simplified screen. This is a postback-heavy financial
   edit.
6. **SAKATTESTERA** — the commit button.

Per the architecture, steps 5–6 (coding to a grant + the attest click)
are **irreversible financial actions and stay with the user**. The agent
reads the invoice, proposes the project + comment, and stops. See the
"What this skill should never do" section in `SKILL.md`.

## 5. Per-invoice prep checklist the agent can produce

For each pending Sakattestera item, present a card:

- **What it is** (supplier, item, qty, amount incl. VAT)
- **Recipient** (godsmärke) if present
- **Proposed project** (rule id + number from `project-accounts.yaml`)
- **Draft comment** (short Swedish)

…then let the user set the coding in advanced mode and click Sakattestera.
