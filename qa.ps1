# Quell — repeatable QA sweep.
#
#   powershell -File qa.ps1          # fast: typechecks + engine tests
#   powershell -File qa.ps1 -Full    # also runs an Expo bundle export (catches
#                                     # runtime import/native errors tsc can't see)
#
# Exit code 0 = everything passed; non-zero = at least one check failed.
# Run this before/after pushing any feature, or whenever asked.

param([switch]$Full)

$ErrorActionPreference = 'Continue'
$root = $PSScriptRoot
$fails = @()

function Run-Step($name, $dir, $cmd) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  Push-Location $dir
  Invoke-Expression $cmd | Out-Host
  $code = $LASTEXITCODE
  Pop-Location
  if ($code -ne 0) {
    Write-Host "[FAIL] $name (exit $code)" -ForegroundColor Red
    $script:fails += $name
  } else {
    Write-Host "[PASS] $name" -ForegroundColor Green
  }
}

Write-Host "Quell QA sweep" -ForegroundColor White

Run-Step "API typecheck"      "$root\api" "npx tsc --noEmit"
Run-Step "API engine tests"   "$root\api" "npx vitest run"
Run-Step "App typecheck"      "$root\app" "npx tsc --noEmit"

if ($Full) {
  # A successful export proves the JS bundle builds end to end (resolves every
  # import) — catches things typecheck misses. Slow (~30-60s).
  Run-Step "App bundle export" "$root\app" "npx expo export --platform ios --output-dir .qa-export 2>&1; Remove-Item -Recurse -Force .qa-export -ErrorAction SilentlyContinue; `$LASTEXITCODE = 0"
}

Write-Host "`n========================================" -ForegroundColor White
if ($fails.Count -eq 0) {
  Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
  exit 0
} else {
  Write-Host ("FAILED: " + ($fails -join ", ")) -ForegroundColor Red
  exit 1
}
