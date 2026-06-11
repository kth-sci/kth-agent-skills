---
name: kth-wisum
description: Search products and manage shopping carts in KTH's WISUM purchasing system (hosted at https://www.wisum.its.umu.se/KTH/ by Umeå University ITS). Use when the user wants to look up products to order, check prices from KTH's framework agreements, add items to a cart, view cart total, manage favorites, process a cart forwarded by a lab member, drive a checkout to the Slutför step, or asks about "WISUM", "Wisum", "inköp", "beställa", "varukorg" (shopping cart). Pure-curl architecture for read + light-write; the Chrome extension (claude-in-chrome MCP) handles cart management and the checkout wizard interactively. The skill is fully portable — all user-specific defaults (name, KTH unit, default delivery address, parcel-label name) live in ~/.config/kth-cli/config.env, not in the repo. Prerequisite: load the main `kth` skill first to confirm SSO.
compatibility: Requires `kth` CLI and a warm KTH SSO session (`kth status` exits 0). Auth federates through KTH Shibboleth IdP (saml-5.sys.kth.se). Browser-driven verbs (carts, checkout) require the Claude Chrome extension (claude-in-chrome MCP).
metadata:
  service: wisum
  vendor: Umeå University ITS
  host: www.wisum.its.umu.se/KTH
  api_pattern: /KTH/ws/{Tree,Product,Supplier}WebService.asmx/<Method>
  envelope: '{"d": ...}'
---

# KTH WISUM (purchasing) — service skill

WISUM is a multi-tenant ASP.NET purchasing platform run by Umeå
University's IT services. KTH is one of the tenants
(`/KTH/` path prefix). It exposes a catalog of products from KTH's
framework-agreement suppliers, a shopping cart, favorites, and a
purchase-order workflow.

## Portability — user config lives OUTSIDE this repo

The repo ships only generic logic + templates. Your personal
preferences (name, KTH unit, default delivery address) live in
`~/.config/kth-cli/config.env`. Seed it on first run:

```bash
# install.sh does this automatically if the file is missing
cp <repo>/config/kth-cli.example.env ~/.config/kth-cli/config.env
chmod 600 ~/.config/kth-cli/config.env
$EDITOR ~/.config/kth-cli/config.env   # set KTH_USER_NAME, KTH_WISUM_*
```

The CLI sources this file at startup. Values:

| Variable | Purpose |
| --- | --- |
| `KTH_USER_NAME` | Your display name as it appears in WISUM. Used as the default Godsmärkning + as a fallback selector for the parcel-label input. |
| `KTH_USER_ID` | Your 4-letter KTH ID (e.g. `WEIO`). Auto-detected from Unit4's session API, so usually optional. |
| `KTH_WISUM_ENHET` | Default Enhet (KTH unit) for `checkout`. Discover yours via `kth wisum enheter`. |
| `KTH_WISUM_ADDRESS` | Default delivery address for `checkout`. Discover via `kth wisum addresses`. |
| `KTH_WISUM_GODSMARKNING` | Default parcel-label text. Defaults to `$KTH_USER_NAME`. |

Override any of these per-call with `--enhet`/`--address`/`--godsmarkning`
flags on `kth wisum checkout`.

**Architecture is pure-curl-friendly.** Unlike the EFH/Unit4 system,
WISUM's JavaScript front-end is backed by **ASMX JSON web services**
that return clean `{"d": <data>}` JSON envelopes. All read + light-write
verbs in `kth wisum` are pure curl with the warm-profile cookie jar.

For browser-driven verbs (carts, checkout), the agent uses the **Claude
Chrome extension** (claude-in-chrome MCP) instead of agent-browser.
The pattern is: `navigate` to a WISUM page, `read_page`/`get_page_text`
to inspect state, `javascript_tool` to manipulate Telerik widgets, and
`computer` for clicks that need real event dispatch.

## Prerequisites

