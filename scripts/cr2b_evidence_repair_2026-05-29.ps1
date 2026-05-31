$ErrorActionPreference = 'Stop'

$spreadsheetId = '1RVCOE7mkGxu4YS18TmJhu3btxUQ1S26zFPDHs52kw9Q'
$testTab = '03_INTERNAL_QUOTE_TRAVEL_TEST_CR2B'
$evidenceTab = 'CR2B_REGRESSION_EVIDENCE'
$timestampValue = '2026-05-29'
$gwsRunJs = 'C:\Users\shawn\AppData\Roaming\npm\node_modules\@googleworkspace\cli\run.js'
$env:GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE = 'C:\Users\shawn\.local\share\google-workspace-mcp\credentials\info_at_happyfacesla_dot_com.json'

function Invoke-GwsJson {
    param(
        [string[]]$GwsArgs
    )

    $previousErrorActionPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = & node $gwsRunJs @GwsArgs --format json 2>&1
    $ErrorActionPreference = $previousErrorActionPreference
    if ($LASTEXITCODE -ne 0) {
        throw "gws failed ($LASTEXITCODE): $($GwsArgs -join ' ')`n$raw"
    }

    $rawText = ($raw -join "`n").Trim()
    if ([string]::IsNullOrWhiteSpace($rawText)) {
        return $null
    }

    $jsonStart = $rawText.IndexOf('{')
    if ($jsonStart -gt 0) {
        $rawText = $rawText.Substring($jsonStart)
    }

    $jsonEnd = $rawText.LastIndexOf('}')
    if ($jsonEnd -ge 0 -and $jsonEnd -lt ($rawText.Length - 1)) {
        $rawText = $rawText.Substring(0, $jsonEnd + 1)
    }

    $obj = $rawText | ConvertFrom-Json -Depth 100
    if ($null -ne $obj.error) {
        throw "gws API error: $($obj.error | ConvertTo-Json -Compress)"
    }

    return $obj
}

function Get-Cell {
    param(
        [object[]]$Row,
        [int]$Index
    )

    if ($null -eq $Row) { return '' }
    if ($Index -lt $Row.Count) {
        if ($null -eq $Row[$Index]) { return '' }
        return [string]$Row[$Index]
    }
    return ''
}

function Get-ColValueAtOffset {
    param(
        [object]$ValueRange,
        [int]$Offset
    )

    if ($null -eq $ValueRange -or $null -eq $ValueRange.values) { return '' }
    if ($Offset -ge $ValueRange.values.Count) { return '' }

    $row = $ValueRange.values[$Offset]
    if ($null -eq $row -or $row.Count -lt 1) { return '' }
    if ($null -eq $row[0]) { return '' }
    return [string]$row[0]
}

function Try-ParseNumber {
    param([string]$Value)

    $n = 0.0
    $ok = [double]::TryParse($Value, [System.Globalization.NumberStyles]::Any, [System.Globalization.CultureInfo]::InvariantCulture, [ref]$n)
    if (-not $ok) {
        $ok = [double]::TryParse($Value, [ref]$n)
    }

    return @{ Ok = $ok; Value = $n }
}

function NumericEquals {
    param(
        [string]$Actual,
        [double]$Expected
    )

    $parsed = Try-ParseNumber -Value $Actual
    if (-not $parsed.Ok) { return $false }
    return [math]::Abs($parsed.Value - $Expected) -lt 0.000001
}

