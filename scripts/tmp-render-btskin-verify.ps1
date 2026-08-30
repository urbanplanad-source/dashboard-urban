$ErrorActionPreference = 'Continue'

$verificationOutput = (& node .\scripts\tmp-verify-btskin-aug-resave.mjs 2>&1 | Out-String)
$verificationExitCode = $LASTEXITCODE

Add-Type -AssemblyName System.Drawing

$bitmap = New-Object System.Drawing.Bitmap 1400, 900
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::White)

$titleFont = New-Object System.Drawing.Font('Arial', 30, [System.Drawing.FontStyle]::Bold)
$bodyFont = New-Object System.Drawing.Font('Consolas', 17)
$statusBrush = if ($verificationExitCode -eq 0) {
    New-Object System.Drawing.SolidBrush([System.Drawing.Color]::ForestGreen)
} else {
    New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Firebrick)
}
$bodyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::Black)

$statusText = if ($verificationExitCode -eq 0) { 'LIVE API VERIFICATION: PASS' } else { 'LIVE API VERIFICATION: FAIL' }
$graphics.DrawString($statusText, $titleFont, $statusBrush, 40, 35)
$graphics.DrawString("Exit code: $verificationExitCode", $bodyFont, $bodyBrush, 40, 100)

$displayText = $verificationOutput
if ($displayText.Length -gt 5500) {
    $displayText = $displayText.Substring(0, 5500)
}
$bodyRect = New-Object System.Drawing.RectangleF(40, 150, 1320, 710)
$graphics.DrawString($displayText, $bodyFont, $bodyBrush, $bodyRect)

$outputPath = Join-Path (Get-Location) 'verification-status.png'
$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$statusBrush.Dispose()
$bodyBrush.Dispose()
$titleFont.Dispose()
$bodyFont.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

exit 0