1. The main `kth` skill must have confirmed `kth status` is OK.
2. **First-ever visit** federates through Shibboleth and shows a
   "Service Information" consent screen. Once accepted, future visits
   are silent. If the consent screen appears, the user clicks
   *Proceed*; the wrapper does not auto-accept.

## Shipped verbs (pure curl)

### "Find something I can buy"
```bash
kth wisum search "usb cable"                    # paged 10 per page, page 1
kth wisum search "apple pencil" --per-page 5
kth wisum search "ethernet switch" --page 2
kth wisum search "<query>" --json               # raw JSON of the result
```
Output (human) shows: `[SupplierProductId] Name — Price (Manufacturer / delivery time)` plus the supplier article number. The `SupplierProductId` is what you pass to `add`.

### "What's in my cart?"
```bash
kth wisum cart
```
Currently shows the total count and sum (e.g. `"Varukorgen är tom. | 0,00 kr"` or `"3 st | 1 234,56 kr"`). **Line-item detail isn't shipped yet** — see "Known limits" below.

### "Add to cart"
```bash
kth wisum add 55777265           # adds 1 of Apple Pencil USB-C
kth wisum add 55777265 3         # adds 3
```
Reversible until checkout. You can remove via the WISUM UI today
(remove-from-cart endpoint not yet discovered).

### "Browse categories"
```bash
kth wisum categories             # root catalogs
kth wisum category 123           # products in category 123, page 1
kth wisum category 123 --page 2
```

### "Manage favorites"
```bash
kth wisum favorites              # list favorited products
kth wisum favorite 55777265      # mark as favorite
kth wisum unfavorite 55777265
```

### "Inspect / debug"
```bash
kth wisum refresh                # re-export cookies (TODO: rework for Chrome extension)
kth wisum raw TreeWebService GetActiveCartQuantityAndSum '{}'
kth wisum raw TreeWebService GetProductsBySimpleSearch '{"searchQuery":"x","startIndex":0,"maximumRows":5,"sortExpressions":""}'
```
`raw` is the discovery hook — useful when probing endpoints we haven't wrapped.

## Browser-driven verbs (Chrome extension)

Cart management and checkout use the **Claude Chrome extension**
(claude-in-chrome MCP) interactively. These are NOT wrapped as CLI
subcommands — the agent drives them directly via MCP tool calls.

### Cart listing and selection

1. **Navigate** to the cart page:
   ```
   navigate → https://www.wisum.its.umu.se/KTH/Navigation/VerboseShoppingCart.aspx
   ```
2. **Read the page** to see available carts:
   ```
   read_page  (or get_page_text for text-only)
   ```
3. **Click** a cart to select it — use `find` or `computer` to click the
   cart name in the list.

### Checkout wizard (interactive, via Chrome extension)

The checkout wizard lives on `W2CheckOut.aspx`. The agent fills fields
using `javascript_tool` and advances steps using `computer` clicks.

**Step 1 — Bestellningsinfo:**

1. Click "Till kassan" to enter the wizard.
2. Set **Leveransadress** (Telerik RadComboBox):
   ```javascript
   // via javascript_tool:
   (() => {
     const cb = $find('ctl00_main_ucOrder_ucDeliveryAddress_ddlDeliveryAddresses');
     const item = cb.findItemByText('SCI - SciLife Lab Godsmottagning');
     item.get_element().click();
     return {ok: true, text: cb.get_text()};
   })();
   ```
3. Set **Enhet** (if editable, same pattern):
   ```javascript
   (() => {
     const cb = $find('ctl00_main_ucOrder_ddlUnits');
     const item = cb.findItemByText('YOUR_UNIT_HERE');
     item.get_element().click();
     return {ok: true};
   })();
   ```