$expectedByTestId = @{
    'TC-S01' = 'VALID — CHOOSE ONE SERVICE'
    'TC-S02' = 'VALID — CHOOSE ONE SERVICE'
    'TC-S03' = 'VALID — CHOOSE ONE SERVICE'
    'TC-S04' = 'BLOCKED — INVALID SERVICE SELECTION'
    'TC-S05' = 'BLOCKED — INVALID SERVICE SELECTION'
    'TC-S06' = 'BLOCKED — CHOOSE-ONE DOES NOT ACCEPT A SECOND SERVICE'
    'TC-S07' = 'BLOCKED — INVALID FACE GEMS ADD-ON STATUS'
    'TC-S08' = 'VALID — CHOOSE ONE WITH FACE GEMS ADD-ON'
    'TC-S09' = 'VALID — TWO-SERVICE MIX'
    'TC-S10' = 'VALID — TWO-SERVICE MIX'
    'TC-S11' = 'BLOCKED — FACE GEMS ALREADY INCLUDED; CLARIFY ADD-ON REQUEST'
    'TC-S12' = 'CUSTOM REVIEW REQUIRED — THREE-SERVICE REQUEST'
    'TC-S13' = 'BLOCKED — DUPLICATE SERVICE SELECTION'
    'TC-S14' = 'BLOCKED — INCOMPLETE SERVICE SELECTION'
    'TC-S15' = 'BLOCKED — INVALID SERVICE SELECTION'

    'TC-E01' = 'VALID — STANDARD OPERATIONAL LANE'
    'TC-E02' = 'CUSTOM REVIEW REQUIRED — SCHOOL EVENT'
    'TC-E03' = 'CUSTOM REVIEW REQUIRED — FESTIVAL EVENT'
    'TC-E04' = 'CUSTOM REVIEW REQUIRED — CORPORATE EVENT'
    'TC-E05' = 'CUSTOM REVIEW REQUIRED — VENDOR PROMOTION'
    'TC-E06' = 'CUSTOM REVIEW REQUIRED — OTHER EVENT'
    'TC-E07' = 'BLOCKED — SELECT EVENT TYPE'
    'TC-E08' = 'BLOCKED — INVALID EVENT TYPE'
    'TC-E09' = 'BLOCKED — INVALID ARTIST COUNT'
    'TC-E10' = 'BLOCKED — INVALID ARTIST COUNT'
    'TC-E11' = 'BLOCKED — INVALID ARTIST COUNT'
    'TC-E12' = 'BLOCKED — INVALID ARTIST COUNT'
    'TC-E13' = 'CUSTOM REVIEW REQUIRED — MULTI-ARTIST'
    'TC-E14' = 'BLOCKED — INVALID EXCEPTION FLAG'
    'TC-E15' = 'BLOCKED — INVALID EXCEPTION FLAG'
    'TC-E16' = 'CUSTOM REVIEW REQUIRED — EXCEPTION FLAG'

    'TC-C01' = 'BLOCKED — INVALID CHILD COUNT'
    'TC-C02' = 'BLOCKED — INVALID CHILD COUNT'
    'TC-C03' = 'BLOCKED — INVALID CHILD COUNT'
    'TC-C04' = 'BLOCKED — INVALID CHILD COUNT'
    'TC-C05' = 'COVERAGE CONFIRMED — NO GUARANTEE REQUESTED'
    'TC-C06' = 'COVERAGE CONFIRMATION REQUIRED — MANUAL REVIEW'
    'TC-C07' = 'BLOCKED — INVALID COVERAGE SELECTION'
    'TC-C08' = 'BLOCKED — COVERAGE SELECTION REQUIRED'
    'TC-C09' = 'COVERAGE CONFIRMATION REQUIRED — MANUAL REVIEW'

    'TC-T01' = 'TRAVEL ELIGIBLE — LOCAL ZONE'
    'TC-T02' = 'TRAVEL ELIGIBLE — LOCAL ZONE'
    'TC-T03' = 'BLOCKED — 2-HOUR MINIMUM REQUIRED FOR TRAVEL ZONE'
    'TC-T04' = 'TRAVEL ELIGIBLE — NO-FEE ZONE'
    'TC-T05' = 'BLOCKED — 2-HOUR MINIMUM REQUIRED FOR TRAVEL ZONE'
    'TC-T06' = 'TRAVEL ELIGIBLE — MILEAGE ZONE'
    'TC-T07' = 'MANUAL APPROVAL REQUIRED — FARTHER-DISTANCE ZONE'
    'TC-T08' = 'CUSTOM REVIEW REQUIRED — OUT-OF-RANGE DISTANCE'
    'TC-T09' = 'BLOCKED — PRIVATE DISPATCH REFERENCE CONTROL REQUIRED'
    'TC-T10' = 'BLOCKED — INVALID MILEAGE INPUT'
    'TC-T11' = 'MANUAL APPROVAL REQUIRED — FARTHER-DISTANCE ZONE'

    'TC-M01' = 'BLOCKED — INVALID MONETARY INPUT'
    'TC-M02' = 'BLOCKED — INVALID MONETARY INPUT'
    'TC-M03' = 'BLOCKED — INVALID MONETARY INPUT'
    'TC-M04' = 'BLOCKED — INVALID MONETARY INPUT'
    'TC-M05' = 'BLOCKED — INVALID MONETARY INPUT'
    'TC-M06' = 'VALID — MONETARY INPUTS'
    'TC-M07' = 'BLOCKED — INVALID MONETARY INPUT'
    'TC-M08' = 'MANUAL REVIEW REQUIRED — CUSTOM ADJUSTMENT'

    'TC-R01' = 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO'
    'TC-R02' = 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO'
    'TC-R03' = 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO'
    'TC-R04' = 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO'
    'TC-R05' = 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO'
    'TC-R06' = 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO'
    'TC-R07' = 'FORMULA-LEVEL TEST ONLY — SYNTHETIC COMPONENT VALUE — NOT AN AUTHORIZED CUSTOMER QUOTE SCENARIO'

    'TC-D01' = 'BLOCKED — SELECT DURATION'
    'TC-D02' = 'VALID — DURATION'
    'TC-D03' = 'VALID — DURATION'
    'TC-D04' = 'VALID — DURATION'
    'TC-D05' = 'BLOCKED — INVALID DURATION'
    'TC-D06' = 'BLOCKED — INVALID DURATION'
}

