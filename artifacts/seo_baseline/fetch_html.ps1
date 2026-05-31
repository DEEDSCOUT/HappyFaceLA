$urls = @(
    @{slug="balloon-twisting-los-angeles"; url="https://happyfacesla.com/balloon-twisting-los-angeles/"},
    @{slug="glitter-tattoos-los-angeles"; url="https://happyfacesla.com/glitter-tattoos-los-angeles/"},
    @{slug="face-gems-face-jewelry-los-angeles"; url="https://happyfacesla.com/face-gems-face-jewelry-los-angeles/"},
    @{slug="gallery"; url="https://happyfacesla.com/gallery/"},
    @{slug="contact"; url="https://happyfacesla.com/contact/"}
)
$dir = "C:\HappyFaceLA\artifacts\seo_baseline\raw\html"
New-Item -ItemType Directory -Path $dir -Force | Out-Null
foreach ($u in $urls) {
    $r = Invoke-WebRequest -Uri $u.url -UseBasicParsing -UserAgent "Mozilla/5.0 (compatible; HFLA-SEO-Audit/1.0)"
    Set-Content -Path "$dir\$($u.slug).html" -Value $r.Content -Encoding UTF8
    Write-Host "=== $($u.slug) ==="
    Write-Host "Status: $($r.StatusCode)"
    if ($r.Content -match '<title>(.*?)</title>') { Write-Host "Title: $($matches[1])" }
    if ($r.Content -match '<link rel=.canonical. href=.([^"]+).') { Write-Host "Canonical: $($matches[1])" }
    if ($r.Content -match '<meta name=.robots. content=.([^"]+).') { Write-Host "Robots: $($matches[1])" }
    if ($r.Content -match '(?s)<h1[^>]*>(.*?)</h1>') { Write-Host "H1: $(($matches[1] -replace '<[^>]+>','').Trim())" }
    $ldCount = ([regex]'<script type=.application/ld\+json.>').Matches($r.Content).Count
    Write-Host "JSON-LD blocks: $ldCount"
    $types = ([regex]'"@type"\s*:\s*"([^"]+)"').Matches($r.Content) | ForEach-Object { $_.Groups[1].Value }
    Write-Host "JSON-LD @types: $($types -join ', ')"
    $ids = ([regex]'"@id"\s*:\s*"([^"]+)"').Matches($r.Content) | ForEach-Object { $_.Groups[1].Value }
    Write-Host "JSON-LD @ids: $($ids -join ' | ')"
    $internalLinks = ([regex]'href=.(https?://happyfacesla\.com[^"]*|/[^"]*).').Matches($r.Content).Count
    Write-Host "Internal links: $internalLinks"
    $charset = if ($r.Content -match '<meta\s+charset[^>]*>') { "Present" } else { "Absent" }
    Write-Host "Charset: $charset"
    $viewport = if ($r.Content -match '<meta\s+name=.viewport.[^>]*>') { "Present" } else { "Absent" }
    Write-Host "Viewport: $viewport"
    Write-Host ""
}
Write-Host "All HTML files saved to: $dir"
