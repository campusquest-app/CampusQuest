# Partner hours review (admin)

CampusQuest never invents opening hours. `getPartnerOpenStatus` shows **Hours Unavailable** until a listing has structured `hours` from:

1. `lib/partners/partnerDirectory.ts` (confirmed with `source` + `checkedOn`), or
2. `partner_profile_overrides.hours` saved by an approved business manager via the Local Business profile editor.

Timezone for URI-area businesses: **America/New_York**. Weekly arrays are Sunday-first.

## International Pocket Café (`international-pocket-cafe`)

- CampusQuest listing address: **99 Fortin Rd, Kingston, RI**
- Directory `hours`: **null** (not hardcoded)
- Community / detail UI: shows **Hours Unavailable** until hours are confirmed for this Kingston listing

### Candidate source (needs admin confirmation)

Published on [internationalpocketcafe.com](https://internationalpocketcafe.com/) under “Hours of Operation” (checked 2026-11-14):

| Day | Published |
| --- | --- |
| Monday – Friday | 11am – 9pm |
| Saturday | 11am – 8:00pm |
| Sunday | Closed |

**Caution:** The same page lists Middletown-oriented social links (Facebook / Instagram / Yelp Middletown) and phone `(401) 847-8900`. Do **not** copy these into the Kingston Fortin Road listing until the business confirms they apply to that location.

### How to publish after confirmation

Preferred: business manager signs in → Local Business profile → set hours (same open/close every day today), which writes `partner_profile_overrides.hours`.

For Mon–Fri / Sat / Sunday-closed schedules, an admin can add a confirmed `hours` object to the directory entry (or improve the per-day editor later), with `source` and `checkedOn` filled in — never silently.

### Suggested directory shape (only after Kingston confirmation)

```ts
hours: {
  timeZone: "America/New_York",
  weekly: [
    [], // Sunday closed
    [{ open: "11:00", close: "21:00" }],
    [{ open: "11:00", close: "21:00" }],
    [{ open: "11:00", close: "21:00" }],
    [{ open: "11:00", close: "21:00" }],
    [{ open: "11:00", close: "21:00" }],
    [{ open: "11:00", close: "20:00" }], // Saturday
  ],
  source: "International Pocket Café website Hours of Operation (Kingston-confirmed)",
  checkedOn: "YYYY-MM-DD",
}
```
