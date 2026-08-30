$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$targets = @(
  'scripts/tmp-resave-btskin-aug-consults.mjs',
  'scripts/tmp-verify-btskin-aug-resave.mjs',
  'scripts/tmp-inspect-consult-paths.mjs'
)

$parts = New-Object System.Collections.Generic.List[string]
foreach ($target in $targets) {
  if (Test-Path -LiteralPath $target) {
    $parts.Add("===== $target =====")
    $parts.Add((Get-Content -LiteralPath $target -Raw -Encoding UTF8))
  }
}

$indexMatches = Select-String -LiteralPath 'index.html' -Pattern 'consult|Consult|상담|inquir|channel' -Context 2,5 | Select-Object -First 80 | Out-String -Width 220
$parts.Add('===== index.html targeted matches =====')
$parts.Add($indexMatches)

$text = [string]::Join("`r`n", $parts)
$font = New-Object System.Drawing.Font('Consolas', 13)
$width = 2200
$lineHeight = 22
$lines = $text -split "`r?`n"
$height = [Math]::Max(1200, [Math]::Min(30000, ($lines.Count + 4) * $lineHeight))
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$brush = [System.Drawing.Brushes]::Black
$y = 15
foreach ($line in $lines) {
  if ($y -gt ($height - 30)) { break }
  $graphics.DrawString($line, $font, $brush, 15, $y)
  $y += $lineHeight
}
$output = Join-Path (Get-Location) 'consult-contract.png'
$bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
$font.Dispose()
Write-Output $output
