#Requires -Version 5.1
<#  Undo the most recent change and redeploy the previous version.
    Usage:  powershell -ExecutionPolicy Bypass -File .\scripts\undo.ps1  #>
param([switch]$Yes)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

if (git status --porcelain) {
    Write-Host "You have unsaved edits. Undo only affects work already saved," -ForegroundColor Yellow
    Write-Host "so your current edits will be left alone."
}

$hash = (git log -1 --pretty=%h).Trim()
$subject = (git log -1 --pretty=%s).Trim()

Write-Host ""
Write-Host "This undoes your most recent saved change:" -ForegroundColor Yellow
Write-Host "  $hash  $subject"
Write-Host ""

if (-not $Yes) {
    if ((Read-Host "Type y to undo it") -ne 'y') {
        Write-Host "Cancelled - nothing changed."
        exit 0
    }
}

git revert HEAD --no-edit
if ($LASTEXITCODE -ne 0) { throw "Couldn't undo cleanly. Nothing was pushed - paste this to Claude." }

git push
if ($LASTEXITCODE -ne 0) { throw "Undo saved on your PC but the push failed. Paste this to Claude." }

Write-Host ""
Write-Host "Undone and pushed. Vercel is redeploying the previous version." -ForegroundColor Green
