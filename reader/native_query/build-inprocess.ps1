$ErrorActionPreference = 'Stop'
$reader = Split-Path $PSScriptRoot -Parent
$output = Join-Path $reader 'bin\native-query'
$source = Join-Path $PSScriptRoot 'inprocess\fm24_hook.cpp'
New-Item -ItemType Directory -Force -Path $output | Out-Null

$vsDevCmd = @(
  'C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\Common7\Tools\VsDevCmd.bat',
  'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat',
  'C:\Program Files (x86)\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat'
) | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $vsDevCmd) {
  $vswhere = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
  if (Test-Path -LiteralPath $vswhere) {
    $installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($installation) {
      $candidate = Join-Path $installation 'Common7\Tools\VsDevCmd.bat'
      if (Test-Path -LiteralPath $candidate) { $vsDevCmd = $candidate }
    }
  }
}
if (-not $vsDevCmd) { throw 'Visual Studio C++ Build Tools are required to build the FM24 in-process hook.' }

$dll = Join-Path $output 'FMSuperScout24.FM24Hook.dll'
$batch = Join-Path $output 'build-inprocess.cmd'
@"
@echo off
call "$vsDevCmd" -arch=x64 -host_arch=x64 >nul
if errorlevel 1 exit /b %errorlevel%
cl.exe /nologo /LD /MT /O2 /EHsc /std:c++17 /DUNICODE /D_UNICODE /Fo:"$output\fm24_hook.obj" "$source" /link /IMPLIB:"$output\fm24_hook.lib" /OUT:"$dll" user32.lib
exit /b %errorlevel%
"@ | Set-Content -LiteralPath $batch -Encoding Default

try {
  & $env:ComSpec /d /c "`"$batch`""
  if ($LASTEXITCODE -ne 0) { throw 'Could not compile the FM24 in-process hook DLL.' }
} finally {
  Remove-Item -LiteralPath $batch -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath (Join-Path $output 'fm24_hook.obj'), (Join-Path $output 'fm24_hook.lib'), (Join-Path $output 'fm24_hook.exp') -Force -ErrorAction SilentlyContinue
}
Write-Host "Built $dll"
