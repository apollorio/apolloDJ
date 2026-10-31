# Post-upload: compare production CDN bytes/signatures against PRE-UPLOAD-MANIFEST.json
param(
    [string]$ManifestPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'PRE-UPLOAD-MANIFEST.json'),
    [string]$CdnBase = 'https://cdn.apollo.rio.br/v1.0.0'
)

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $ManifestPath)) {
    Write-Error "Run verify-cdn-assets.ps1 first to generate $ManifestPath"
}

$manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$failed = $false

$q = 'v=t0x4'
$remoteChecks = @(
    @{ Url = "$CdnBase/core.js?$q"; MustContain = 'js_gsap_core'; MustNot = 'w.Apollo = {' },
    @{ Url = "$CdnBase/core.js?$q"; MustContain = 'sb-ink-rgb'; MustNot = 'w.Apollo = {' },
    @{ Url = "$CdnBase/js/gsap/gsap.min.js?$q"; MustContain = 'GreenSock'; MustNot = 'w.Apollo = {' },
    @{ Url = "$CdnBase/js/lenis-1.3.23.min.js?$q"; MustContain = 'globalThis.Lenis'; MustNot = '__ultimateLenis' },
    @{ Url = "$CdnBase/js/gsap-lenis.js?$q"; MustContain = '__ultimateLenis'; MustNot = 'GreenSock' },
    @{ Url = "$CdnBase/js/data-tooltip.v1.0.0.js?$q"; MustContain = 'data-tooltip'; MustNot = 'w.Apollo = {' }
)

Write-Host "NOTE: ?w=05x GSAP preload is deprecated; core.js preload must use ?$q" -ForegroundColor DarkYellow

Write-Host "=== Remote CDN verification ($CdnBase) ===" -ForegroundColor Cyan

foreach ($c in $remoteChecks) {
    try {
        $r = Invoke-WebRequest -Uri $c.Url -UseBasicParsing -TimeoutSec 25
        $body = $r.Content
        $ok = $true
        if ($c.MustContain -and $body -notmatch [regex]::Escape($c.MustContain)) { $ok = $false }
        if ($c.MustNot -and $body -match [regex]::Escape($c.MustNot)) { $ok = $false }
        $len = $body.Length
        if ($ok) {
            Write-Host ("OK   {0,-55} {1,8} bytes" -f ($c.Url -replace '^https://cdn.apollo.rio.br/v1.0.0/',''), $len) -ForegroundColor Green
        } else {
            $why = @()
            if ($c.MustContain -and $body -notmatch [regex]::Escape($c.MustContain)) { $why += "missing:$($c.MustContain)" }
            if ($c.MustNot -and $body -match [regex]::Escape($c.MustNot)) { $why += "forbidden:$($c.MustNot)" }
            Write-Host ("FAIL {0} ({1}) {2,8} bytes" -f $c.Url, ($why -join '; '), $len) -ForegroundColor Red
            $failed = $true
        }
    } catch {
        Write-Host ("ERR  {0} - {1}" -f $c.Url, $_.Exception.Message) -ForegroundColor Red
        $failed = $true
    }
}

if ($failed) {
    Write-Error 'Remote CDN verification FAILED. Purge cache and re-upload files from local v1.0.0/.'
    exit 1
}

Write-Host ''
Write-Host 'Remote CDN looks correct. Purge cache if browsers still see old files.' -ForegroundColor Green
