# Resize the source PWA icon into the four sizes required by the manifest +
# iOS Add-to-Home-Screen. Run once after replacing public/pwa-source.png.
param(
    [string]$Source = "$PSScriptRoot\..\public\pwa-512.png",
    [string]$OutDir = "$PSScriptRoot\..\public"
)

Add-Type -AssemblyName System.Drawing

function Resize-Image {
    param([string]$srcPath, [string]$dstPath, [int]$size, [string]$bgHex = "#0F172A")
    $src = [System.Drawing.Image]::FromFile($srcPath)
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $bg = [System.Drawing.ColorTranslator]::FromHtml($bgHex)
    $g.Clear($bg)
    $g.DrawImage($src, 0, 0, $size, $size)
    $bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $src.Dispose()
    Write-Host "Wrote $dstPath ($size x $size)"
}

function Resize-Maskable {
    param([string]$srcPath, [string]$dstPath, [int]$size, [string]$bgHex = "#4338CA")
    $src = [System.Drawing.Image]::FromFile($srcPath)
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $bg = [System.Drawing.ColorTranslator]::FromHtml($bgHex)
    $g.Clear($bg)
    # Maskable spec: keep visual content inside an 80% safe zone (10% padding each side)
    $padding = [int]($size * 0.10)
    $inner = $size - 2 * $padding
    $g.DrawImage($src, $padding, $padding, $inner, $inner)
    $bmp.Save($dstPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $src.Dispose()
    Write-Host "Wrote $dstPath ($size x $size, maskable)"
}

if (-not (Test-Path $Source)) {
    Write-Error "Source icon not found: $Source"
    exit 1
}

Resize-Image -srcPath $Source -dstPath (Join-Path $OutDir "pwa-512.png") -size 512
Resize-Image -srcPath $Source -dstPath (Join-Path $OutDir "pwa-192.png") -size 192
Resize-Image -srcPath $Source -dstPath (Join-Path $OutDir "apple-touch-icon.png") -size 180
Resize-Maskable -srcPath $Source -dstPath (Join-Path $OutDir "pwa-maskable-512.png") -size 512

Write-Host "All icons generated successfully."
