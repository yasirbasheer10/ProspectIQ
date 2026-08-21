#Requires -Version 5.1
<#  Save your work and put it on GitHub (which deploys it on Vercel).
    Usage:  powershell -ExecutionPolicy Bypass -File .\scripts\save.ps1 -Message "what you changed"  #>
param([Parameter(Mandatory = $true)][string]$Message)

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($branch -ne 'main') { Write-Host "Note: you're on branch '$branch', not main." -ForegroundColor Yellow }

if (-not (git status --porcelain)) {
    Write-Host "Nothing has changed since your last save." -ForegroundColor Yellow
    exit 0
}

git add -A
git commit -m $Message
if ($LASTEXITCODE -ne 0) { throw "Commit failed - nothing was sent to GitHub." }

# Pull in anything edited elsewhere (e.g. directly on github.com) so the push isn't rejected.
git pull --rebase --autostash
if ($LASTEXITCODE -ne 0) {
    throw "Your copy and GitHub's have conflicting edits. Nothing was pushed - paste this message to Claude."
}

git push
if ($LASTEXITCODE -ne 0) { throw "Push failed. If it mentions authentication, run: gh auth login -h github.com" }

Write-Host ""
Write-Host "Saved and pushed. Vercel is deploying now - give it a minute." -ForegroundColor Green
Write-Host "Don't like it? Run:  powershell -ExecutionPolicy Bypass -File .\scripts\undo.ps1"
