param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [Parameter(Mandatory=$true)][string]$Pattern,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [int]$Context = 4
)

Add-Type -AssemblyName System.Drawing
$resolved = (Resolve-Path -LiteralPath $InputPath).Path
$lines = [System.IO.File]::ReadAllLines($resolved)
$hits = New-Object System.Collections.Generic.List[int]
for ($i = 0; $i -lt $lines.Length; $i++) {
  if ($lines[$i] -match $Pattern) { $hits.Add($i) }
}

$selected = New-Object System.Collections.Generic.SortedSet[int]
foreach ($hit in $hits) {
  $start = [Math]::Max(0, $hit - $Context)
  $end = [Math]::Min($lines.Length - 1, $hit + $Context)
  for ($i = $start; $i -le $end; $i++) { [void]$selected.Add($i) }
}

$renderLines = New-Object System.Collections.Generic.List[string]
$last = -2
foreach ($i in $selected) {
  if ($i -gt $last + 1) { $renderLines.Add('...') }
  $renderLines.Add(('{0,5}: {1}' -f ($i + 1), $lines[$i]))
  $last = $i
}
if ($renderLines.Count -eq 0) { $renderLines.Add('NO MATCHES: ' + $Pattern) }

$font = New-Object System.Drawing.Font('Consolas', 14)
$padding = 20
$lineHeight = 22
$width = 2000
$height = [Math]::Max(160, $padding * 2 + $lineHeight * $renderLines.Count)
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)
$brush = [System.Drawing.Brushes]::Black
for ($i = 0; $i -lt $renderLines.Count; $i++) {
  $graphics.DrawString($renderLines[$i], $font, $brush, $padding, $padding + $i * $lineHeight)
}
$bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
$font.Dispose()