4. Set **Godsmarkning** (plain textbox):
   ```javascript
   (() => {
     const el = document.querySelector('input[name$="txtGodsmarkning"]');
     el.value = 'Songtao Cheng (Gamma3)';
     el.dispatchEvent(new Event('input', {bubbles:true}));
     el.dispatchEvent(new Event('change', {bubbles:true}));
     return {ok: true};
   })();
   ```
5. **DO NOT click Spara** — it wipes Telerik combobox state. Click
   **Nasta steg** via `computer` (visual click on the button).

**Step 2 — Meddelanden:**

Fill the textarea via `javascript_tool`:
```javascript
(() => {
  const t = document.getElementById('ctl00_main_ucMessages_tbInkopareMessage');
  t.value = 'WASP-DDLS project (projektnr 89302). ...';
  t.dispatchEvent(new Event('input', {bubbles:true}));
  t.dispatchEvent(new Event('change', {bubbles:true}));
  return {ok: true};
})();
```
Then click **Nasta steg** via `computer`.

**Step 3 — Slutfor:**

The agent STOPS here. Verify on screen:
- Leveransadress is correct (not "Valj")
- Godsmarkning shows the right label
- Cart total matches the quote
- Meddelande is preserved

The **user** clicks Slutfor. The agent never submits.

### Listing delivery addresses and units

Navigate to the checkout wizard, then enumerate combobox options:
```javascript
// List all addresses via javascript_tool:
(() => {
  const cb = $find('ctl00_main_ucOrder_ucDeliveryAddress_ddlDeliveryAddresses');
  return cb.get_items().toArray().map(i => i.get_text());
})();
```

### Telerik RadComboBox patterns (reference)

These patterns are critical for any Telerik widget on WISUM pages:

| Task | javascript_tool code |
| --- | --- |
| Select an option | `$find(id).findItemByText(text).get_element().click()` |
| List all options | `$find(id).get_items().toArray().map(i => i.get_text())` |
| Read current value | `$find(id).get_text()` |
| List all comboboxes on page | Iterate `Sys.Application._components`, filter by `instanceof Telerik.Web.UI.RadComboBox` |

**Key gotcha:** `item.select()` does NOT work — you must call
`item.get_element().click()` to trigger the real DOM event chain that
ASP.NET postback expects.

## Discovered API surface

ASMX web services + the methods we know about, from the JS-proxy
introspection at `<svc>.asmx/jsdebug`:

### `TreeWebService.asmx`
| Method | Used by |
| ------ | ------- |
| `GetProductsBySimpleSearch(searchQuery, startIndex, maximumRows, sortExpressions)` | `kth wisum search` |
| `GetActiveCartQuantityAndSum()` | `kth wisum cart` |
| `AddToCart(supplierProductId, quantity)` | `kth wisum add` |
| `GetRootNodes(orgId)` | `kth wisum categories` |
| `LoadChildNodes(node, context)` | (used internally for tree expansion) |
| `GetProductsForTreeNode(treeNodeId, startIndex, maximumRows, sortExpressions, filterExpressions)` | `kth wisum category` |
| `GetProductsByFavoriter(startIndex, maximumRows, sortExpressions)` | `kth wisum favorites` |
| `SetProductsAsFavorit(produktId)` | `kth wisum favorite` |
| `UnSetProductsAsFavorit(produktId)` | `kth wisum unfavorite` |
| `GetProductsByAdvancedSearch(...)`, `GetProductsByFilterSearch(...)`, `GetRecommendedProductsForTreeNode(...)`, `GetSearchAttributesForTreeNode(...)`, `GetRefinedSearchAttributesForTreeNode(...)`, `GetTreeNodesForFilteredProducts(...)`, `LoadActiveChildNodes(...)`, `UseParametricSearch(...)` | not yet wired |
| `AddProductToTreeNode(...)`, `RemoveProductFromTreeNode(...)`, `CreateAliasNode(...)`, `DeleteAliasNode(...)`, `SetPrimaryNode(...)`, `DeleteRecommendedProduct(...)`, `AddToInkopareCart(...)` | admin / role-restricted; not wired |

