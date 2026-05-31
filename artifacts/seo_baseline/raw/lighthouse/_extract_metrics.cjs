// Extract all required performance fields from Lighthouse JSON files
// Output: NDJSON to stdout, one line per file
const fs = require('fs');
const path = require('path');
const dir = process.argv[2] || '.';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));

function num(v) { return v === undefined || v === null ? null : v; }

for (const f of files.sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const a = j.audits || {};
    const cat = j.categories || {};
    const perfCat = cat.performance ? Math.round(cat.performance.score * 100) : null;
    const seoCat = cat.seo ? Math.round(cat.seo.score * 100) : null;
    const a11yCat = cat.accessibility ? Math.round(cat.accessibility.score * 100) : null;
    const bpCat = cat['best-practices'] ? Math.round(cat['best-practices'].score * 100) : null;

    // LCP element (Lighthouse 13.x uses lcp-discovery-insight)
    let lcpElement = null;
    const lcpDisc = a['lcp-discovery-insight'];
    if (lcpDisc?.details?.items) {
        for (const it of lcpDisc.details.items) {
            if (it.type === 'node' && it.snippet) { lcpElement = it.snippet; break; }
        }
    }
    if (!lcpElement) {
        const lcpEl = a['largest-contentful-paint-element'];
        lcpElement = lcpEl?.details?.items?.[0]?.node?.snippet ||
            lcpEl?.details?.items?.[0]?.items?.[0]?.node?.snippet || null;
    }

    // Layout shift sources
    const cls = a['layout-shifts'] || a['layout-shift-elements'];
    const clsCount = cls?.details?.items?.length || 0;
    const clsTopSource = cls?.details?.items?.[0]?.node?.snippet || null;

    // Render-blocking resources
    const rbr = a['render-blocking-resources'];
    const rbrCount = rbr?.details?.items?.length || 0;
    const rbrSavingsMs = rbr?.details?.overallSavingsMs || 0;

    // Network requests / byte totals
    const reqs = a['network-requests']?.details?.items || [];
    let totalBytes = 0, jsBytes = 0, imgBytes = 0, thirdPartyBytes = 0;
    const finalUrl = j.finalDisplayedUrl || j.finalUrl || '';
    const finalHost = finalUrl ? new URL(finalUrl).hostname : '';
    for (const r of reqs) {
        const tx = r.transferSize || 0;
        totalBytes += tx;
        if (r.resourceType === 'Script') jsBytes += tx;
        if (r.resourceType === 'Image') imgBytes += tx;
        try {
            const reqHost = new URL(r.url).hostname;
            if (reqHost && finalHost && !reqHost.endsWith(finalHost.replace(/^www\./, ''))) {
                thirdPartyBytes += tx;
            }
        } catch (e) { }
    }

    // Console errors
    const errs = a['errors-in-console']?.details?.items || [];
    const consoleErrors = errs.length;

    // Document latency / TTFB
    const serverResponse = a['server-response-time']?.numericValue || null;

    const row = {
        file: f,
        finalUrl,
        perf: perfCat,
        seo: seoCat,
        a11y: a11yCat,
        bp: bpCat,
        LCP_ms: num(a['largest-contentful-paint']?.numericValue),
        CLS: num(a['cumulative-layout-shift']?.numericValue),
        TBT_ms: num(a['total-blocking-time']?.numericValue),
        FCP_ms: num(a['first-contentful-paint']?.numericValue),
        SI_ms: num(a['speed-index']?.numericValue),
        TTFB_ms: serverResponse,
        totalBytes,
        jsBytes,
        imageBytes: imgBytes,
        thirdPartyBytes,
        jsExecMs: num(a['bootup-time']?.numericValue),
        lcpElement: lcpElement ? lcpElement.substring(0, 200) : null,
        clsSourceCount: clsCount,
        clsTopSource: clsTopSource ? clsTopSource.substring(0, 200) : null,
        renderBlockingCount: rbrCount,
        renderBlockingSavingsMs: rbrSavingsMs,
        consoleErrorCount: consoleErrors
    };
    console.log(JSON.stringify(row));
}
