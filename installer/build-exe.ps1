# Bouwt de standalone FM24 installer: dist\FMSuperScout24-Setup.exe.
# De installatie bevat alleen de viewer en de self-contained native memory reader.
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $repo 'dist'
$stage = Join-Path $dist 'stage'

$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
          "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
          "${env:ProgramFiles}\Inno Setup 6\ISCC.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 (ISCC.exe) niet gevonden.' }

$sdk = Join-Path $env:LOCALAPPDATA 'FMSuperScout24\dotnet-sdk\dotnet.exe'
if (-not (Test-Path $sdk)) { $sdk = Join-Path $env:LOCALAPPDATA 'FMSuperScout\dotnet-sdk\dotnet.exe' }
if (-not (Test-Path $sdk)) { $sdk = (Get-Command dotnet -ErrorAction SilentlyContinue).Source }
if (-not $sdk) { throw 'dotnet SDK ontbreekt; bouw de FM24 reader eerst.' }

$node = & (Join-Path $PSScriptRoot 'ensure-node-runtime.ps1')
& $node (Join-Path $PSScriptRoot 'make-icon.js')
& $node (Join-Path $PSScriptRoot 'make-wizard-images.js')

if ([IO.Path]::GetFullPath($stage) -ne [IO.Path]::GetFullPath((Join-Path $repo 'dist\stage'))) { throw 'Invalid staging path.' }
if (Test-Path $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
$viewer = Join-Path $stage 'viewer'
$reader = Join-Path $stage 'reader'
New-Item -ItemType Directory -Force -Path "$viewer\app", $reader | Out-Null

# The browser app is split across app\scripts and also includes meta-presets.
Copy-Item (Join-Path $repo 'app\*') -Destination "$viewer\app" -Recurse -Force
foreach ($f in @('FMSuperScout24.vbs', 'icon.ico')) {
  Copy-Item (Join-Path $PSScriptRoot $f) -Destination $viewer -Force
}
Copy-Item (Join-Path (Split-Path $node -Parent) 'node-LICENSE.txt') -Destination $viewer -Force
Copy-Item $node -Destination (Join-Path $viewer 'node.exe') -Force

& $sdk publish (Join-Path $repo 'reader\FMSuperScout.Reader.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true --nologo
if ($LASTEXITCODE -ne 0) { throw 'FM24 reader bouwen mislukt.' }
$readerOut = Join-Path $repo 'reader\bin\Release\net6.0-windows\win-x64\publish'
Copy-Item (Join-Path $readerOut 'FMSuperScout24.Reader.exe') -Destination $reader -Force
& (Join-Path $repo 'reader\native_query\build.ps1')
$nativeQueryRoot = Join-Path $repo 'reader\bin\native-query'
Get-ChildItem -LiteralPath $nativeQueryRoot | Where-Object { $_.Name -notin @('fm24_hook.obj', 'fm24_hook.lib', 'fm24_hook.exp') } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $reader -Recurse -Force }

$mb = [math]::Round((Get-ChildItem $stage -File -Recurse | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host "Stage klaar: $mb MB ongecomprimeerd"
& $iscc (Join-Path $PSScriptRoot 'FMSuperScout24.iss')
if ($LASTEXITCODE -ne 0) { throw "ISCC faalde (exit $LASTEXITCODE)" }

$exe = Join-Path $dist 'FMSuperScout24-Setup.exe'
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
Set-Content -Path "$exe.sha256" -Value "$hash  FMSuperScout24-Setup.exe" -NoNewline
$ver = (Select-String -Path (Join-Path $PSScriptRoot 'FMSuperScout24.iss') -Pattern 'MyAppVersion "([^"]+)"').Matches[0].Groups[1].Value
Set-Content -Path (Join-Path $dist 'FMSuperScout24-version.json') -Value "{`"tag`":`"v$ver`"}" -NoNewline -Encoding ascii
Write-Host "Klaar: $exe ($([math]::Round((Get-Item $exe).Length/1MB,1)) MB)" -ForegroundColor Green
Write-Host "SHA-256: $hash"
