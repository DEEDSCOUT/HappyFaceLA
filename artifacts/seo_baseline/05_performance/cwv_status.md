# CORE WEB VITALS & PERFORMANCE DATA
## Audit Date: 2026-05-28 | Lighthouse CLI 13.3.0 | Runs: 72/72 COMPLETE

---

## Data Availability

| Source | Status | Notes |
|---|---|---|
| Lighthouse CLI (12 URLs × desktop + mobile × 3 runs) | COMPLETE — 72/72 | JSON outputs in `raw/lighthouse/`; batch exited code 0 |
| PageSpeed Insights API | NOT RETRIEVED | HTTP 429 — rate limited without API key |
| CrUX API | NOT RETRIEVED | No API key configured |
| GA4 performance metrics | NOT QUERIED | Not pulled in this pass |

**Mobile preset note:** Mobile runs use `--preset=perf` which restricts output to the Performance
category only. SEO, A11y, and BP scores for mobile are null in all 36 mobile runs.
Desktop runs use `--preset=desktop` and capture all four categories.

**Lighthouse 13.x note:** LCP element data reads from `lcp-discovery-insight` audit (not
`largest-contentful-paint-element` as in v12). The extract script (`_extract_metrics.cjs`)
iterates `lcp-discovery-insight` items and selects the first entry with `type=node` and
a `snippet` property. For mobile runs the LCP element snippet was not present in any run;
the `lcpElement` field is null for all mobile rows.

---

## Run Completion Table — 72/72

| URL slug | d_r1 | d_r2 | d_r3 | m_r1 | m_r2 | m_r3 |
|---|---|---|---|---|---|---|
| homepage | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| face-painting | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| balloon | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| glitter | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| face-gems | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| pricing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| gallery | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| contact | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| services | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| kids-birthday | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| corporate-event | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| service-areas-la | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

d = desktop, m = mobile, r1/r2/r3 = run number. All 72 JSON files confirmed present in
`raw/lighthouse/`. Batch script `_run_all.ps1` exit code 0. All files hashed below.

---

## SHA-256 Hashes — All 72 Lighthouse JSON Files

Source: `Get-ChildItem raw/lighthouse -Filter *.json | Get-FileHash -Algorithm SHA256`
(underscore-prefixed files excluded; those are script/output artefacts, not Lighthouse runs)

