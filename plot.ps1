<#
.SYNOPSIS
    Convert an SVG to DDCS-flavored G-code, one file per layer.

.DESCRIPTION
    Runs the SVG through vpype's optimization pipeline (linemerge → linesort →
    linesimplify), then emits one .gcode file per SVG layer using the 'ddcs'
    gwrite profile defined in vpype.toml.

    Stroke optimization minimizes pen lifts and travel distance, which matters
    a lot for plotter throughput and pen-mount wear.

.PARAMETER InputSvg
    Path to the source SVG.

.PARAMETER OutputDir
    Folder where the .gcode files land. Created if missing. Defaults to
    .\out\<svg-basename>\

.PARAMETER Tolerance
    linesimplify tolerance (default 0.1mm). Larger = fewer vertices.

.EXAMPLE
    .\plot.ps1 -InputSvg .\art\test.svg

.EXAMPLE
    .\plot.ps1 -InputSvg .\art\test.svg -OutputDir .\out\test -Tolerance 0.05
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$InputSvg,

    [string]$OutputDir,

    [string]$Tolerance = "0.1mm"
)

$ErrorActionPreference = "Stop"

# Resolve repo root (this script lives at the repo root)
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Vpype    = Join-Path $RepoRoot ".venv\Scripts\vpype.exe"
$Config   = Join-Path $RepoRoot "vpype.toml"

if (-not (Test-Path $Vpype))  { throw "vpype not found at $Vpype. Run setup first (see README)." }
if (-not (Test-Path $Config)) { throw "vpype.toml not found at $Config." }
if (-not (Test-Path $InputSvg)) { throw "Input SVG not found: $InputSvg" }

$InputSvg = (Resolve-Path $InputSvg).Path

if (-not $OutputDir) {
    $baseName  = [IO.Path]::GetFileNameWithoutExtension($InputSvg)
    $OutputDir = Join-Path $RepoRoot "out\$baseName"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$OutputDir = (Resolve-Path $OutputDir).Path

$OutPattern = Join-Path $OutputDir "layer_%_lid%_%_name%.gcode"

Write-Host "Input  : $InputSvg"
Write-Host "Output : $OutputDir"
Write-Host "Config : $Config"
Write-Host ""

& $Vpype --config $Config `
    read $InputSvg `
    linemerge `
    linesort `
    linesimplify -t $Tolerance `
    forlayer `
        gwrite -p ddcs $OutPattern `
    end

if ($LASTEXITCODE -ne 0) {
    throw "vpype exited with code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Done. Files in $OutputDir :"
Get-ChildItem $OutputDir -Filter *.gcode | Format-Table Name, Length -AutoSize
