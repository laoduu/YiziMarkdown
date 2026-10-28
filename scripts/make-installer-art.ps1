# 生成 NSIS 安装向导位图：侧栏 164x314 + 页眉 150x57
#
# 为什么是脚本而不是手工 P 图：这两张 BMP 是打包期硬依赖
# （tauri.conf.json > bundle.windows.nsis.sidebarImage / headerImage），
# 品牌色或图标一变就得重出；脚本能把「尺寸 / 配色 / 布局」写死成可复现的步骤。
#
# 用法（Windows）：
#   powershell -ExecutionPolicy Bypass -File scripts/make-installer-art.ps1
# 输出：
#   src-tauri/installer/sidebar.bmp
#   src-tauri/installer/header.bmp
#
# 尺寸口径来自 Tauri / NSIS 建议值：
#   sidebar 164x314（欢迎页 / 完成页左栏）、header 150x57（其余页右上角）
# 统一存 24bpp BMP：NSIS 的眉图/侧栏图不认带 alpha 的 PNG，BMP 最稳。

param(
  [string]$OutDir = (Join-Path $PSScriptRoot '..\src-tauri\installer'),
  [string]$Icon = (Join-Path $PSScriptRoot '..\src-tauri\icons\icon.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force $OutDir | Out-Null

# 品牌色取应用图标同款：上浅橙 → 下深橙
$topColor = [System.Drawing.Color]::FromArgb(255, 255, 201, 75)
$bottomColor = [System.Drawing.Color]::FromArgb(255, 249, 115, 22)
$inkColor = [System.Drawing.Color]::FromArgb(255, 51, 51, 51)

function New-Canvas([int]$width, [int]$height) {
  $bmp = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  # 24bpp 没有透明通道，先铺白，避免未绘制区域留下黑底
  $g.Clear([System.Drawing.Color]::White)
  return @($bmp, $g)
}

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-Font([string]$family, [single]$size, [System.Drawing.FontStyle]$style) {
  return New-Object System.Drawing.Font $family, $size, $style, ([System.Drawing.GraphicsUnit]::Point)
}

# 文字统一走「矩形 + 居中」：比手算基线稳，换字号也不会跑位
function Draw-CenteredText($g, [string]$text, $font, $color, [single]$x, [single]$y, [single]$w, [single]$h) {
  $brush = New-Object System.Drawing.SolidBrush $color
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF $x, $y, $w, $h
  $g.DrawString($text, $font, $brush, $rect, $format)
  $brush.Dispose()
  $format.Dispose()
}

# ---------- 侧栏（欢迎页 / 完成页）----------
$sidebarWidth = 164
$sidebarHeight = 314
$sidebarBmp, $sg = New-Canvas $sidebarWidth $sidebarHeight

$sidebarRect = New-Object System.Drawing.Rectangle 0, 0, $sidebarWidth, $sidebarHeight
$gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush $sidebarRect, $topColor, $bottomColor, 90
$sg.FillRectangle($gradient, $sidebarRect)
$gradient.Dispose()

# 白色圆角卡片托住图标：图标本身是橙色，直接压在橙底上会糊成一片
$cardPath = New-RoundedPath 22 42 120 120 26
$cardBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
$sg.FillPath($cardBrush, $cardPath)
$cardBrush.Dispose()
$cardPath.Dispose()

$iconImage = [System.Drawing.Image]::FromFile((Resolve-Path $Icon).Path)
$sg.DrawImage($iconImage, 36, 56, 92, 92)
$iconImage.Dispose()

$titleFont = New-Font 'Segoe UI' 13 ([System.Drawing.FontStyle]::Bold)
$subFont = New-Font 'Segoe UI' 7.5 ([System.Drawing.FontStyle]::Regular)
$white = [System.Drawing.Color]::FromArgb(255, 255, 255, 255)
$whiteSoft = [System.Drawing.Color]::FromArgb(255, 255, 245, 230)
Draw-CenteredText $sg 'YiziMarkdown' $titleFont $white 0 178 $sidebarWidth 22
Draw-CenteredText $sg 'Markdown Editor' $subFont $whiteSoft 0 202 $sidebarWidth 16
Draw-CenteredText $sg 'md.yizigpt.com' $subFont $whiteSoft 0 282 $sidebarWidth 16

$sidebarPath = Join-Path $OutDir 'sidebar.bmp'
$sidebarBmp.Save($sidebarPath, [System.Drawing.Imaging.ImageFormat]::Bmp)

# ---------- 页眉（安装 / 卸载页右上角）----------
$headerWidth = 150
$headerHeight = 57
$headerBmp, $hg = New-Canvas $headerWidth $headerHeight

$headerIcon = [System.Drawing.Image]::FromFile((Resolve-Path $Icon).Path)
$hg.DrawImage($headerIcon, 8, 11, 35, 35)
$headerIcon.Dispose()

$headerFont = New-Font 'Segoe UI' 10 ([System.Drawing.FontStyle]::Bold)
Draw-CenteredText $hg 'YiziMarkdown' $headerFont $inkColor 46 0 102 57

$headerPath = Join-Path $OutDir 'header.bmp'
$headerBmp.Save($headerPath, [System.Drawing.Imaging.ImageFormat]::Bmp)

$titleFont.Dispose()
$subFont.Dispose()
$headerFont.Dispose()
$sg.Dispose()
$sidebarBmp.Dispose()
$hg.Dispose()
$headerBmp.Dispose()

Write-Host "已生成：$sidebarPath（164x314）、$headerPath（150x57）"