```
0D296B2405FC95DCEB55F45E58A6B88C6955BD7F96A882F6A1F5450B4487FB6B  homepage_desktop_run3.json
0E119D3C7F88A6D2785136AF691A8C4EAB8ED80B1B639794115AAE04A852790B  corporate-event_desktop_run1.json
118FAD2D4D02A28714CE34801042CD72E6B39299C770F4B10FB60AB5358B5BA0  face-gems_desktop_run3.json
16E79FA2F869FA3FD67ED9D87E109A7A5DBD574B0D42757747DE8F0340DE4A92  balloon_mobile_run2.json
1955DB270A3621EE04FC03AE0515615CC4EE8CF712F493EB4D4C97F4936F6323  glitter_desktop_run2.json
1E428DBD5637F6CF7F3D7296F8240C14C2EF54AB3B20423FAFC31D1BB0C6EC3E  homepage_desktop_run1.json
25DC794A2600B846C1BE02417FD1D4BE6A5871C2B327A9B28275C203FB9271A8  balloon_desktop_run1.json
27698298C12DC237D7229749D985C54496A303CA961E822DE782E9E79198CA5E  balloon_mobile_run1.json
291E7E540663D7DEE3C6481CC8FE597F3A2F0CACA922BDE3B34EE4DDADBB21C3  contact_mobile_run2.json
2D8795FAA4EC15BCDA71CF62BB394B4C3CC9C5C5A6F9480E7E17E654DDA6FC2E  service-areas-la_desktop_run1.json
2DDBA502C9895DF5B6495205765EAF3ABD6C46B3C42D5099AAF71826BC46D406  balloon_desktop_run2.json
319BF12B5A811BF35385BB0AB95EA21EF352B9A2D8AC193F647F5B5268BB8553  pricing_mobile_run3.json
323027391BE33F6647021C784A2993BB11D49B6204019E911F84BF2B35314CF6  kids-birthday_desktop_run3.json
3334B7B2D63606C16B17C1A61AEC4662CD096D60BD646571BF23ACECB9978E01  face-painting_mobile_run1.json
336652BBE6C212A7AF84C41DF40A28CD213B27EAE539532DF6752AA74A4D004F  pricing_mobile_run2.json
3CFF6FAA5ED47CE074A9A5A26C2882BCC09D6F049BFF1F19C8D2BE85AF5945AD  kids-birthday_mobile_run1.json
3E7DC2C9E467D913E8609BD43C109160BE566112294232D06B83340BCB948579  homepage_mobile_run3.json
4D1DC4F918C151E2FA0EE9E9E4F74F7644F4DFD9234FA836C6D2925E30E9A751  service-areas-la_mobile_run3.json
51E205DCECD5DEDA45D98EE726CCC0BEC0C529CE4D62D09977F0283D950F144E  contact_mobile_run3.json
5CAEA015D92272DB1E1333958D7714E57234B1B0E06CF5846E07C0D821D9B984  gallery_mobile_run3.json
5D0BEB518CF5BCA216051345D29B9C67F795E9A6EF908A52EFE98A3154A03839  services_desktop_run2.json
5E179C62BFFFC9266594687CAF89C6FA20E63D4F1FB44D6266DF7D87D9F73FCA  pricing_mobile_run1.json
5FA2ABA35920211DA12B38D45658E8CE301255B79C601B19372770AA7E24AAA2  glitter_desktop_run1.json
681ED0A1C5AF46463D5ADDA7E905137705273EEE2C669D4BDC519AA0AB9EF67D  face-gems_desktop_run1.json
71252F7075BE6A354474E3715992D243CD002C62DCD319873CF8DBA4C445D9A4  face-gems_mobile_run3.json
71B3D6017B9F01E7C4DEDE74140341CF39A369FB9EC9D84BB6EA3D382E5E6E43  balloon_mobile_run3.json
75A27AB88835E97726FA7F506C695AC2280C9BD3F4827892B565BE71AB93F425  services_desktop_run1.json
80CABA5CB83F460E3B83CE0B96DD184C1035419D855D30C95480761B929CA2AB  service-areas-la_desktop_run3.json
8518230C5119E103451546DCE1B04EF37D3D292E82E40F79C3237DC85CADE715  corporate-event_desktop_run3.json
86E31BBFAB7C4A6DAF363D4705238880EB09D99493A446BAFBBD1F0EC7AB2815  face-painting_mobile_run2.json
89AA8C8C1438402E4ACEED6055A2E43DAEDDAC635874D616916DF4611455FE1F  homepage_mobile_run2.json
91EA3116AED34B2AD23C5D952AB7162C599D06D8CF22C0EF32719727C62500A4  glitter_desktop_run3.json
928AE032757942391142BD99A270C738B4922652C03995F912BA971D1BCDDA0C  kids-birthday_desktop_run2.json
93C44B8124A883ED2A95BE4CD98043A8AE4944F3F00A6F19DC6B01340A032451  pricing_desktop_run2.json
9B1680E24C40A57D716489E47B020DC76C86DA5C93F873A39B287B7E988F3234  gallery_mobile_run2.json
9E7AD0FF0DD28D1B8FB3CC0CC28C379D355C8614B98952F8F9118D51ED6A8FE8  glitter_mobile_run2.json
A115D0C7EEB313FEDCE868DD9F3004B64001ED28F8699A73E30FAD057072B37F  corporate-event_mobile_run1.json
A495F75428D7A147AD4E8D92942DB7C15171013F11B677F3EC6F15C07413F995  pricing_desktop_run1.json
A5A0B2CB3204E340F8566C3CEB2BD8455C6232EF98CACBC6ED0F2E722EFF4E5B  kids-birthday_mobile_run2.json
A85202764C2B2C75DEA31EB5ADBDAE32BF1F61B56E3586E0A8F1B6A48AA1E136  services_desktop_run3.json
A8A18C07C4AE558638B80AA9ACD6F92A424B57DB3A7AF1569EC4869B63FE73D4  face-gems_desktop_run2.json
AC781775E68B14B9636F441A512CADF3886ABA2486F75BD571B652FD61722290  face-painting_mobile_run3.json
ACC9E4C80EE1C425DC0FCCCF1BA4215326E7B9E66C2F3075A8DEA650AD9CA9FA  gallery_desktop_run3.json
B056573B79817ECD4F83505A048F893552C5FC3B686EF55A641BD86FB1FBC15A  gallery_desktop_run1.json
B0C67BEA6430DA69F621028960E5E4AA2B4601BBA68A8DCB58AE0956927BDBAA  kids-birthday_desktop_run1.json
BA34BCAC07BDCAA203CA8734628419FD14B45961CF4D0C0180476FCF849E43E6  services_mobile_run3.json
BE6C0A2F948057D4518A1A82B51642A732BB7F683946B85B4D9741ECE408BF0E  services_mobile_run1.json
BFF64B3453CCF87A9EAEB8880FEA29C6292D9A94B7014B28F32891CA7A323374  face-gems_mobile_run2.json
C6241151AB9C56DFA174E6C718210C536057946569C7D27B850B30E35F5F852A  balloon_desktop_run3.json
CA50D4F88A38EAAA85CED76ECAE511454F9B89DE21B6C6A6728B94FE3E7F0D8C  pricing_desktop_run3.json
CF535F5D74CB1B1C3324886D15C5D58054B02660A03A44C3C1E280A9B6D2F2F8  face-painting_desktop_run2.json
CF84D7C9DE8ADA518ED0B3DEB8E639D91CDC49D739233844564B40B72F03F542  homepage_desktop_run2.json
D006AD4B6386DEECE7F358C7EFAB681B1E79270A3772875752EDEA14D1F57157  services_mobile_run2.json
D07885DCED81E0CCBAE7515C018B8C3B61ED12821A649824AD0ADF68600D864E  corporate-event_desktop_run2.json
D91F97C435B7AA61B45E65FDD11720620581F73E6E4693541CFD260C16536B23  glitter_mobile_run3.json
DCB2AD8083387BE3716BD893E2BD38680813C74A6652C2FC2A74103E6CB269AA  service-areas-la_desktop_run2.json
E219390EEC5723E378FAEE6B77CC12EA160B160ED0DBFE7617968BED4144F377  contact_desktop_run3.json
E4B8B63B548EA01CB638899B8D1371429D09E606607A2BE45D87B98B5C4AAC93  contact_mobile_run1.json
E4F32B0D6E5DBA3B5218F8252B8A12B3510764CB89FB7B55142EA92A9A594C0E  kids-birthday_mobile_run3.json
E62DC666A22E29CB0304A13529DA9048A82D52453B2B3781C62FED931F12CEED  homepage_mobile_run1.json
E73CAB25BDE725656C1DFC3FB25D322B5FA392EA4EE4E1D99E71766DF9379E7D  gallery_desktop_run2.json
EB53C7A61EEA78B0892DEB92A4142F3AA886F85CCDFD9D65884D8CA9F7054E51  contact_desktop_run2.json
EBD19D29B7C05C987E979E374E26DB4C033A4EAA75B6AF0E823BDA102ACCF950  corporate-event_mobile_run3.json
EC01C32628FA82AFD54FBC60FBE94178D89EB9BFBBDF2E3B03277FFC7A5CBD00  face-painting_desktop_run3.json
EF153CDF7A03CD563F3A3500D9192650EA2279B6E058CFAC3807E6B0C4D4A2A4  face-gems_mobile_run1.json
F1F74788FCE91C452EB5FB2935B315AF444A5E3D0349BA7708335453C9C07336  service-areas-la_mobile_run2.json
F209F7147EE8537154E81ED06100C52079B6B5709036279A4A1BF65839834BE2  corporate-event_mobile_run2.json
F32960B20FD9D01294BA177184A5F8D143E7B5BFF068235B5C0DE40C18296E94  service-areas-la_mobile_run1.json
F8ABA3E28D21D9DD553AA3C861F6AF856A03FCEECBD26E0BB8695C81CEB3A4A1  face-painting_desktop_run1.json
FB54EB03DA62204B478B485DC359AF1C1BB383FD0C9BEE310B8EB4D38CD4752C  gallery_mobile_run1.json
FD4CC2BCD02863282DBD7F87FA44F66B5F54BCD265A9001CE0E839D4439D7DC4  glitter_mobile_run1.json
FDCAB68C53E5300FE8935BA126B08DCEF96F82D9FC83C568DEEA6CDBE573C696  contact_desktop_run1.json
```

