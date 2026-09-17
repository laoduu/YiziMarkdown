<#
.SYNOPSIS
    组装 YiziMarkdown 的发布产物：Windows 便携版 zip + 源码 zip。

.DESCRIPTION
    步骤：
      1. 把根目录的文档同步到 src-tauri/（**打包实际读取的是 src-tauri 下那一份**）
      2. 校验 release 版 exe 与全部 bundle 资源齐备
      3. 组装 .release_tmp/portable/YiziMarkdown-<版本>/ 并压缩为
         .release_tmp/YiziMarkdown_<版本>_x64-portable.zip
      4. 用 git archive 生成 .release_tmp/YiziMarkdown_<版本>_source.zip

    为什么要写成脚本：`src-tauri/tauri.conf.json` 的 bundle.resources 路径**相对 src-tauri/**，
    所以根目录的 help.md / welcome.md / changelog.md / README.md 在 src-tauri 下各有一份副本，
    打包读的是副本。build.rs 只调 tauri_build::build()，没有自动 copy —— 手动同步极易漏，
    漏了就会把旧文档打进安装包（App 内帮助/欢迎页还是老内容）。

    两个产物的来源不同，脚本会就此做校验：
      - 便携版取**工作区**文件（含未提交改动）
      - 源码包取**指定提交**（git archive，默认 HEAD）
    若工作区有未提交的已跟踪改动，或该提交里的版本号与 tauri.conf.json 不一致，脚本会告警。

.PARAMETER Ref
    源码包要打包的提交 / 标签，默认 HEAD。发版时建议显式传标签，如 -Ref v0.3.0。

.PARAMETER SkipZip
    只组装便携版目录、不压缩，也不生成源码包（调试用）。

.EXAMPLE
    pwsh scripts/make-portable.ps1
    pwsh scripts/make-portable.ps1 -Ref v0.3.0
#>
param(
    [string]$Ref = 'HEAD',
    [switch]$SkipZip
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# ---- 版本号：以 tauri.conf.json 为准 ----
$conf = Get-Content 'src-tauri/tauri.conf.json' -Raw | ConvertFrom-Json
$version = $conf.version
if (-not $version) { throw '无法从 src-tauri/tauri.conf.json 读取 version' }
Write-Host "版本: $version" -ForegroundColor Cyan

# ---- 1. 同步根目录文档到 src-tauri（打包读的是后者）----
$syncMap = @{
    'help.md'      = 'src-tauri/help.md'
    'welcome.md'   = 'src-tauri/welcome.md'
    'changelog.md' = 'src-tauri/changelog.md'
    'README.md'    = 'src-tauri/readme.md'   # 注意：目标是小写 readme.md
}
foreach ($src in $syncMap.Keys) {
    $dst = $syncMap[$src]
    if (-not (Test-Path $src)) { throw "缺少源文件: $src" }
    Copy-Item $src $dst -Force
    $a = (Get-FileHash $src -Algorithm MD5).Hash
    $b = (Get-FileHash $dst -Algorithm MD5).Hash
    if ($a -ne $b) { throw "同步失败: $src -> $dst" }
    Write-Host "  同步 $src -> $dst" -ForegroundColor DarkGray
}

# ---- 2. 校验 exe 与资源 ----
$exe = 'src-tauri/target/release/yizimarkdown.exe'
if (-not (Test-Path $exe)) {
    throw "找不到 release 版 exe：$exe`n请先运行 npm run tauri:build"
}
$exeVer = (Get-Item $exe).VersionInfo.ProductVersion
if ($exeVer -ne $version) {
    throw "exe 版本($exeVer) 与 tauri.conf.json($version) 不一致，请重新执行 npm run tauri:build"
}

$items = @('themes', 'templates', 'skills', 'docs', 'user.css', 'keybindings.json',
    'readme.md', 'welcome.md', 'changelog.md', 'help.md', 'skill-guide.md', 'icons/md-icon.ico')
foreach ($it in $items) {
    if (-not (Test-Path "src-tauri/$it")) { throw "缺少打包资源: src-tauri/$it" }
}

# ---- 3. 组装便携版 ----
$stage = ".release_tmp/portable/YiziMarkdown-$version"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

Copy-Item $exe "$stage/YiziMarkdown.exe"
foreach ($it in $items) {
    $src = "src-tauri/$it"
    if ((Get-Item $src).PSIsContainer) {
        Copy-Item $src "$stage/$it" -Recurse
    } else {
        # icons/md-icon.ico 在包里落到根目录，名为 md-icon.ico
        $name = Split-Path $it -Leaf
        Copy-Item $src "$stage/$name"
    }
}

$fileCount = (Get-ChildItem $stage -Recurse -File).Count
$sizeMB = [math]::Round((Get-ChildItem $stage -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "组装完成: $stage  ($fileCount 个文件, $sizeMB MB)" -ForegroundColor Green

if ($SkipZip) { return }

$portableZip = ".release_tmp/YiziMarkdown_${version}_x64-portable.zip"
if (Test-Path $portableZip) { Remove-Item $portableZip -Force }
Compress-Archive -Path $stage -DestinationPath $portableZip -CompressionLevel Optimal
Write-Host "便携版: $portableZip  ($([math]::Round((Get-Item $portableZip).Length/1MB,1)) MB)" -ForegroundColor Green

# ---- 4. 源码包（git archive：只含被跟踪文件，天然排除 node_modules/target/dist）----
if (-not (git rev-parse --verify --quiet "$Ref^{commit}")) {
    throw "找不到提交或标签: $Ref"
}

# 便携版取工作区、源码包取提交 —— 有未提交改动时两者会不一致，先提醒。
# 只检查**真正会被打进便携版**的路径（根目录四份文档 + src-tauri 全部资源），
# 否则改个脚本也会误报。
$bundledPaths = @('help.md', 'welcome.md', 'changelog.md', 'README.md', 'src-tauri')
$dirty = @(git status --porcelain --untracked-files=no -- $bundledPaths)
if ($dirty.Count -gt 0) {
    Write-Warning "打包内容有 $($dirty.Count) 处未提交改动：便携版含这些改动，源码包($Ref)不含。发版前请先提交。"
    $dirty | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkYellow }
}

# 提交里的版本号必须与 tauri.conf.json 一致，否则源码包与安装包不同版本
$refConf = git show "${Ref}:src-tauri/tauri.conf.json" | ConvertFrom-Json
if ($refConf.version -ne $version) {
    throw "提交 $Ref 里的版本号($($refConf.version)) 与工作区($version) 不一致；请先提交或换用 -Ref"
}

$sourceZip = ".release_tmp/YiziMarkdown_${version}_source.zip"
if (Test-Path $sourceZip) { Remove-Item $sourceZip -Force }
git archive --format=zip -o $sourceZip $Ref
if ($LASTEXITCODE -ne 0) { throw "git archive 失败" }
Write-Host "源码包: $sourceZip  ($([math]::Round((Get-Item $sourceZip).Length/1MB,1)) MB, ref=$Ref)" -ForegroundColor Green

Write-Host "`n发布产物已就绪：" -ForegroundColor Cyan
Get-ChildItem '.release_tmp/YiziMarkdown_*' | Sort-Object Name |
    ForEach-Object { "  {0,-46} {1,6} MB" -f $_.Name, [math]::Round($_.Length/1MB,2) }
