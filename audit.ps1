$pages = [ordered]@{
  "face-painting" = "https://happyfacesla.com/face-painting-los-angeles/"
  "balloon-twisting" = "https://happyfacesla.com/balloon-twisting-los-angeles/"
  "glitter-tattoos" = "https://happyfacesla.com/glitter-tattoos-los-angeles/"
  "face-gems" = "https://happyfacesla.com/face-gems-face-jewelry-los-angeles/"
}
Write-Output "Keys: $($pages.Keys -join ', ')"
foreach ($name in $pages.Keys) {
  $url = $pages[$name]
  Write-Output "Fetching $name ..."
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop
    $html = $r.Content
    $status = $r.StatusCode
    $title = [regex]::Match($html,'<title>(.*?)</title>').Groups[1].Value
    $canon = [regex]::Match($html,'rel="canonical" href="(.*?)"').Groups[1].Value
    $robots = [regex]::Match($html,'<meta name="robots" content="(.*?)"').Groups[1].Value
    $tempTat = if ($html -match "Temporary Tattoos") {"PRESENT"} else {"ABSENT"}
    if ($name -eq "face-painting") {
      $blocks = [regex]::Matches($html,'<script type="application/ld\+json">(.*?)</script>','Singleline')
      foreach ($b in $blocks) {
        if ($b.Value -match "makesOffer") {
          $json = [regex]::Match($b.Value,'<script type="application/ld\+json">(.*?)</script>','Singleline').Groups[1].Value
          $p = $json | ConvertFrom-Json
          Write-Output "[$name] makesOffer count: $($p.makesOffer.Count)"
          $p.makesOffer | ForEach-Object { Write-Output "  entry: $($_.itemOffered.name)" }
        }
      }
    }
    Write-Output "[$name] HTTP=$status | title=$title | canonical=$canon | robots=$robots | TempTattoos=$tempTat"
  } catch {
    Write-Output "[$name] ERROR: $_"
  }
}