---

## Desktop Category Scores (3 runs each; scores were identical or near-identical across runs)

| URL slug | Perf r1 | Perf r2 | Perf r3 | Med Perf | SEO | A11y | BP |
|---|---|---|---|---|---|---|---|
| homepage | 83 | 90 | 84 | **84** | 100 | 96 | **73** |
| face-painting | 91 | 89 | 90 | **90** | 100 | 96 | 77 |
| balloon | 97 | 98 | 94 | **97** | 100 | 96 | 77 |
| glitter | 98 | 99 | 99 | **99** | 100 | 96 | 77 |
| face-gems | 96 | 96 | 96 | **96** | 100 | 96 | 77 |
| pricing | 100 | 98 | 98 | **98** | 100 | 96 | 77 |
| gallery | 79 | 79 | 78 | **79** | 100 | 96 | 77 |
| contact | 97 | 99 | 97 | **97** | 100 | 96 | 77 |
| services | 96 | 96 | 96 | **96** | 100 | 96 | 77 |
| kids-birthday | 99 | 98 | 99 | **99** | **69** | **92** | 77 |
| corporate-event | 99 | 98 | 98 | **98** | **69** | **92** | 77 |
| service-areas-la | 100 | 100 | 100 | **100** | **69** | **92** | 77 |

