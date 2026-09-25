# 只在本机/局域网跑站点（Ctrl+C 停止）
param([int]$Port = 8080)

$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host '找不到 node，请先安装 Node.js' -ForegroundColor Red; exit 1 }

Write-Host "启动静态服务器，端口 $Port ……" -ForegroundColor Cyan
Write-Host '按 Ctrl+C 停止' -ForegroundColor DarkGray
& $node "$PSScriptRoot\serve.js" $Port
