@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Claude Code 启动管理器 [高对比橙]

:: 定义橙色 ANSI 序列（208号色是标准深橙，比纯黄更容易看清）
set "ORANGE=[38;5;208m"
set "BOLD_ORANGE=[1;38;5;208m"
set "RESET=[0m"

:: 配置文件路径
set "CONFIG_FILE=%USERPROFILE%\claudecode.json"

if not exist "%CONFIG_FILE%" (
    echo %ORANGE%[错误] 找不到配置文件: %CONFIG_FILE%%RESET%
    pause
    exit /b
)

:MENU
cls
echo %ORANGE%============================================%RESET%
echo       %BOLD_ORANGE%Claude Code 模型切换工具 (v3.2)%RESET%
echo %ORANGE%============================================%RESET%
echo.

:: 使用更清晰的 PowerShell 渲染逻辑
:: 208号橙色在 PowerShell 中通过 ANSI 注入，确保颜色深沉、清晰
powershell -Command ^
    "$json = Get-Content '%CONFIG_FILE%' -Raw | ConvertFrom-Json;" ^
    "$i = 1;" ^
    "foreach ($c in $json.configs) {" ^
    "  $line = \"  [$i] $($c.name.PadRight(18)) ($($c.model))\";" ^
    "  Write-Host \"  [$i] \" -NoNewline -ForegroundColor White;" ^
    "  Write-Host \"$($c.name.PadRight(18))\" -NoNewline -ForegroundColor Cyan;" ^
    "  Write-Host \" ($($c.model))\" -ForegroundColor Yellow;" ^
    "  $i++;" ^
    "}"

echo.
echo %ORANGE%--------------------------------------------%RESET%
set /p choice="请输入编号 (退出输入 Q): "

if /i "%choice%"=="q" exit /b
if "%choice%"=="" goto MENU

:: 启动逻辑
powershell -Command ^
    "$json = Get-Content '%CONFIG_FILE%' -Raw | ConvertFrom-Json;" ^
    "$idx = [int]%choice% - 1;" ^
    "if ($idx -lt 0 -or $idx -ge $json.configs.Count) { exit 1 }" ^
    "$item = $json.configs[$idx];" ^
    "Write-Host '--------------------------------------------' -ForegroundColor DarkYellow;" ^
    "Write-Host \"已激活: $($item.name)\" -ForegroundColor Yellow;" ^
    "$env:ANTHROPIC_API_KEY = $item.api_key;" ^
    "$env:ANTHROPIC_BASE_URL = $item.base_url;" ^
    "$env:CLAUDE_CODE_PRIMARY_MODEL = $item.model;" ^
    "$env:CLAUDE_CODE_SUBAGENT_MODEL = $item.model;" ^
    "$env:ANTHROPIC_MODEL = $item.model;" ^
    "claude --dangerously-skip-permissions"

if %ERRORLEVEL% neq 0 (
    echo.
    echo [91m[错误] 无效选择或启动失败。[0m
    timeout /t 2 >nul
    goto MENU
)
pause