# generate_black_gold.ps1 — rebrand all app + store assets to Black + Gold
# ("Members" brand: rich black #0C0C0E, champagne gold ramp #EBCF8E -> #A7803A).
#
# Recolors the F-pin mark in place: mark pixels are detected by GREEN/BLUE
# dominance over red (NOT brightness — the prior pipeline's lesson: white
# corners and gray AA edges fool brightness thresholds). The mark's original
# green->blue gradient position (blue fraction) drives the position in the gold
# ramp, so the gradient survives the recolor. Everything else becomes the black
# canvas. Run from the repo root:
#   powershell -ExecutionPolicy Bypass -File store-assets\generate_black_gold.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root   = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'app\assets'
$store  = $PSScriptRoot

# Brand stops
$bg      = @(12, 12, 14)      # #0C0C0E rich black
$goldTop = @(235, 207, 142)   # #EBCF8E champagne (top of mark)
$goldBot = @(167, 128, 58)    # #A7803A bronze (tip of pin)

# Compiled recolor core — PowerShell per-pixel loops are far too slow for the
# ~5M pixels across these assets; LockBits + C# runs it in well under a second.
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class BrandRecolor {
  static int Lerp(int a, int b, double t) { return (int)(a + (b - a) * t); }

  public static void Recolor(string inPath, string outPath,
      int bgR, int bgG, int bgB,
      int topR, int topG, int topB,
      int botR, int botG, int botB) {
    using (var src = new Bitmap(inPath)) {
      var rect = new Rectangle(0, 0, src.Width, src.Height);
      using (var dst = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb))
      using (var srcArgb = src.Clone(rect, PixelFormat.Format32bppArgb)) {
        var sd = srcArgb.LockBits(rect, ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        var dd = dst.LockBits(rect, ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
        int n = src.Width * src.Height * 4;
        var px = new byte[n];
        Marshal.Copy(sd.Scan0, px, 0, n);
        for (int i = 0; i < n; i += 4) {
          int b = px[i], g = px[i + 1], r = px[i + 2]; // BGRA
          int maxGB = Math.Max(g, b);
          // markness: green/blue dominance over red (AA edges land between)
          double s = (maxGB - r - 25) / 70.0;
          if (s < 0) s = 0; else if (s > 1) s = 1;
          int nr = bgR, ng = bgG, nb = bgB;
          if (s > 0) {
            // gradient position: blue fraction of the mark color, normalized
            double t = b / (g + b + 0.001);
            t = (t - 0.30) / 0.40;
            if (t < 0) t = 0; else if (t > 1) t = 1;
            int gr = Lerp(topR, botR, t), gg = Lerp(topG, botG, t), gb = Lerp(topB, botB, t);
            nr = Lerp(bgR, gr, s); ng = Lerp(bgG, gg, s); nb = Lerp(bgB, gb, s);
          }
          px[i] = (byte)nb; px[i + 1] = (byte)ng; px[i + 2] = (byte)nr; // alpha untouched
        }
        Marshal.Copy(px, 0, dd.Scan0, n);
        srcArgb.UnlockBits(sd);
        dst.UnlockBits(dd);
        dst.Save(outPath, ImageFormat.Png);
      }
    }
  }
}
'@

function Recolor-Image([string]$inPath, [string]$outPath) {
  if (Test-Path $outPath) { Remove-Item $outPath -Force }
  [BrandRecolor]::Recolor($inPath, $outPath,
    $bg[0], $bg[1], $bg[2],
    $goldTop[0], $goldTop[1], $goldTop[2],
    $goldBot[0], $goldBot[1], $goldBot[2])
  Write-Host "recolored -> $outPath"
}

function Save-Flat([System.Drawing.Bitmap]$bmp, [string]$outPath, [int]$w, [int]$h) {
  # 24bpp (no alpha) resize — App Store marketing icon requires no alpha.
  $flat = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($flat)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($bmp, 0, 0, $w, $h)
  $g.Dispose()
  if (Test-Path $outPath) { Remove-Item $outPath -Force }
  $flat.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $flat.Dispose()
  Write-Host "wrote -> $outPath"
}

# 1) In-app assets (recolored in place)
Recolor-Image (Join-Path $assets 'icon.png')          (Join-Path $assets 'icon_new.png')
Recolor-Image (Join-Path $assets 'splash.png')        (Join-Path $assets 'splash_new.png')
Recolor-Image (Join-Path $assets 'adaptive-icon.png') (Join-Path $assets 'adaptive-icon_new.png')
Move-Item (Join-Path $assets 'icon_new.png')          (Join-Path $assets 'icon.png') -Force
Move-Item (Join-Path $assets 'splash_new.png')        (Join-Path $assets 'splash.png') -Force
Move-Item (Join-Path $assets 'adaptive-icon_new.png') (Join-Path $assets 'adaptive-icon.png') -Force

# 2) Store assets derived from the recolored icon
$icon = [System.Drawing.Bitmap]::FromFile((Join-Path $assets 'icon.png'))
Save-Flat $icon (Join-Path $store 'ios-app-store-icon-1024.png') 1024 1024
Save-Flat $icon (Join-Path $store 'android-play-icon-512.png') 512 512

# 3) Feature graphic 1024x500: mark + FORETERA wordmark lockup on black
$fg = New-Object System.Drawing.Bitmap(1024, 500, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($fg)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.Clear([System.Drawing.Color]::FromArgb($bg[0], $bg[1], $bg[2]))
# mark (the icon is the mark centered on black, so drawing it blends seamlessly)
$g.DrawImage($icon, 60, 70, 360, 360)
# wordmark
$ivory = [System.Drawing.Color]::FromArgb(245, 241, 230)
$gold  = [System.Drawing.Color]::FromArgb(212, 179, 106)
$font  = New-Object System.Drawing.Font('Segoe UI', 64, [System.Drawing.FontStyle]::Bold)
$sub   = New-Object System.Drawing.Font('Segoe UI', 20, [System.Drawing.FontStyle]::Regular)
$g.DrawString('FORETERA', $font, (New-Object System.Drawing.SolidBrush($ivory)), 410, 170)
# champagne hairline under the wordmark
$pen = New-Object System.Drawing.Pen($gold, 3)
$g.DrawLine($pen, 422, 282, 940, 282)
$g.DrawString('Post a match. Settle the score.', $sub, (New-Object System.Drawing.SolidBrush($gold)), 420, 300)
$g.Dispose()
$icon.Dispose()
$out = Join-Path $store 'android-feature-graphic-1024x500.png'
if (Test-Path $out) { Remove-Item $out -Force }
$fg.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$fg.Dispose()
Write-Host "wrote -> $out"
Write-Host 'Done.'
