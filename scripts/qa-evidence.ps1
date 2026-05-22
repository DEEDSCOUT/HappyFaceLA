param([string]$EvidenceDir = "C:\HappyFaceLA\docs\seo\evidence\production\2026-05-22")

$sitemapLocs = @(
  "https://happyfacesla.com/",
  "https://happyfacesla.com/balloon-twisting-los-angeles/",
  "https://happyfacesla.com/booking-policy/",
  "https://happyfacesla.com/contact/",
  "https://happyfacesla.com/face-gems-face-jewelry-los-angeles/",
  "https://happyfacesla.com/face-painting-los-angeles/",
  "https://happyfacesla.com/faq/",
  "https://happyfacesla.com/gallery/",
  "https://happyfacesla.com/glitter-tattoos-los-angeles/",
  "https://happyfacesla.com/pricing/",
  "https://happyfacesla.com/privacy-policy/",
  "https://happyfacesla.com/services/"
)

$banned = @(
  "cosmetic-grade","skin-safe","body-safe","safe adhesive",
  "easy removal","Easy removal","wash off","washes off",
  "lasts 1","lasting 1","wear time",
  "Body Art Insurance","COI availability","COI available","Insured through",
  "coming soon","TBD_BY_OWNER","owner replacement","placeholder"
)

$batch1 = @(
  @{slug="services";                          path="/services/"},
  @{slug="contact";                           path="/contact/"},
  @{slug="pricing";                           path="/pricing/"},
  @{slug="face-painting-los-angeles";         path="/face-painting-los-angeles/"},
  @{slug="balloon-twisting-los-angeles";      path="/balloon-twisting-los-angeles/"},
  @{slug="glitter-tattoos-los-angeles";       path="/glitter-tattoos-los-angeles/"},
  @{slug="face-gems-face-jewelry-los-angeles";path="/face-gems-face-jewelry-los-angeles/"},
  @{slug="gallery";                           path="/gallery/"}
)

Write-Host "LOCAL HEAD: $(git -C C:\HappyFaceLA rev-parse HEAD)"
Write-Host ""
Write-Host "=== BATCH 1 EVIDENCE ANALYSIS ==="
Write-Host "Evidence source: $EvidenceDir"
Write-Host ""

foreach ($page in $batch1) {
  $file = "$EvidenceDir\$($page.slug).html"
  if (-not (Test-Path $file)) { Write-Host "MISSING: $file"; continue }

  $html = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)

  $robots    = [regex]::Match($html, '<meta[^>]+name=["\x27]robots["\x27][^>]*/?>', "IgnoreCase").Value
  $canonical = [regex]::Match($html, 'href="([^"]+)"[^>]*rel="canonical"').Groups[1].Value
  if (-not $canonical) {
    $canonical = [regex]::Match($html, 'rel="canonical"[^>]*href="([^"]+)"').Groups[1].Value
  }
  $title     = [regex]::Match($html, '<title>([^<]+)</title>').Groups[1].Value
  $h1Raw     = [regex]::Match($html, '<h1[^>]*>([\s\S]*?)</h1>').Groups[1].Value
  $h1        = ($h1Raw -replace '<[^>]+>','' -replace '\s+',' ').Trim()
  $ogImage   = [regex]::Match($html, 'property="og:image"\s+content="([^"]+)"').Groups[1].Value
  if (-not $ogImage) {
    $ogImage = [regex]::Match($html, 'content="([^"]+)"\s+property="og:image"').Groups[1].Value
  }
  $inSitemap = ($sitemapLocs -contains "https://happyfacesla.com$($page.path)")

  $found = @()
  foreach ($p in $banned) {
    if ([regex]::IsMatch($html, [regex]::Escape($p), "IgnoreCase")) { $found += $p }
  }
  $bannedResult = if ($found.Count -eq 0) { "NONE (PASS)" } else { "FAIL: $($found -join ' | ')" }

  Write-Host "PAGE: $($page.path)"
  Write-Host "  HTTP:      200 (saved)"
  Write-Host "  Robots:    $robots"
  Write-Host "  Canonical: $canonical"
  Write-Host "  Title:     $title"
  Write-Host "  H1:        $h1"
  Write-Host "  OG Image:  $ogImage"
  Write-Host "  Sitemap:   $(if ($inSitemap) { 'YES (PASS)' } else { 'ABSENT (FAIL)' })"
  Write-Host "  Banned:    $bannedResult"
  Write-Host ""
}

Write-Host ""
Write-Host "=== THIN / NOINDEX ROUTE ANALYSIS ==="
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$thin = @(
  "/share-your-experience/",
  "/kids-birthday-party-entertainment-los-angeles/",
  "/school-festival-face-painting-los-angeles/",
  "/corporate-event-face-painting-los-angeles/",
  "/service-areas/",
  "/service-areas/burbank/",
  "/service-areas/glendale/",
  "/service-areas/pasadena/",
  "/service-areas/sherman-oaks/",
  "/service-areas/studio-city/",
  "/service-areas/encino/",
  "/service-areas/los-angeles/"
)

foreach ($path in $thin) {
  $url = "https://happyfacesla.com${path}?cb=${ts}e"
  try {
    $resp = Invoke-WebRequest -Uri $url -Headers @{"Cache-Control"="no-cache,no-store";"Pragma"="no-cache"} -UserAgent "evidence-bot-$ts" -MaximumRedirection 5 -TimeoutSec 20
    $html = $resp.Content
    $slug = $path.Trim("/") -replace "/","-"
    $html | Set-Content -Path "$EvidenceDir\noindex-$slug.html" -Encoding UTF8
    $robots = [regex]::Match($html, '<meta[^>]+name=["\x27]robots["\x27][^>]*/?>', "IgnoreCase").Value
    $inSitemap = ($sitemapLocs -contains "https://happyfacesla.com$path")
    Write-Host "${path}"
    Write-Host "  HTTP: $($resp.StatusCode) | Robots: $robots"
    Write-Host "  Sitemap: $(if ($inSitemap) { 'PRESENT (FAIL)' } else { 'ABSENT (PASS)' })"
  } catch {
    Write-Host "${path}: ERROR $_"
  }
}
Write-Host ""
Write-Host "=== COMPLETE ==="
