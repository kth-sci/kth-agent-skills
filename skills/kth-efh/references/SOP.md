# KTH EFH — Standard Operating Procedure

Synthesized from KTH's official documentation (May 2023 editions):
- `pdf/invoice-management-kth-2023-EN.pdf` (23 pages, primary source)
- `pdf/fakturahantering-kth-2023-SV.pdf` (Swedish — same content)
- `pdf/fakturaflode-webb.pdf` (the workflow diagram)
- `pdf/belopp-pa-faktura.pdf` (how amounts/VAT/rounding appear)
- `pdf/agresso-whats-new.pdf` (UI changes from old Agresso)
- `pdf/installning-foretag-EFH-2025.docx` (multi-company settings)

Keep these PDFs alongside the skill so future agents can re-read them
verbatim. This file is the agent-friendly distillation.

## 1. The two roles you (WEIO) can act in

| Role | Swedish | What it means | Output of approval |
| --- | --- | --- | --- |
| **Approver** | *Sakattestant* | First step. You verified the goods/service were delivered as agreed. You set the **Proj** column and the **purpose comment**. | Forwards invoice to the bookkeeper. |
| **Financial approver** | *Ekonomisk attestant* | Last step before payment. You verified the amount is right and the Proj is correct. You may set/correct Proj if needed at KTH SCI. | **Releases the invoice for payment to the bank.** Irreversible from here. |

The pending task `process=EFH, step=Ekonomisk attest` from
`kth efh tasks` means you are acting as **financial approver** on that
invoice.

## 2. The invoice's life

```
Invoice arrives  →  [SAKATTEST]  →  [EKONOM]    →  [EKONOMISK ATTEST]  →  Bank
                    (approver)     (bookkeeper)   (financial approver)    (paid)
                    you set Proj,  sets base      you confirm Proj,
                    write comment  account,       confirm amount,
                                   fixed assets   final approval
```

If something is wrong at any step, the invoice can be sent **back** one
or more steps. See § 6 for the rejection actions.

## 3. The screen layout (Attest leverantörsfaktura)

When you open a task, the detail screen has three areas:

1. **Information on supplier's invoice** — supplier, due date, currency,
   total amount, **net amount** (= total – VAT). This is the amount you
   are approving. The "Belopp på faktura" PDF shows how rounding /
   öresavrundning can make the net look slightly different.
2. **Log workflow** (`Logg arbetsflöde`) — comment chain. You write
   here. The bookkeeper reads here to pick the right account.
3. **Details of supplier's invoice** (`Detaljer leverantörsfaktura`) —
   the coding row with the **`Proj`** column. If the invoice is split
   across projects, there's one row per split, and a workflow per row.

The Bilaga ("Attachment") folder is opened via the **paperclip icon**
at top right. KTH's actual invoice arrives in there as
`1 - Faktura.htm` (HTML format from Peppol) for e-invoices, or
scanned PDF for paper invoices.

## 4. What the user must always check (per the manual)

When approving (either role):

- [ ] Product/service delivered, correct quantity, satisfactory.
- [ ] Invoice **net amount** matches the agreed price.
- [ ] Payment terms / due date / delivery date consistent with order.
- [ ] All required attachments present (see § 5).
- [ ] No conflict of interest (don't approve invoices from a counterparty
      you have a personal connection with; forward to your supervisor).
- [ ] Reference number / contract attached for consultancy work.

When acting as **financial approver** specifically:

- [ ] Verify the **Proj** the approver set is correct.
- [ ] If the invoice is for travel/representation you personally
      participated in, **Escalate** instead of approving (the Eskalera
      button routes to your supervisor).

## 5. Required attachments per invoice type (Bilaga folder)

| Invoice type | Required attachments |
| --- | --- |
| Food & drink (representation, work meal) | **Participant list** (purpose + names; orgs for external reps). If meals not part of a travel claim → `Representation/kostförmån` form for benefit taxation. Light refreshments for an identifiable group can use a one-line comment instead. |
| Travel | Clear **purpose** in comment (e.g. "study trip", "EU project meeting"). Destination + date for travel-related invoices. |
| Conference | Participant list + programme/agenda + purpose. |
| Consultancy | **Reference number / agreement** attached, or referenced in the comment. |
| Eurocard | All receipts taped to A4, scanned to PDF, attached as `Appendix to ver. 800XXXXX`. Originals submitted to school bookkeeper. |

## 6. Action buttons (the "button next to Parkera")

Per the flow diagram, what's available depends on your current role:

### As **Sakattestant** (approver)

| Button | When to use | Effect |
| --- | --- | --- |
| **Sakattestera** | Everything correct, approve it | Forwards to bookkeeper |
| **Vidarebefordra** | You're not the right person, but it's someone in your school | Reroutes within step |
| **Parkera** | Wait (e.g. for credit note from supplier) | Stays on your list until you act |
| **Felaktig faktura** | Invoice belongs to another school OR has wrong amount | Goes to SLIPS / school invoice coordinator |

### As **Ekonomisk attestant** (financial approver)

| Button | When to use | Effect |
| --- | --- | --- |
| **Ekonomisk attest** | Amount correct, Proj correct, you are not a personally involved party | **Releases to bank** for payment (definitive booking) |
| **Eskalera** | You personally participated (travel/representation) or will use the purchase yourself (laptop/phone) | Routes to your predefined supervisor |
| **Återekonom** | Wrong project / wrong school / wrong info | Back one step to the bookkeeper |
| **Parkera** | Ambiguity, awaiting final check | Stays on your list |

## 7. Comment field — what to write

Required content:
- **What** the invoice is for (item or service in plain language).
- **Why** KTH is paying for it (purpose).
- **Which project** the cost belongs to and why (especially when not
  obvious from item description).
