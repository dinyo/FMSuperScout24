# Bouwt een deelbaar installatiepakket: bundelt node.exe + app + installer in een map
# en zipt die tot FMSuperScout24-Setup.zip. Draai dit vanuit de repo (heeft node.exe nodig).
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $repo 'dist'
$pkg = Join-Path $dist 'FMSuperScout24'

# Icoon (opnieuw) genereren
node (Join-Path $PSScriptRoot 'make-icon.js')

# Schone dist-map
if (Test-Path $pkg) { Remove-Item $pkg -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pkg | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $pkg 'app') | Out-Null

# Bouw de losse FM24 memory reader als één self-contained 64-bit executable.
$sdk = Join-Path $env:LOCALAPPDATA 'FMSuperScout24\dotnet-sdk\dotnet.exe'
if (-not (Test-Path $sdk)) { $sdk = Join-Path $env:LOCALAPPDATA 'FMSuperScout\dotnet-sdk\dotnet.exe' }
if (-not (Test-Path $sdk)) { $sdk = (Get-Command dotnet -ErrorAction SilentlyContinue).Source }
if (-not $sdk) { throw 'dotnet SDK ontbreekt; bouw reader/FMSuperScout.Reader.csproj eerst.' }
& $sdk publish (Join-Path $repo 'reader\FMSuperScout.Reader.csproj') -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:EnableCompressionInSingleFile=true --nologo
if ($LASTEXITCODE -ne 0) { throw 'FM24 reader bouwen mislukt.' }
$readerOut = Join-Path $repo 'reader\bin\Release\net6.0-windows\win-x64\publish'
if (-not (Test-Path (Join-Path $readerOut 'FMSuperScout24.Reader.exe'))) { throw 'FMSuperScout24.Reader.exe ontbreekt na publish.' }
New-Item -ItemType Directory -Force -Path (Join-Path $pkg 'reader') | Out-Null
Copy-Item (Join-Path $readerOut 'FMSuperScout24.Reader.exe') -Destination (Join-Path $pkg 'reader') -Force

# App-bestanden (alleen wat de tool nodig heeft; geen testdata/servertooling voor devs)
foreach ($f in @('server.js', 'fmf.js', 'index.html', 'app.js', 'nations.js', 'style.css', 'logo.svg')) {
  Copy-Item (Join-Path $repo "app\$f") -Destination (Join-Path $pkg 'app') -Force
}

# Installer-bestanden
foreach ($f in @('FMSuperScout24.vbs', 'icon.ico', 'install.ps1', 'uninstall.ps1',
                 'Install FMSuperScout24.cmd', 'Uninstall FMSuperScout24.cmd', 'README.txt')) {
  $p = Join-Path $PSScriptRoot $f
  if (Test-Path $p) { Copy-Item $p -Destination $pkg -Force }
}

# node.exe meebundelen zodat vrienden zonder Node het gewoon kunnen draaien
$node = (Get-Command node).Source
Copy-Item $node -Destination (Join-Path $pkg 'node.exe') -Force
Write-Host "node.exe gebundeld ($([math]::Round((Get-Item $node).Length/1MB,1)) MB)"

# Zippen
$zip = Join-Path $dist 'FMSuperScout24-Setup.zip'
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $pkg -DestinationPath $zip -CompressionLevel Optimal
Write-Host ''
Write-Host "Klaar: $zip" -ForegroundColor Green
Write-Host "Deel dit zip-bestand. Ontvangers pakken het uit en draaien 'Install FMSuperScout24.cmd'."