$retainerTriples = @{
    'TC-R01' = @(249.0, 50.0, 199.0)
    'TC-R02' = @(250.0, 100.0, 150.0)
    'TC-R03' = @(599.0, 100.0, 499.0)
    'TC-R04' = @(600.0, 150.0, 450.0)
    'TC-R05' = @(650.0, 162.5, 487.5)
    'TC-R06' = @(799.0, 199.75, 599.25)
    'TC-R07' = @(800.0, 200.0, 600.0)
}

# 1) Read evidence inputs and keys (A:R)
$readParams = @{ spreadsheetId = $spreadsheetId; range = "$evidenceTab!A2:R73" } | ConvertTo-Json -Compress
$inputData = Invoke-GwsJson -GwsArgs @('sheets', 'spreadsheets', 'values', 'get', '--params', $readParams)
$rows = @($inputData.values)
if ($rows.Count -ne 72) {
    throw "Expected 72 rows in $evidenceTab!A2:R73, got $($rows.Count)"
}

$allOutputRows = @()
$failedIds = New-Object System.Collections.Generic.List[string]
$anomalies = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $rows.Count; $i++) {
    $sheetRow = $i + 2
    $row = @($rows[$i])

    $testId = Get-Cell -Row $row -Index 0
    $domain = Get-Cell -Row $row -Index 1
    $syntheticFlag = Get-Cell -Row $row -Index 2

    $inD = Get-Cell -Row $row -Index 3
    $inE = Get-Cell -Row $row -Index 4
    $inF = Get-Cell -Row $row -Index 5
    $inG = Get-Cell -Row $row -Index 6
    $inH = Get-Cell -Row $row -Index 7
    $inI = Get-Cell -Row $row -Index 8
    $inJ = Get-Cell -Row $row -Index 9
    $inK = Get-Cell -Row $row -Index 10
    $inL = Get-Cell -Row $row -Index 11
    $inM = Get-Cell -Row $row -Index 12
    $inN = Get-Cell -Row $row -Index 13
    $inO = Get-Cell -Row $row -Index 14
    $inP = Get-Cell -Row $row -Index 15
    $inQ = Get-Cell -Row $row -Index 16
    $inR = Get-Cell -Row $row -Index 17

    # 2) Write mapped inputs into test tab block W6:Y19
    $inputBlock = @(
        @($inD, '', ''),
        @($inE, '', ''),
        @($inF, '', $inG),
        @($inH, '', $inQ),
        @($inI, '', ''),
        @($inJ, '', ''),
        @($inK, '', ''),
        @($inL, '', ''),
        @($inM, '', ''),
        @($inN, '', ''),
        @($inO, '', ''),
        @($inP, '', ''),
        @('', '', ''),
        @($inR, '', '')
    )

    $writeInputsParams = @{ spreadsheetId = $spreadsheetId; valueInputOption = 'USER_ENTERED' } | ConvertTo-Json -Compress
    $writeInputsBody = @{ data = @(@{ range = "$testTab!W6:Y19"; values = $inputBlock }) } | ConvertTo-Json -Compress -Depth 20
    $null = Invoke-GwsJson -GwsArgs @('sheets', 'spreadsheets', 'values', 'batchUpdate', '--params', $writeInputsParams, '--json', $writeInputsBody)

    # 3) Immediately read outputs Y11:Y12, Y20:Y24, W20:W30
    $readOutputsParams = @{
        spreadsheetId = $spreadsheetId
        ranges = @(
            "$testTab!Y11:Y12",
            "$testTab!Y20:Y24",
            "$testTab!W20:W30"
        )
    } | ConvertTo-Json -Compress -Depth 10

    $outputsObj = Invoke-GwsJson -GwsArgs @('sheets', 'spreadsheets', 'values', 'batchGet', '--params', $readOutputsParams)
    $valueRanges = @($outputsObj.valueRanges)

    $y11 = Get-ColValueAtOffset -ValueRange $valueRanges[0] -Offset 0
    $y12 = Get-ColValueAtOffset -ValueRange $valueRanges[0] -Offset 1

    $y20 = Get-ColValueAtOffset -ValueRange $valueRanges[1] -Offset 0
    $y21 = Get-ColValueAtOffset -ValueRange $valueRanges[1] -Offset 1
    $y22 = Get-ColValueAtOffset -ValueRange $valueRanges[1] -Offset 2
    $y23 = Get-ColValueAtOffset -ValueRange $valueRanges[1] -Offset 3
    $y24 = Get-ColValueAtOffset -ValueRange $valueRanges[1] -Offset 4

    $w20 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 0
    $w21 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 1
    $w22 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 2
    $w23 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 3
    $w24 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 4
    $w25 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 5
    $w26 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 6
    $w27 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 7
    $w28 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 8
    $w29 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 9
    $w30 = Get-ColValueAtOffset -ValueRange $valueRanges[2] -Offset 10

    # 4) Observed result AL by domain key
    $observedResult = ''
    switch ($domain) {
        'Service' { $observedResult = $y20 }
        'Event' { $observedResult = $y21 }
        'Coverage' {
            if ($testId -eq 'TC-C09') { $observedResult = $y24 } else { $observedResult = $y22 }
        }
        'Travel' {
            if ($testId -eq 'TC-T11') { $observedResult = $y24 } else { $observedResult = $y23 }
        }
        'Monetary' { $observedResult = $y11 }
        'Duration' { $observedResult = $y12 }
        'Retainer' { $observedResult = "W26=$w26|W27=$w27|W28=$w28" }
        default { $observedResult = '' }
    }

    # 5) Restore expected AK
    $expectedResult = ''
    if ($expectedByTestId.ContainsKey($testId)) {
        $expectedResult = $expectedByTestId[$testId]
    }

    # 6) Recompute AM
    $passFail = 'FAIL'
    if ($retainerTriples.ContainsKey($testId)) {
        $expectedTriple = $retainerTriples[$testId]
        $retainerOk = (NumericEquals -Actual $w26 -Expected $expectedTriple[0]) -and
            (NumericEquals -Actual $w27 -Expected $expectedTriple[1]) -and
            (NumericEquals -Actual $w28 -Expected $expectedTriple[2])
        if ($retainerOk) { $passFail = 'PASS' }
    }
    else {
        if ($observedResult -ceq $expectedResult) { $passFail = 'PASS' }
    }

    if ($passFail -eq 'FAIL') {
        $failedIds.Add($testId) | Out-Null
    }

    # 7) Anomaly checks
    if (($y20 -like '*FACE GEMS ADD-ON*') -and ($y20 -notlike '*INVALID*') -and ($y20 -notlike '*ALREADY INCLUDED*')) {
        if (-not (NumericEquals -Actual $w22 -Expected 50.0)) {
            $anomalies.Add("$($testId): face gems add-on anomaly (W22=$w22)") | Out-Null
        }
    }

    $baseExpected = $null
    if ($inE -eq 'Choose One Party Service' -and $inR -eq '1 Hour') { $baseExpected = 150.0 }
    if ($inE -eq 'Choose One Party Service' -and $inR -eq '90 Minutes') { $baseExpected = 215.0 }
    if ($inE -eq 'Choose One Party Service' -and $inR -eq '2 Hours') { $baseExpected = 275.0 }
    if ($inE -eq 'Two-Service Party Mix' -and $inR -eq '1 Hour') { $baseExpected = 180.0 }

    if ($null -ne $baseExpected) {
        if (-not (NumericEquals -Actual $w20 -Expected $baseExpected)) {
            $anomalies.Add("$($testId): base ladder mismatch (W20=$w20 expected=$baseExpected)") | Out-Null
        }
    }

    $w21Parsed = Try-ParseNumber -Value $w21
    if (($y23 -like '*LOCAL ZONE*' -or $y23 -like '*NO-FEE ZONE*') -and $w21Parsed.Ok -and ([math]::Abs($w21Parsed.Value) -gt 0.000001)) {
        $anomalies.Add("$($testId): travel fee mismatch (Y23=$y23, W21=$w21)") | Out-Null
    }
    if (($y23 -like '*MILEAGE ZONE*' -or $y23 -like '*FARTHER-DISTANCE ZONE*') -and ((-not $w21Parsed.Ok) -or ($w21Parsed.Value -le 0))) {
        $anomalies.Add("$($testId): travel fee mismatch (Y23=$y23, W21=$w21)") | Out-Null
    }

    $gateState = "$y20 $y21 $y22 $y23 $y24"
    if ($gateState -match 'BLOCKED|CUSTOM REVIEW REQUIRED|MANUAL APPROVAL REQUIRED|COVERAGE CONFIRMATION REQUIRED') {
        foreach ($pair in @(@('W26', $w26), @('W27', $w27), @('W28', $w28))) {
            $parsed = Try-ParseNumber -Value $pair[1]
            if ($parsed.Ok) {
                $anomalies.Add("$($testId): numeric $($pair[0]) in blocked/custom/manual state ($($pair[1]))") | Out-Null
            }
        }
    }

    # 8) Collect row writeback values S:AN
    $rowOut = @(
        $y11, $y12,
        $y20, $y21, $y22, $y23, $y24,
        $w20, $w21, $w22, $w23, $w24, $w25, $w26, $w27, $w28, $w29, $w30,
        $expectedResult, $observedResult, $passFail, $timestampValue
    )
    $allOutputRows += ,$rowOut

    Write-Host "Processed $testId (row $sheetRow): AM=$passFail"
}

