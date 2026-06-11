# SOP — Processing a forwarded WISUM cart

When a lab member (or anyone outside KTH's central inköp) sends a cart
to you via *Skicka varukorg*, it lands in **Mottagna varukorgar** with
the title `Varukorg från <sender>`. They expect you (the buyer) to:

1. Verify what's in it (and that it makes sense to buy with KTH money).
2. Set the delivery address and parcel-label fields.
3. Submit the order so it goes to the supplier.

This SOP captures the exact path that empirically works (validated on
the **REEF compute server** order, 2026-05-24 — 139 464,88 kr Custom
WS from Dustin AB, ordered by Songtao Cheng).

## TL;DR — interactive checkout via Chrome extension

The agent drives the checkout wizard interactively using the Claude
Chrome extension (claude-in-chrome MCP). The flow is:

1. `navigate` to VerboseShoppingCart.aspx
2. Click the forwarded cart (e.g. "Varukorg fran Songtao Cheng")
3. Click "Till kassan" to enter the wizard
4. Use `javascript_tool` to fill Telerik comboboxes + text fields
5. Use `computer` clicks for "Nasta steg" to advance steps
6. **STOP at Slutfor** — the user clicks the final submit

See the SKILL.md "Checkout wizard" section for the exact
`javascript_tool` snippets for each field.

## Pre-flight: investigate first

Don't auto-submit a forwarded cart. Verify it first:

```
# Via Chrome extension MCP:
navigate → https://www.wisum.its.umu.se/KTH/Navigation/VerboseShoppingCart.aspx
read_page   # see Mottagna varukorgar and Mina varukorgar
# Click the relevant cart to select it, then inspect line items

# Cart total is also available via pure curl:
kth wisum cart
```

For a sizeable buy (>5 kSEK, capex, custom build) also ask the sender:

| Question | Why |
| --- | --- |
| Where is the supplier's quote PDF? | WISUM stores only the article number for custom builds — the spec lives in the quote. |
| What KTH project pays for it? | Goes into Meddelande till inköpare so the EFH approver downstream doesn't have to ask. |
| Anything specific you want on the parcel label? | Default is your KTH_USER_NAME — usually you want the actual end-user's name + lab/room (e.g. `Songtao Cheng (Gamma3)`). |
| Is the quote still valid? | Custom-build quotes from Dustin etc. are typically valid 7-14 days — check the date before submitting. |

## The wizard, step by step

### Step 1 — Beställningsinfo

| Field | Set to | How |
| --- | --- | --- |
| **Enhet** | usually leave as-is on received carts (it's locked to the sender's unit, often greyed) | — |
| **Leveransadress** | the relevant goods reception, typically `SCI - SciLife Lab Godsmottagning` for biophysics deliveries | Telerik combobox — click the `<li>` for the option; the Adressrad / Street / Postnr / City auto-fill. |
| **Adressrad / Gata / Postadress** | auto-populated by the Leveransadress dropdown | don't touch |
| **Godsmärkning** | recipient's name + room/group, e.g. `Songtao Cheng (Gamma3)` | plain textbox |
| **Beställningsinformation → Fakturareferens** | KTH default `<KTHID> KTHVS` (e.g. `WEIO KTHVS`) | leave default |
| **Fakturaadress** | static (KTH Fakturaservice, Box 24075) | leave |

**Never click Spara** on step 1. Spara wipes the Telerik combobox value
back to "Välj". Go straight to **Nästa steg**.

### Step 2 — Meddelanden

Single textarea: *Meddelande till inköpare*. Fill it with:

- The **project number** (e.g. `89302` for WASP-DDLS)
- The **recipient** + lab/room
- The **supplier quote reference** (e.g. `Dustin offer HE01007`)
- A one-line description of what the order is for

Example:
```
WASP-DDLS project (projektnr 89302). REEF compute server — Ångström KTH
Custom WS per Dustin offer HE01007. Recipient/Godsmärkning: Songtao
Cheng (Gamma3). Levereras till SCI - SciLife Lab Godsmottagning.
```

Click **Nästa steg**.

### Step 3 — Slutför

Review the order summary:

- **Leveransadress** must show the address, NOT `Välj`. If it shows
  Välj, click Föregående steg twice to return to step 1, re-set the
  dropdown, and advance again WITHOUT clicking Spara.
- **Godsmärkning** must show the parcel-label text you set.
- **Cart total** matches the supplier's quote.
- **Meddelande till inköpare** is preserved.

If all four are correct, click **Slutför** to submit.

## Architectural gotchas (don't relearn)

1. **Telerik RadComboBox needs LI clicks, not `item.select()`.** The
   working pattern is `$find(<id>).findItemByText(<text>).get_element().click()`.
   See `project_wisum_telerik_combobox_recipe.md` in memory.

2. **Spara wipes Telerik combobox state.** ASP.NET serialises the
   pre-postback hidden field, not the live widget state. Never click
   Spara during automated checkout — only Nästa steg.

3. **Nasta steg needs a real click, not JS dispatch.** The Telerik
   RadButton's JS API hits postback errors when invoked from eval
   context. Use the Chrome extension's `computer` tool to visually
   click the "Nasta steg" button, or as a fallback:
   `document.getElementById('ctl00_main_btnNextStep').querySelector('a').click()`.
   See `project_wisum_wizard_advance_needs_real_clicks.md` in memory.

4. **Wizard advance is best-effort, not guaranteed.** If the agent
   reaches Slutfor but Leveransadress shows "Valj", use `computer`
   to click Foregaende steg twice, re-set the dropdown via
   `javascript_tool`, and click Nasta steg twice via `computer` --
   visual clicks always work because they go through the real event
   chain.

5. **The agent never clicks the final Slutför.** That's an irreversible
   commitment to the supplier. The `feedback_irreversible_writes_stay_in_browser`
   rule applies — agent prepares, user clicks.

## Anatomy of a successful run (REEF, 2026-05-24)

Captured for reference — what actually went through:

| Field | Value submitted |
| --- | --- |
| Cart | `Varukorg från Songtao Cheng` (received) |
| Supplier | Dustin AB (AV-Tekn, KTH) |
| Item | Ångström KTH Custom WS enligt offert HE01007 (dual RTX 5090, 9950X3D, 128 GB ECC DDR5, 9 TB Gen5 NVMe) |
| Total | 139 464,88 kr |
| Leveransadress | SCI - SciLife Lab Godsmottagning (Tomtebodavägen 23B, 171 65 Solna) |
| Godsmärkning | Songtao Cheng (Gamma3) |
| Meddelande | WASP-DDLS project (projektnr 89302). REEF compute server… |
| Quote validity | 2026-05-28 (4 days remaining when submitted) |

The package will arrive at SciLifeLab goods reception, marked for
Songtao at Gamma 3. The Dustin invoice will flow into EFH a few days
later; the EFH approver should set Proj=`89302` per the Meddelande.
