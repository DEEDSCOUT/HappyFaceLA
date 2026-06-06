# run_project_gates.ps1
# Safe, non-destructive gate discovery and execution.
# Does not install dependencies, delete files, or change application state.

param(
    [string]$RepoRoot = (git rev-parse --show-toplevel 2>$null)
)

$Separator = "-" * 60

Write-Host $Separator
Write-Host "PROJECT GATE RUNNER"
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "Repo root: $RepoRoot"
Write-Host $Separator

# --- Gate Discovery ---
Write-Host ""
Write-Host "=== GATE DISCOVERY ==="

$gatesFound = @()
$gatesSkipped = @()

# Check pyproject.toml for pytest and ruff
$pyprojectPath = Join-Path $RepoRoot "pyproject.toml"
if (Test-Path $pyprojectPath) {
    Write-Host "  [FOUND] pyproject.toml"
    $pyprojectContent = Get-Content $pyprojectPath -Raw

    if ($pyprojectContent -match '\[tool\.pytest\.ini_options\]') {
        $gatesFound += @{ Id = "G-01"; Name = "pytest"; Command = "python -m pytest"; Source = "pyproject.toml [tool.pytest.ini_options]" }
        Write-Host "    -> Gate G-01 (pytest) discovered"
    }

    if ($pyprojectContent -match '\[tool\.ruff\]') {
        $gatesFound += @{ Id = "G-02"; Name = "ruff check"; Command = "python -m ruff check src"; Source = "pyproject.toml [tool.ruff]" }
        Write-Host "    -> Gate G-02 (ruff check) discovered"
    }
} else {
    Write-Host "  [SKIP] pyproject.toml - not found"
    $gatesSkipped += "pyproject.toml (not present)"
}

# Check for root-level package.json
$packageJsonPath = Join-Path $RepoRoot "package.json"
if (Test-Path $packageJsonPath) {
    Write-Host "  [FOUND] package.json"
    Write-Host "    -> Inspect manually for npm scripts (not auto-run)"
    $gatesSkipped += "package.json npm scripts (found but not auto-run - manual inspection required)"
} else {
    Write-Host "  [SKIP] package.json - not found at root"
    $gatesSkipped += "package.json (not present at root)"
}

# Check for root Makefile
$makefilePath = Join-Path $RepoRoot "Makefile"
if (Test-Path $makefilePath) {
    Write-Host "  [FOUND] Makefile"
    Write-Host "    -> Inspect manually for make targets (not auto-run)"
    $gatesSkipped += "Makefile targets (found but not auto-run - manual inspection required)"
} else {
    Write-Host "  [SKIP] Makefile - not found at root"
    $gatesSkipped += "Makefile (not present at root)"
}

# Check for .github/workflows
$workflowsPath = Join-Path $RepoRoot ".github/workflows"
if (Test-Path $workflowsPath) {
    $workflows = Get-ChildItem $workflowsPath -Filter "*.yml" 2>$null
    if ($workflows.Count -gt 0) {
        Write-Host "  [FOUND] .github/workflows ($($workflows.Count) yml files)"
        Write-Host "    -> CI workflow gates are not run locally - skipped"
        $gatesSkipped += ".github/workflows (CI gates - not run locally)"
    } else {
        Write-Host "  [SKIP] .github/workflows - directory exists but no .yml files"
        $gatesSkipped += ".github/workflows (empty)"
    }
} else {
    Write-Host "  [SKIP] .github/workflows - not found"
    $gatesSkipped += ".github/workflows (not present)"
}

# Other gate files not found
foreach ($missing in @("pytest.ini", "tox.ini", "setup.cfg", "tsconfig.json", "vite.config.*", "next.config.*", "justfile", "docker-compose.*")) {
    $gatesSkipped += "$missing (not present at root)"
}

# --- Run Discovered Gates ---
Write-Host ""
Write-Host "=== GATE EXECUTION ==="

if ($gatesFound.Count -eq 0) {
    Write-Host "  No runnable gates discovered."
} else {
    foreach ($gate in $gatesFound) {
        Write-Host ""
        Write-Host "--- Gate $($gate.Id): $($gate.Name) ---"
        Write-Host "  Source: $($gate.Source)"
        Write-Host "  Command: $($gate.Command)"
        Write-Host "  Output:"

        # Execute from repo root
        Push-Location $RepoRoot
        try {
            $output = Invoke-Expression $gate.Command 2>&1
            $exitCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }

        $output | ForEach-Object { Write-Host "    $_" }

        if ($exitCode -eq 0) {
            Write-Host "  Result: PASS (exit $exitCode)"
        } else {
            Write-Host "  Result: FAIL (exit $exitCode)"
        }
    }
}

# --- Skipped Gates Summary ---
Write-Host ""
Write-Host "=== SKIPPED GATES ==="
foreach ($skipped in $gatesSkipped) {
    Write-Host "  [SKIP] $skipped"
}

# --- Summary ---
Write-Host ""
Write-Host $Separator
Write-Host "GATE RUNNER COMPLETE"
Write-Host "Gates run:     $($gatesFound.Count)"
Write-Host "Gates skipped: $($gatesSkipped.Count)"
Write-Host $Separator
