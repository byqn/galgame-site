# 本机跑站点 + Cloudflare 快速隧道，让外网能访问
# 用法：右键「使用 PowerShell 运行」，或在项目根目录执行 .\deploy\start-public.ps1
param([int]$Port = 8080)

$ErrorActionPreference = 'Stop'

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host '找不到 node，请先安装 Node.js' -ForegroundColor Red; exit 1 }

$cf = @(
  "$env:ProgramFiles\cloudflared\cloudflared.exe",
  "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
  "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $cf) {
  Write-Host '找不到 cloudflared，请先安装：winget install Cloudflare.cloudflared' -ForegroundColor Red
  exit 1
}

# 1) 起静态服务器（独立窗口，方便单独关闭）
Write-Host "→ 启动静态服务器 (端口 $Port)" -ForegroundColor Cyan
$server = Start-Process -FilePath $node -ArgumentList "`"$PSScriptRoot\serve.js`" $Port" -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 2

if ($server.HasExited) {
  Write-Host '服务器启动失败，端口可能被占用' -ForegroundColor Red
  exit 1
}
Write-Host "  本机访问: http://localhost:$Port   (服务器 PID $($server.Id))" -ForegroundColor Green

# 2) 起隧道（前台运行，Ctrl+C 结束；结束后请手动关闭服务器窗口）
Write-Host ''
Write-Host '→ 建立 Cloudflare 隧道，稍等几秒会打印公网地址' -ForegroundColor Cyan
Write-Host '  注意：这是临时地址，重启后会变；要固定域名请见 SELF-HOSTING.md' -ForegroundColor DarkGray
Write-Host ''

try {
  & $cf tunnel --url "http://localhost:$Port" --no-autoupdate
} finally {
  Write-Host ''
  Write-Host '隧道已结束，正在关闭静态服务器……' -ForegroundColor DarkGray
  if (-not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
}