# 9) Write S:AN for all rows in one update
$writeEvidenceParams = @{ spreadsheetId = $spreadsheetId; valueInputOption = 'USER_ENTERED' } | ConvertTo-Json -Compress
$writeEvidenceBody = @{
    data = @(
        @{ range = "$evidenceTab!S2:AN73"; values = $allOutputRows },
        @{ range = "$evidenceTab!C61:C67"; values = @(@('Yes'), @('Yes'), @('Yes'), @('Yes'), @('Yes'), @('Yes'), @('Yes')) }
    )
} | ConvertTo-Json -Compress -Depth 100
$null = Invoke-GwsJson -GwsArgs @('sheets', 'spreadsheets', 'values', 'batchUpdate', '--params', $writeEvidenceParams, '--json', $writeEvidenceBody)

# 10) Reset baseline inputs on test tab
$baselineBlock = @(
    @('Private Birthday / Family Party', '', ''),
    @('Choose One Party Service', '', ''),
    @('Face Painting', '', ''),
    @('10', '', ''),
    @('1', '', ''),
    @('0', '', ''),
    @('Yes', '', ''),
    @('No', '', ''),
    @('0', '', ''),
    @('0', '', ''),
    @('0', '', ''),
    @('No', '', ''),
    @('', '', ''),
    @('1 Hour', '', '')
)
$baselineBlock[2][2] = ''   # Y8 blank
$baselineBlock[3][2] = 'No' # Y9

