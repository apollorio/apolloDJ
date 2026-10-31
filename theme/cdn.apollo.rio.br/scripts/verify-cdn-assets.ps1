# Pre-upload gate: fail if critical Apollo CDN files are missing, too small, or wrong content.
$ErrorActionPreference = 'Stop'
$cdnRoot = Split-Path -Parent $PSScriptRoot
$v1 = Join-Path $cdnRoot 'v1.0.0'
$js = Join-Path $v1 'js'

function Test-FileContent {
    param(
        [string]$Path,
        [string]$Label,
        [int]$MinBytes = 200,
        [string[]]$MustContain = @(),
        [string[]]$MustNotContain = @()
    )
    $script:Results += [ordered]@{}
    $row = $script:Results[-1]
    $row.Label = $Label
    $row.Path = $Path

    if (-not (Test-Path $Path)) {
        $row.Status = 'MISSING'
        $script:Failed = $true
        return
    }

    $item = Get-Item $Path
    $row.Bytes = $item.Length
    $text = Get-Content -Path $Path -Raw -Encoding UTF8

    if ($item.Length -lt $MinBytes) {
        $row.Status = "TOO_SMALL (< $MinBytes bytes)"
        $script:Failed = $true
        return
    }

    foreach ($needle in $MustContain) {
        if ($text -notmatch [regex]::Escape($needle)) {
            $row.Status = "BAD_CONTENT (missing: $needle)"
            $script:Failed = $true
            return
        }
    }

    foreach ($bad in $MustNotContain) {
        if ($text -match [regex]::Escape($bad)) {
            $row.Status = "BAD_CONTENT (forbidden: $bad)"
            $script:Failed = $true
            return
        }
    }

    $row.Status = 'OK'
    $row.Sha256 = (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

$Failed = $false
$Results = [System.Collections.Generic.List[object]]::new()
$script:Results = $Results
$script:Failed = $false

$coreOnlyMarkers = @('w.Apollo = {', 'probeSignal', 'dispatchSignalReady')

# ── Content fingerprints (wrong-file detection) ─────────────────────────
Test-FileContent -Path (Join-Path $v1 'core.js') -Label 'core.js' -MinBytes 30000 `
    -MustContain @('@fileoverview', 'Apollo CDN', 'probeSignal', 'js_gsap_core') `
    -MustNotContain @('GreenSock', '__ultimateLenis')

Test-FileContent -Path (Join-Path $js 'gsap\gsap.min.js') -Label 'gsap core min' -MinBytes 60000 `
    -MustContain @('GreenSock', 'gsap') `
    -MustNotContain @($coreOnlyMarkers + '__ultimateLenis')

Test-FileContent -Path (Join-Path $js 'gsap\ScrollTrigger.min.js') -Label 'ScrollTrigger min' -MinBytes 30000 `
    -MustContain @('ScrollTrigger', 'gsap') `
    -MustNotContain @($coreOnlyMarkers)

if (Test-Path (Join-Path $js 'gsap-bundle-plugins.v3.15.0.min.js')) {
    Test-FileContent -Path (Join-Path $js 'gsap-bundle-plugins.v3.15.0.min.js') -Label 'gsap-bundle v3.15.0 (archive)' -MinBytes 250000 `
        -MustContain @('GSAP Bundle v3.15.0', 'GreenSock') `
        -MustNotContain @($coreOnlyMarkers + '__ultimateLenis')
} else {
    Write-Host 'SKIP: gsap-bundle-plugins.v3.15.0.min.js not present (split-file boot only).' -ForegroundColor DarkYellow
}

Test-FileContent -Path (Join-Path $js 'lenis-1.3.23.min.js') -Label 'lenis 1.3.23' -MinBytes 15000 `
    -MustContain @('globalThis.Lenis', '1.3.23') `
    -MustNotContain @('__ultimateLenis', $coreOnlyMarkers, 'GSAP Bundle')

Test-FileContent -Path (Join-Path $js 'gsap-lenis.js') -Label 'gsap-lenis bridge' -MinBytes 1500 `
    -MustContain @('__ultimateLenis', 'ScrollTrigger', 'new w.Lenis', 'registerPopper') `
    -MustNotContain @($coreOnlyMarkers + 'GreenSock')

Test-FileContent -Path (Join-Path $js 'data-tooltip.v1.0.1.js') -Label 'data-tooltip v1.0.1' -MinBytes 2000 `
    -MustContain @('data-tooltip', 'Popper') `
    -MustNotContain @($coreOnlyMarkers)

# ── gsap bundle must match .bak (canonical source) ───────────────────────
$gsap = Join-Path $js 'gsap-bundle-plugins.v3.15.0.min.js'
$bak = Join-Path $js 'gsap-bundle-plugins.v3.15.0.min.bak.js'
if ((Test-Path $gsap) -and (Test-Path $bak)) {
    $h1 = (Get-FileHash $gsap -Algorithm SHA256).Hash
    $h2 = (Get-FileHash $bak -Algorithm SHA256).Hash
    if ($h1 -ne $h2) {
        Write-Error "FAIL: gsap-bundle-plugins.v3.15.0.min.js SHA256 differs from .bak.js - restore from .bak before upload."
        $Failed = $true
    }
}

# ── Every script core.js loads (existence + minimum size) ───────────────
$coreDeps = @(
    @{ Rel = 'js/jquery.v4.min.js'; Min = 50000; Tag = 'jquery' },
    @{ Rel = 'js/gsap/gsap.min.js'; Min = 70000; Tag = 'gsap-core' },
    @{ Rel = 'js/gsap/ScrollTrigger.min.js'; Min = 40000; Tag = 'ScrollTrigger' },
    @{ Rel = 'js/gsap/Observer.min.js'; Min = 8000; Tag = 'Observer' },
    @{ Rel = 'js/gsap/Flip.min.js'; Min = 20000; Tag = 'Flip' },
    @{ Rel = 'js/gsap/SplitText.min.js'; Min = 5000; Tag = 'SplitText' },
    @{ Rel = 'js/gsap/Draggable.min.js'; Min = 30000; Tag = 'Draggable' },
    @{ Rel = 'js/gsap/InertiaPlugin.min.js'; Min = 5000; Tag = 'InertiaPlugin' },
    @{ Rel = 'js/gsap/MotionPathPlugin.min.js'; Min = 15000; Tag = 'MotionPath' },
    @{ Rel = 'js/gsap/MorphSVGPlugin.min.js'; Min = 15000; Tag = 'MorphSVG' },
    @{ Rel = 'js/gsap/TextPlugin.min.js'; Min = 8000; Tag = 'TextPlugin' },
    @{ Rel = 'js/tracker.min.js'; Min = 500; Tag = 'tracker' },
    @{ Rel = 'js/translate.js'; Min = 500; Tag = 'translate' },
    @{ Rel = 'js/icon.v1.0.3.min.js'; Min = 5000; Tag = 'icon' },
    @{ Rel = 'js/morphism.v1.0.4.min.js'; Min = 5000; Tag = 'morphism' },
    @{ Rel = 'js/popper.v2.11.8.min.js'; Min = 10000; Tag = 'popper' },
    @{ Rel = 'js/reveal-up.js'; Min = 500; Tag = 'reveal-up' },
    @{ Rel = 'js/script.js'; Min = 5000; Tag = 'script' },
    @{ Rel = 'js/gsap-mobile.js'; Min = 10000; Tag = 'gsap-mobile' }
)

foreach ($dep in $coreDeps) {
    $p = Join-Path $v1 $dep.Rel
    Test-FileContent -Path $p -Label $dep.Tag -MinBytes $dep.Min -MustNotContain @($coreOnlyMarkers)
}

Write-Host ''
Write-Host '=== Apollo CDN pre-upload audit ===' -ForegroundColor Cyan
$Results | ForEach-Object {
    $color = if ($_.Status -eq 'OK') { 'Green' } else { 'Red' }
    Write-Host ("{0,-22} {1,10} {2}" -f $_.Label, $_.Bytes, $_.Status) -ForegroundColor $color
}

if ($Failed) {
    Write-Host ''
    Write-Error 'Pre-upload verification FAILED. Do not upload to cdn.apollo.rio.br until all rows are OK.'
    exit 1
}

Write-Host ''
Write-Host 'All checks passed. Safe to upload v1.0.0/ to production CDN.' -ForegroundColor Green

# Write manifest for post-upload verification
$manifestPath = Join-Path $cdnRoot 'PRE-UPLOAD-MANIFEST.json'
$manifest = @{
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    version     = 'v1.0.0'
    files       = @($Results | Where-Object { $_.Status -eq 'OK' } | ForEach-Object {
            @{
                label  = $_.Label
                path   = $_.Path.Replace($cdnRoot + '\', '').Replace('\', '/')
                bytes  = $_.Bytes
                sha256 = $_.Sha256
            }
        })
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -Path $manifestPath -Encoding UTF8
Write-Host "Manifest: $manifestPath"