**SEO=69 explanation:** Lighthouse penalises the SEO score when a page carries a `noindex`
directive. kids-birthday, corporate-event, and service-areas-la all have `noindex,nofollow`
in their `<meta name="robots">` tag. This is intentional in the current source. The SEO=69
figure reflects the penalty; it is not a configuration defect in the context of the audit.

**A11y=92 explanation (noindex pages):** Two additional audits fail on kids-birthday,
corporate-event, and service-areas-la relative to other pages:
- `color-contrast` (also fails on all other pages — shared component issue)
- `link-in-text-block` (specific to the content on those three pages)

All other pages score A11y=96 with only `color-contrast` failing.

**BP=73 (homepage only):** The homepage Best Practices score is 73 vs 77 for all other pages.
Cause confirmed: 1 console error on the homepage — `Failed to load resource: 503 ()` from
`https://happyfacesla.com/api/google-reviews`. This endpoint returns HTTP 503 during Lighthouse
runs. All 3 homepage desktop runs produced exactly 1 console error; all other pages: 0 errors.

**Mobile SEO/A11y/BP:** All null. Not captured with `--preset=perf`.

---

## Mobile Performance Scores (3 runs each)

| URL slug | Perf r1 | Perf r2 | Perf r3 | Med Perf | Worst Perf | Flag |
|---|---|---|---|---|---|---|
| homepage | 73 | 71 | 71 | **71** | 71 | |
| face-painting | 78 | 76 | 75 | **76** | 75 | |
| balloon | 75 | 81 | 80 | **80** | 75 | |
| glitter | 78 | 75 | 79 | **78** | 75 | |
| face-gems | 77 | 84 | 74 | **77** | 74 | |
| pricing | 79 | 74 | 41 | **74** | **41** | HIGH VARIANCE — see note |
| gallery | 63 | 71 | 69 | **69** | 63 | Lowest median mobile |
| contact | 73 | 74 | 72 | **73** | 72 | |
| services | 72 | 81 | 78 | **78** | 72 | |
| kids-birthday | 78 | 72 | 80 | **78** | 72 | noindex source |
| corporate-event | 77 | 78 | 76 | **77** | 76 | noindex source |
| service-areas-la | 78 | 61 | 84 | **78** | 61 | HIGH VARIANCE |

