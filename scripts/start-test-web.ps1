# 隔离启动 dsh web 用于插件测试：独立 DSH_HOME，不影响桌面版 profile
$root = Split-Path $PSScriptRoot -Parent
$env:DSH_HOME = Join-Path $root 'scripts\test-dsh-home'
New-Item -ItemType Directory -Force -Path $env:DSH_HOME | Out-Null
Set-Location $root
node node_modules/@deepseek-ai/dsh/lib/bin.js web --patch (Join-Path $PSScriptRoot 'test.patch.yml') --port 3081 --no-open