- For **travel**: destination + dates + purpose ("research trip to
  Hamburg, EU RI-SCALE kickoff, 2026-03-15→17").
- For **consultancy**: reference to agreement / RFQ if not attached.

Wei's personal project-routing table is in
[`project-accounts.yaml`](project-accounts.yaml). Agents should
consult that when proposing a `Proj` value and the comment phrasing.

## 8. Conflict-of-interest rules

You **may not** approve an invoice if any of the following apply
(Administrative Procedure Act SFS1986:233):

- The invoice concerns yourself, spouse, parent, child, sibling, or
  other close relative.
- You are deputy to the person the matter concerns.
- Any other circumstance that could compromise impartiality.

If a conflict exists: do **not** approve. Use **Vidarebefordra** to
forward to your immediate supervisor.

For the financial approver, "self-use" purchases (own laptop, phone)
and travel/representation you participated in → **Eskalera** instead
of approving.

## 9. Finding past invoices

The manual lists three query templates (Menu → Reports → Globala
rapporter / Elektroniska fakturahantering / Frågemallar):

| Template (Swedish) | What it shows |
| --- | --- |
| `Logg arbetsflöde levfakt 1 - Egna och åtgärdade` | Invoices you yourself processed |
| `Logg arbetsflöde levfakt 2 - Åtgärdade åt andra` | Invoices you processed as replacement |
| `Fråga arbetsflöde levfakt - Generell` | Any invoice, regardless of who processed |
| `Förfrågan online fakturor - Kontosaldofråga` | Costs per project/org unit |

Filters available: status, period, supplier number, voucher number,
project. Click *Ver.nr* on a result to see the invoice image. Click
*Avslutad* to see the workflow.

## 10. Replacements (vacation cover)

Set up before extended absence. Path: Menu → Din anställning → Aktivera
ersättare. Fill in absence dates + set status "Jag är inte på kontoret
just nu" + Save. The replacement gets the same permissions and the
same email notifications. Brief them on expected incoming invoices.

## 11. Mapping the SOP to CLI verbs

Two principles:

1. **Read-only verbs are safe to automate.** They surface information
   and let an agent reason about an invoice without ever moving money.
2. **Money-moving verbs are gated.** Anything that triggers
   "Ekonomisk attest" or "Sakattestera" must require an explicit
   confirmation flag and ideally an interactive prompt — the agent
   must never auto-approve.

### Currently shipped read-only verbs

| Command                | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `kth efh session`      | Print `{userId, client, language}`                 |
| `kth efh tasks`        | List task categories with `count` per queue        |
| `kth efh count`        | Total pending tasks                                |
| `kth efh url <view>`   | Build deep-link URL to a Unit4 view                |

### Planned read-only verbs (need API discovery)

| Command                                | What it should do |
| -------------------------------------- | ----------------- |
| `kth efh invoice <vernr>`              | Show metadata for one invoice (supplier, dates, net, current step, holder, current Proj if set) |
| `kth efh invoice <vernr> attachments`  | List Bilaga entries with type + filename |
| `kth efh invoice <vernr> attachment <name> [--save path]` | Pull one attachment (the `1 - Faktura.htm` we always read) |
| `kth efh invoice <vernr> log`          | Show the full workflow comment chain |
| `kth efh history [filters]`            | Wrapper around `Logg arbetsflöde 1`, filterable by period/supplier/project |
| `kth efh suggest <vernr>`              | Read the invoice + attachment, match `project-accounts.yaml` rules, propose a Proj + comment, output JSON. **No action taken.** |

### Planned write verbs (need API discovery + safety gating)

The Unit4 UI buttons (`Sakattestera`, `Ekonomisk attest`, `Parkera`,
`Vidarebefordra`, `Felaktig faktura`, `Eskalera`, `Återekonom`) all
post to the same workflow API but with different action codes. We
have not yet captured those POSTs. When we do:

| Command                                                    | Maps to button         | Safety gate |
| ---------------------------------------------------------- | ---------------------- | ----------- |
| `kth efh comment <vernr> "text"`                           | Add comment            | none (safe) |
| `kth efh set-proj <vernr> <project>`                       | Set Proj on row 1      | none if invoice is still on your list |
| `kth efh park <vernr> "reason"`                            | **Parkera**            | none (safe) |
| `kth efh forward <vernr> <user> "reason"`                  | **Vidarebefordra**     | confirm prompt |
| `kth efh reject <vernr> "reason"`                          | **Felaktig faktura** / **Återekonom** | confirm prompt |
| `kth efh escalate <vernr> "reason"`                        | **Eskalera**           | confirm prompt |
| `kth efh approve sak <vernr> --confirm`                    | **Sakattestera**       | `--confirm` required; agent never sets this automatically |
| `kth efh approve ekon <vernr> --confirm --i-am-not-using-it` | **Ekonomisk attest** | two flags required; intent is to make agent auto-approval effectively impossible without explicit user action |

## 12. Agent etiquette

When acting on EFH for the user:

- **Always read the Bilaga `1 - Faktura.htm` first** to understand what
  the invoice is for. Summarize in plain language for the user.
- **Always cross-reference `project-accounts.yaml`** to propose a Proj.
  If multiple rules match, list them; let the user pick.
- **Compose the comment** using the templates from the project-accounts
  YAML's `agent-written comments` examples. Keep it short and factual.
- **Stop before clicking any approval button.** Output everything as
  a `kth efh suggest` JSON proposal. The user reads it and either
  runs the corresponding write command themselves or opens the UI.
- **Never auto-handle multi-project splits.** Hand back to the user.
- **Watch for conflict-of-interest signals** (supplier name matches
  user's name or known relatives; flag the invoice with `--coi-risk`
  in the suggest output).