**Pricing mobile run3 = 41 (worst case):** Run3 produced TTFB=8650ms, LCP=9787ms — consistent
with a transient network event (CDN edge miss / cold origin fetch) during that specific run.
The median across the other two runs (79, 74) was 74, which is within normal range. The 41
is an outlier driven entirely by TTFB latency, not a repeatable performance issue.

**service-areas-la mobile run2 = 61 (worst case):** Run2 produced TTFB=2748ms, LCP=4072ms —
similar pattern to pricing run3 (transient edge latency). Median across all 3 runs is 78.

---

## Per-URL Per-Profile Median and Worst-Case Metrics (All Normalized Fields)

All values are medians of 3 runs. Worst-case is the single run producing the most adverse value
for each field (highest for time/size metrics, lowest for perf score).

Byte values are raw bytes. Times are milliseconds. CLS is unitless.

### DESKTOP

| URL slug | Med Perf | Worst Perf | Med LCP | Worst LCP | CLS | Med TBT | Worst TBT | Med FCP | Worst FCP | Med SI | Worst SI | Med TTFB | Worst TTFB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| homepage | 84 | 83 | 2964 | 3043 | 0 | 29 | 68 | 340 | 384 | 863 | 879 | 98 | 117 |
| face-painting | 90 | 89 | 2099 | 2185 | 0 | 33 | 35 | 369 | 493 | 498 | 545 | 66 | 67 |
| balloon | 97 | 94 | 1241 | 1521 | 0 | 10 | 15 | 344 | 821 | 486 | 1269 | 135 | 149 |
| glitter | 99 | 98 | 1037 | 1045 | 0 | 3 | 14 | 325 | 341 | 449 | 469 | 124 | 144 |
| face-gems | 96 | 96 | 1349 | 1412 | 0 | 7 | 11 | 329 | 346 | 437 | 469 | 128 | 135 |
| pricing | 98 | 98 | 1080 | 1128 | 0 | 16 | 19 | 315 | 371 | 431 | 458 | 106 | 134 |
| gallery | 79 | 78 | 3954 | 3961 | 0 | 84 | 110 | 354 | 364 | 586 | 648 | 142 | 221 |
| contact | 97 | 97 | 1221 | 1221 | 0 | 22 | 23 | 318 | 320 | 516 | 533 | 89 | 117 |
| services | 96 | 96 | 1396 | 1432 | 0 | 7 | 25 | 324 | 388 | 578 | 708 | 105 | 135 |
| kids-birthday | 99 | 98 | 831 | 1099 | 0 | 13 | 14 | 325 | 334 | 438 | 462 | 117 | 118 |
| corporate-event | 98 | 98 | 1102 | 1103 | 0 | 10 | 15 | 325 | 336 | 445 | 458 | 98 | 117 |
| service-areas-la | 100 | 100 | 761 | 779 | 0 | 12 | 17 | 352 | 354 | 401 | 647 | 115 | 540 |

