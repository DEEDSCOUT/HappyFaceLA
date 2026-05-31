$dir = "C:\HappyFaceLA\artifacts\seo_baseline\raw\lighthouse"
New-Item -ItemType Directory -Force -Path $dir | Out-Null

$pages = @(
    @{slug="homepage";       url="https://happyfacesla.com/"},
    @{slug="face-painting";  url="https://happyfacesla.com/face-painting-los-angeles/"},
    @{slug="balloon";        url="https://happyfacesla.com/balloon-twisting-los-angeles/"},
    @{slug="glitter";        url="https://happyfacesla.com/glitter-tattoos-los-angeles/"},
    @{slug="face-gems";      url="https://happyfacesla.com/face-gems-face-jewelry-los-angeles/"},
    @{slug="pricing";        url="https://happyfacesla.com/pricing/"},
    @{slug="gallery";        url="https://happyfacesla.com/gallery/"},
    @{slug="contact";        url="https://happyfacesla.com/contact/"},
    @{slug="services";       url="https://happyfacesla.com/services/"},
    @{slug="kids-birthday";  url="https://happyfacesla.com/kids-birthday-party-entertainment-los-angeles/"},
    @{slug="corporate-event";url="https://happyfacesla.com/corporate-event-face-painting-los-angeles/"},
    @{slug="service-areas-la";url="https://happyfacesla.com/service-areas/los-angeles/"}
)

$profiles = @(
    @{name="desktop"; args="--preset=desktop --chrome-flags=`"--headless=new --no-sandbox`""},
    @{name="mobile";  args="--preset=perf --form-factor=mobile --screenEmulation.mobile --screenEmulation.width=375 --screenEmulation.height=667 --screenEmulation.deviceScaleFactor=2 --chrome-flags=`"--headless=new --no-sandbox`""}
)

foreach ($p in $pages) {
    foreach ($pr in $profiles) {
        for ($r = 1; $r -le 3; $r++) {
            # Skip homepage desktop run1 and run2 already done
            if ($p.slug -eq "homepage" -and $pr.name -eq "desktop" -and $r -le 2) { continue }
            $outFile = "$dir\$($p.slug)_$($pr.name)_run$r.json"
            if (Test-Path $outFile) { Write-Host "SKIP $outFile"; continue }
            Write-Host "RUNNING: $($p.slug) $($pr.name) run$r"
            $cmd = "lighthouse $($p.url) --output=json --output-path=`"$outFile`" $($pr.args) --quiet"
            Invoke-Expression $cmd 2>&1 | Out-Null
            if (Test-Path $outFile) {
                $j = Get-Content $outFile | ConvertFrom-Json
                $perf = [math]::Round($j.categories.performance.score*100)
                $seo  = [math]::Round($j.categories.seo.score*100)
                Write-Host "  DONE: perf=$perf seo=$seo"
            } else {
                Write-Host "  FAILED: output not written"
            }
        }
    }
}
Write-Host "ALL LIGHTHOUSE RUNS COMPLETE"