$resetBody = @{ data = @(@{ range = "$testTab!W6:Y19"; values = $baselineBlock }) } | ConvertTo-Json -Compress -Depth 20
$null = Invoke-GwsJson -GwsArgs @('sheets', 'spreadsheets', 'values', 'batchUpdate', '--params', $writeEvidenceParams, '--json', $resetBody)

# 11) Confirm S:T and AK populated
$checkSTParams = @{ spreadsheetId = $spreadsheetId; range = "$evidenceTab!S2:T73" } | ConvertTo-Json -Compress
$checkAKParams = @{ spreadsheetId = $spreadsheetId; range = "$evidenceTab!AK2:AK73" } | ConvertTo-Json -Compress

$stData = Invoke-GwsJson -GwsArgs @('sheets', 'spreadsheets', 'values', 'get', '--params', $checkSTParams)
$akData = Invoke-GwsJson -GwsArgs @('sheets', 'spreadsheets', 'values', 'get', '--params', $checkAKParams)

$stRows = @($stData.values)
$akRows = @($akData.values)

$stAllPopulated = $true
for ($i = 0; $i -lt 72; $i++) {
    if ($i -ge $stRows.Count) { $stAllPopulated = $false; break }
    $row = @($stRows[$i])
    if ($row.Count -lt 2) { $stAllPopulated = $false; break }
    if ([string]::IsNullOrWhiteSpace([string]$row[0]) -or [string]::IsNullOrWhiteSpace([string]$row[1])) {
        $stAllPopulated = $false
        break
    }
}

$akAllPopulated = $true
for ($i = 0; $i -lt 72; $i++) {
    if ($i -ge $akRows.Count) { $akAllPopulated = $false; break }
    $row = @($akRows[$i])
    if ($row.Count -lt 1 -or [string]::IsNullOrWhiteSpace([string]$row[0])) {
        $akAllPopulated = $false
        break
    }
}

$passCount = ($allOutputRows | Where-Object { $_[20] -eq 'PASS' }).Count
$failCount = ($allOutputRows | Where-Object { $_[20] -eq 'FAIL' }).Count

$summary = [ordered]@{
    spreadsheetId = $spreadsheetId
    testTab = $testTab
    evidenceTab = $evidenceTab
    processedRows = 72
    passCount = $passCount
    failCount = $failCount
    failedTestIds = @($failedIds)
    stAllPopulated = $stAllPopulated
    akAllPopulated = $akAllPopulated
    anomalies = @($anomalies)
}

$outPath = 'C:\HappyFaceLA\artifacts\verification\cr2b_fix_2026-05-29_summary.json'
$summary | ConvertTo-Json -Depth 100 | Set-Content -Path $outPath -Encoding UTF8
$summary | ConvertTo-Json -Depth 100
Write-Host "Summary written to $outPath"