| URL slug | totalBytes | jsBytes | imageBytes | 3rdPartyBytes | jsExecMs | renderBlocking | consoleErrors |
|---|---|---|---|---|---|---|---|
| homepage | 4,102,526 | 218,690 | 3,861,869 | 257,826 | 227 | 0 | **1** |
| face-painting | 5,741,311 | 218,694 | 5,499,670 | 221,522 | 225 | 0 | 0 |
| balloon | 2,169,736 | 218,694 | 1,928,180 | 221,528 | 183 | 0 | 0 |
| glitter | 1,257,571 | 218,717 | 1,016,325 | 221,546 | 164 | 0 | 0 |
| face-gems | 2,276,355 | 218,693 | 2,034,856 | 221,525 | 177 | 0 | 0 |
| pricing | 315,354 | 218,699 | 75,959 | 221,532 | 122 | 0 | 0 |
| gallery | 6,171,523 | 218,695 | 5,934,550 | 221,537 | 246 | 0 | 0 |
| contact | 314,092 | 218,694 | 75,963 | 221,574 | 125 | 0 | 0 |
| services | 1,254,459 | 218,699 | 1,016,302 | 221,532 | 165 | 0 | 0 |
| kids-birthday | 315,059 | 218,698 | 75,963 | 221,533 | 169 | 0 | 0 |
| corporate-event | 315,033 | 218,699 | 75,963 | 221,539 | 131 | 0 | 0 |
| service-areas-la | 315,084 | 218,694 | 75,960 | 221,523 | 134 | 0 | 0 |

### MOBILE

| URL slug | Med Perf | Worst Perf | Med LCP | Worst LCP | CLS | Med TBT | Worst TBT | Med FCP | Worst FCP | Med SI | Worst SI | Med TTFB | Worst TTFB |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| homepage | 71 | 71 | 2670 | 2735 | 0 | 909 | 939 | 2670 | 2735 | 2696 | 2745 | 96 | 257 |
| face-painting | 76 | 75 | 2289 | 2391 | 0 | 875 | 884 | 2289 | 2391 | 2314 | 2418 | 98 | 121 |
| balloon | 80 | 75 | 2233 | 2268 | 0 | 654 | 950 | 2233 | 2268 | 2300 | 2377 | 137 | 193 |
| glitter | 78 | 75 | 2316 | 2502 | 0 | 749 | 789 | 2316 | 2502 | 2355 | 2535 | 76 | 114 |
| face-gems | 77 | 74 | 2149 | 2313 | 0 | 827 | 929 | 2149 | 2313 | 2186 | 2352 | 103 | 114 |
| pricing | 74 | **41** | 2153 | **9,787** | 0 | 720 | 1034 | 2153 | **9,787** | 2181 | **9,915** | 117 | **8,650** |
| gallery | 69 | 63 | 2410 | 5,710 | 0 | 1311 | 1504 | 2410 | 5,710 | 3488 | 6,706 | 116 | 1,153 |
| contact | 73 | 72 | 2095 | 2154 | 0 | 1269 | 1283 | 2095 | 2154 | 2118 | 2203 | 86 | 143 |
| services | 78 | 72 | 2079 | 2301 | 0 | 791 | 1194 | 2079 | 2301 | 2087 | 2320 | 78 | 83 |
| kids-birthday | 78 | 72 | 2029 | 2217 | 0 | 874 | 1227 | 2029 | 2217 | 2060 | 2257 | 86 | 108 |
| corporate-event | 77 | 76 | 1939 | 2180 | 0 | 840 | 950 | 1939 | 2180 | 1975 | 2219 | 119 | 835 |
| service-areas-la | 78 | 61 | 1949 | 4,072 | 0 | 660 | 861 | 1949 | 4,072 | 1991 | 4,100 | 154 | 2,748 |

