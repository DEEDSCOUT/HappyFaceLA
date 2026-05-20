# Customer Review Collection Flow

Legally and ethically compliant procedure for collecting and publishing real
Happy Faces LA customer testimonials. Follow this every time. Never deviate.

## Rules

1. **No fabricated, AI-generated, paraphrased, or unverified reviews.** Ever.
2. Every entry in [src/data/testimonials.ts](../../src/data/testimonials.ts)
   must have `permissionConfirmed: true`, a `permissionGrantedOn` date, and a
   `consentMethod`.
3. Keep the original written proof of permission (screenshot, email, SMS
   export) in a private location outside the repo for at least 3 years.
4. If a customer revokes permission, remove the entry within 24 hours.

## Two valid sources

### A. Public Google Business Profile review

If the customer left a public 5★ review on the Happy Faces LA Google Business
Profile, that review is already publicly attributed to them by Google. You may
republish the quote on happyfacesla.com with:

- `source: "Google Review"`
- `sourceUrl: <link to the GBP review or profile>`
- `consentMethod: "Google review (public)"`
- `permissionGrantedOn`: the date you copied it (the review's public date is
  also acceptable)

Use the customer's Google display name as `firstName` (first name only, or
`First L.` if the surname initial is visible publicly).

> Preferred path going forward: the `/api/google-reviews` Pages Function auto-
> pulls these from the Google Business Profile, so you usually don't need to
> hand-add them to `testimonials.ts`.

### B. Private feedback (SMS / email / direct message)

If the quote came from a private channel, you MUST get explicit written
permission before publishing. Use the template below.

## SMS / email request template

> Hi {first name}, this is {owner name} from Happy Faces LA. Thank you so much
> for trusting us with {event}! Would you be open to two quick things?
>
> 1. A short Google review — it genuinely helps other LA families find us:
>    {google review link}
> 2. May we feature your kind words on happyfacesla.com? We'd show only your
>    first name and city (e.g. "{first name} — {city}"). Reply YES and the
>    quote you're comfortable with, or just reply NO and we won't.
>
> Either way, thank you! — {owner name}

Save the customer's YES reply (screenshot or forwarded email) before adding
the entry. The exact wording of "YES" must be unambiguous — "sure" or 👍 also
count, vague replies do not.

## Adding the entry

After permission is recorded, add to `src/data/testimonials.ts`:

```ts
{
  firstName: "Jessica",
  cityOrArea: "Sherman Oaks",
  eventType: "6th birthday party",
  quote: "Exactly as the customer wrote it — no edits beyond removing typos or PII.",
  dateLabel: "May 2026",
  source: "Direct feedback",
  consentMethod: "SMS reply",
  permissionGrantedOn: "2026-05-18",
  permissionConfirmed: true,
}
```

Quote-editing rules:

- You MAY fix typos, capitalization, and obvious autocorrect mistakes.
- You MAY remove last names, addresses, phone numbers, or anything that would
  identify a child.
- You MAY shorten with `…` for length, but the meaning must stay identical.
- You MAY NOT add words, change sentiment, combine multiple customers, or
  make the review more enthusiastic than the original.

## Publishing checklist

- [ ] Permission recorded with date and method.
- [ ] Proof of permission saved outside the repo.
- [ ] Entry added with `permissionConfirmed: true`.
- [ ] `npm run build` passes.
- [ ] Reviews redirect in `public/_redirects` removed once 3+ entries exist.
- [ ] PROJECT_ROADMAP.md updated.
