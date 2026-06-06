# validate_agent_environment.ps1
# Safe, read-only environment snapshot for agent workflow validation.
# Does not install, delete, or modify anything.

param(
    [string]$RepoRoot = (git rev-parse --show-toplevel 2>$null)
)

$Separator = "-" * 60

Write-Host $Separator
Write-Host "AGENT ENVIRONMENT VALIDATION"
Write-Host "Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host $Separator

# --- Current Directory ---
Write-Host ""
Write-Host "[1] Current Directory"
Write-Host "  $PWD"

# --- Git Branch ---
Write-Host ""
Write-Host "[2] Git Branch"
$branch = git branch --show-current 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  $branch"
} else {
    Write-Host "  FAIL: $branch"
}

# --- Git Status ---
Write-Host ""
Write-Host "[3] Git Status (short)"
$status = git status --short 2>&1
if ($LASTEXITCODE -eq 0) {
    if ([string]::IsNullOrWhiteSpace($status)) {
        Write-Host "  (clean - no uncommitted changes)"
    } else {
        $status -split "`n" | ForEach-Object { Write-Host "  $_" }
    }
} else {
    Write-Host "  FAIL: $status"
}

# --- Python Version ---
Write-Host ""
Write-Host "[4] Python Version"
$pyver = python --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  $pyver"
} else {
    Write-Host "  NOT FOUND"
}

# --- Node Version ---
Write-Host ""
Write-Host "[5] Node Version"
$nodever = node --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  $nodever"
} else {
    Write-Host "  NOT FOUND"
}

# --- npm Version ---
Write-Host ""
Write-Host "[6] npm Version"
$npmver = npm --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  $npmver"
} else {
    Write-Host "  NOT FOUND"
}

# --- Claude Version ---
Write-Host ""
Write-Host "[7] Claude CLI Version"
$claudever = claude --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  $claudever"
} else {
    Write-Host "  NOT FOUND"
}

# --- Ollama Version ---
Write-Host ""
Write-Host "[8] Ollama Version"
$ollamaver = ollama --version 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "  $ollamaver"
} else {
    Write-Host "  NOT FOUND"
}

# --- Required Governance Docs ---
Write-Host ""
Write-Host "[9] Required Governance Docs"

$requiredDocs = @(
    "AGENTS.md",
    "CLAUDE.md",
    "CODEX.md",
    "docs/agent-workflow/AGENT_ROUTING_POLICY.md",
    "docs/agent-workflow/AGENT_SYSTEM_ARCHITECTURE.md",
    "docs/agent-workflow/DEVELOPER_PROTOCOL.md",
    "docs/agent-workflow/AUDITOR_PROTOCOL.md",
    "docs/agent-workflow/VALIDATION_GATE_MATRIX.md",
    "docs/agent-workflow/EVIDENCE_REGISTER.md",
    "scripts/agent/validate_agent_environment.ps1",
    "scripts/agent/run_project_gates.ps1"
)

foreach ($doc in $requiredDocs) {
    $fullPath = Join-Path $RepoRoot $doc
    if (Test-Path $fullPath) {
        Write-Host "  [PRESENT] $doc"
    } else {
        Write-Host "  [MISSING] $doc"
    }
}

Write-Host ""
Write-Host $Separator
Write-Host "VALIDATION COMPLETE"
Write-Host $Separator