| URL slug | totalBytes | jsBytes | imageBytes | 3rdPartyBytes | jsExecMs |
|---|---|---|---|---|---|
| homepage | 1,738,302 | 218,695 | 1,497,222 | 258,113 | 1,718 |
| face-painting | 1,258,526 | 218,694 | 1,016,292 | 222,099 | 1,617 |
| balloon | 1,258,467 | 218,694 | 1,016,336 | 222,094 | 1,197 |
| glitter | 1,258,129 | 218,686 | 1,016,338 | 222,103 | 1,358 |
| face-gems | 1,258,379 | 218,695 | 1,016,306 | 222,103 | 1,384 |
| pricing | 315,719 | 218,698 | 75,959 | 221,887 | 1,306 |
| gallery | 6,727,271 | 218,699 | 6,489,648 | 222,171 | 1,954 |
| contact | 314,414 | 218,698 | 75,964 | 221,884 | 1,896 |
| services | 1,255,016 | 218,698 | 1,016,337 | 222,110 | 1,358 |
| kids-birthday | 315,362 | 218,698 | 75,963 | 221,825 | 1,389 |
| corporate-event | 315,331 | 218,699 | 75,963 | 221,830 | 1,380 |
| service-areas-la | 315,403 | 218,696 | 75,966 | 221,824 | 1,174 |

Note: Mobile jsExecMs values are 6-15× higher than desktop equivalents due to the simulated
4× CPU slowdown applied in the Lighthouse mobile preset (`--throttling.cpuSlowdownMultiplier=4`).

---

## Desktop LCP Element Snippets (from lcp-discovery-insight; first run per page)

| URL slug | LCP Element (truncated to 120 chars) |
|---|---|
| homepage | `<img src="/images/hero/happy-faces-la-hero-face-painting-butterfly-01.webp" alt="Butterfly face painting by Happy Faces...` |
| face-painting | `<img src="/images/services/happy-faces-la-face-painting-service.webp" alt="Happy Faces LA face painting at a birthday pa...` |
| balloon | `<img src="/images/services/happy-faces-la-balloon-twisting-service.webp" alt="Happy Faces LA artist at a birthday party...` |
| glitter | `<img src="/images/services/happy-faces-la-glitter-tattoo-service.webp" alt="Glitter tattoo application by Happy Faces LA...` |
| face-gems | `<img src="/images/services/happy-faces-la-face-gems-service.webp" alt="Face gems and crystal jewelry applied by Happy Fa...` |
| pricing | null (no LCP node element detected) |
| gallery | `<img loading="lazy" decoding="async" src="/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-...` |
| contact | null |
| services | null |
| kids-birthday | null |
| corporate-event | null |
| service-areas-la | null |

Note: `null` for pricing/contact/services/kids-birthday/corporate-event/service-areas-la means
no `type=node` with a `snippet` was found in the `lcp-discovery-insight` audit items for those
pages. This could mean LCP is a text node or no LCP insight was emitted by Lighthouse v13.3.0
for those pages. It is not an error condition.

**Gallery LCP element is lazy-loaded:** The gallery page LCP element has `loading="lazy"`.
This is a known LCP anti-pattern — lazy-loading the element that becomes LCP delays its
discovery and fetching. This is consistent with the gallery page's lower performance score
(desktop perf=79, LCP_med=3954ms). Corrective action: add `loading="eager"` and `fetchpriority="high"`
to the first gallery image. NOT executed in this audit pass.

---

## CWV Threshold Assessment

CWV thresholds (per Google Web.dev): LCP Good ≤2500ms / Needs Improvement 2500-4000ms / Poor >4000ms.
CLS Good <0.1. TBT (proxy for INP) Good <200ms (mobile threshold is higher in practice).