### `ProductWebService.asmx`
| Method | Note |
| ------ | ---- |
| `CompareProducts(productIds)` | side-by-side comparison |
| `SearchByPsAttributes(...)` | attribute-driven search |

### `SupplierWebService.asmx`
| Method | Note |
| ------ | ---- |
| `GetAllSuppliersForOrg()` | full supplier list |
| `GetFilteredSuppliersForRadCombobox()` | suggest list |
| `FindSimilarSuppliers()` | fuzzy match |

## Auth + cookies

Cookies live under `www.wisum.its.umu.se`. Three of them matter:
- `_shibsession_…` (the Shibboleth session)
- `.ASPXAUTH` (the .NET forms-auth ticket)
- `ASP.NET_SessionId`

**For curl-based verbs:** The wrapper needs a cookie jar at
`browser-profile/.cookies-wisum.txt` (Netscape format). The `refresh`
subcommand currently needs rework to extract cookies from the user's
Chrome profile (TODO: use `javascript_tool` with `document.cookie` or
a DevTools protocol approach). On HTTP 4xx the wrapper navigates to
`https://www.wisum.its.umu.se/KTH/Default.aspx` in Chrome to renew
the session, then retries once.

**For browser-driven verbs:** The Claude Chrome extension operates
directly in the user's logged-in Chrome browser, so cookies are already
present — no export step needed.

If WISUM ever logs you out completely (Shibboleth session lifetime is
typically 8h), navigate to the WISUM default page in Chrome to trigger
a silent SAML round-trip via `saml-5.sys.kth.se` — no MFA prompt as
long as the underlying KTH SSO (`MSISAuth`) is still alive.

## Known limits / planned

| What's missing | Why | Likely path |
| -------------- | --- | ----------- |
| `cart-detail` (line items + subtotals) | The cart drawer rendering happens on `W2ProductCatalog.aspx` server-side, not via a JSON endpoint we've found yet. | HAR-capture: navigate to the dedicated `W2Cart.aspx` or similar page in the UI, look for new `TreeWebService` / cart-specific endpoints. |
| `remove` / `update-qty` | Same reason — likely on a cart .aspx page. | Same discovery flow. |
| `checkout` / submit order | The checkout wizard (W2CheckOut.aspx) uses Telerik RadComboBox widgets. Now driven interactively via Chrome extension `javascript_tool` + `computer` clicks. | Apply the `feedback-irreversible-writes-stay-in-browser` rule: agent prepares, user clicks Slutfor. |
| `product <id>` detail | No single-product GET endpoint found yet. The wrapper currently re-runs `search` for the id. | Try `ProductWebService.CompareProducts([id])` or look for a `GetProduct` method on a service we haven't probed. |

## What this skill should never do

- **Checkout / submit an order** without explicit user confirmation.
  Once a purchase order is placed, it's a real commitment to a supplier.
  The wrapper currently has no `checkout` verb at all; if/when one is
  added it must require `--confirm` and (ideally) an interactive prompt.
- **Mass-add to cart** beyond a small reasonable quantity. If asked for
  hundreds of items, confirm with the user first.
- **Cache or commit** cookie jars or session tokens. Session cookies are ephemeral.

## Quick recipes

### "Find me three good options for X"
```bash
kth wisum search "X" --per-page 10
```
Pick interesting `[SupplierProductId]`s from the list, then if you want
to compare them:
```bash
kth wisum raw ProductWebService CompareProducts '{"productIds":[111,222,333]}'
```

### "Show me what I usually buy"
```bash
kth wisum favorites
```

### "Add the Apple USB-C-to-Lightning cable I always buy"
```bash
kth wisum favorites \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); [print(p["SupplierProductId"], p["Name"]) for p in d.get("Data",[])]'
# pick the id, then:
kth wisum add 55372526
kth wisum cart
```