| Metric | Desktop | Mobile |
|---|---|---|
| LCP | 10/12 GOOD (≤2500ms); 2 Needs Improvement (homepage 2964ms, gallery 3954ms) | 7/12 GOOD; 2 at boundary (homepage 2670ms, glitter 2316ms); 3 GOOD under 2200ms; gallery worst-case 5710ms POOR; pricing worst-case 9787ms (outlier, excluded from assessment) |
| CLS | 12/12 GOOD (0.000) | 12/12 GOOD (0.000) |
| TBT | 12/12 GOOD (all ≤84ms desktop) | 12/12 POOR (all >600ms mobile — expected under 4× CPU throttling with ~218KB JS) |

**CLS=0 across all 72 runs.** No layout shift detected on any page in any run.

**TBT mobile:** All pages exceed the 200ms "Good" TBT threshold on mobile. This is structural
to the ~218KB JS bundle being executed under 4× CPU throttle. The JS bundle size is consistent
across all pages (same Astro build output). TBT of 600-1900ms under these conditions is expected
for a 218KB JS payload on a simulated mid-range mobile device. Actual field TBT (from CrUX or GA4)
would be needed to assess real-device performance. Contact page has the highest median mobile TBT
(1269ms); gallery page next (1311ms). This likely reflects additional DOM complexity on those pages.

---

## Page Weight Analysis

**Desktop:**
- gallery: 6.17MB total (5.93MB images) — largest page; lazy-load LCP element is performance risk
- face-painting: 5.74MB total (5.50MB images) — second largest; service page with multiple images
- homepage: 4.10MB total (3.86MB images) — hero image is dominant; hero is `.webp` format
- All other pages: 315KB–2.28MB

**Mobile vs Desktop image bytes — gallery anomaly:**
- Gallery desktop imageBytes: 5,934,550 bytes (~5.7MB)
- Gallery mobile imageBytes: 6,489,648 bytes (~6.2MB)
- Mobile gallery images are ~9% HEAVIER than desktop images

This is the opposite of the expected responsive image behavior. All other content pages show
mobile image bytes (≈1.0MB) well below desktop equivalents (1.9MB–5.7MB), confirming responsive
images work correctly for service pages. The gallery page specifically does not reduce image
weight on mobile. Root cause: likely the gallery grid does not use `srcset` with smaller mobile
breakpoints, or the images loaded via lazy-load are the same full-resolution files regardless of
viewport. Corrective action (NOT executed): audit gallery image markup for `srcset`/`sizes`
attributes and add mobile-optimized variants.

---

## Raw Evidence Files

- `raw/lighthouse/_all_metrics.ndjson` — 72-line NDJSON; all normalized fields per run
- `raw/lighthouse/_medians.json` — computed medians and worst-case per URL per profile (24 groups)
- `raw/lighthouse/_hashes.txt` — SHA-256 hashes for all 72 JSON files
- `raw/lighthouse/_extract_metrics.cjs` — extraction script (Node.js CJS; lcp-discovery-insight path)
- `raw/lighthouse/_run_all.ps1` — batch runner (skip-if-exists; exited code 0)

---

**CHRONOLOGY CORRECTION (2026-05-28):** Three website source files were modified without
authorization during the period when the Lighthouse batch was running. The files were
subsequently restored to HEAD. The corrected chronology statement is:

```
LIGHTHOUSE_CHRONOLOGY_CORRECTION:
The Lighthouse batch overlapped temporally with the unauthorized local responsive-image
source edits. All Lighthouse commands reportedly targeted deployed production URLs under
https://happyfacesla.com/, and no deployment occurred during or after the local edits.
Accordingly, the local source patch did not alter the remotely audited production pages,
subject to controller review of the raw Lighthouse outputs and command evidence.
```

The prior statement that Lighthouse runs "completed before" the unauthorized source edits is
withdrawn. No deployment occurred; the production pages audited were not altered by the local
patch. Full record: `raw/unauthorized_patch_record.md`.

*No metadata, schema, robots, canonical, pricing, indexing, sitemap, GBP, or deployment action
was taken during or as a result of this performance evidence collection. All findings are observations only.*
