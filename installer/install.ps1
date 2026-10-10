# FMSuperScout 24 installer (geen dependencies, geen adminrechten nodig).
# Installeert naast de oorspronkelijke editie in %LOCALAPPDATA%\Programs\FMSuperScout 24.
$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$target = Join-Path $env:LOCALAPPDATA 'Programs\FMSuperScout 24'

Write-Host ''
Write-Host '  FMSuperScout 24 installeren...' -ForegroundColor Green
Write-Host "  Doel: $target"

# 1) Bestanden kopieren
New-Item -ItemType Directory -Force -Path $target | Out-Null
foreach ($item in @('node.exe', 'icon.ico', 'FMSuperScout24.vbs', 'Uninstall FMSuperScout24.cmd', 'uninstall.ps1')) {
  $p = Join-Path $src $item
  if (Test-Path $p) { Copy-Item $p -Destination $target -Force }
}
$appDst = Join-Path $target 'app'
New-Item -ItemType Directory -Force -Path $appDst | Out-Null
Copy-Item (Join-Path $src 'app\*') -Destination $appDst -Recurse -Force
$readerDst = Join-Path $target 'reader'
New-Item -ItemType Directory -Force -Path $readerDst | Out-Null
Copy-Item (Join-Path $src 'reader\*') -Destination $readerDst -Recurse -Force

# 2) Snelkoppelingen (Startmenu + bureaublad) met ons icoon
$vbs = Join-Path $target 'FMSuperScout24.vbs'
$ico = Join-Path $target 'icon.ico'
$wsh = New-Object -ComObject WScript.Shell
function New-Shortcut($lnkPath) {
  $sc = $wsh.CreateShortcut($lnkPath)
  $sc.TargetPath = $vbs
  $sc.WorkingDirectory = $target
  $sc.IconLocation = "$ico,0"
  $sc.Description = 'FMSuperScout 24 - Football Manager scout-tool'
  $sc.Save()
}
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
New-Shortcut (Join-Path $startMenu 'FMSuperScout 24.lnk')
New-Shortcut (Join-Path ([Environment]::GetFolderPath('Desktop')) 'FMSuperScout 24.lnk')

# 3) Vermelding in 'Apps en onderdelen'
$reg = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\FMSuperScout24'
New-Item -Path $reg -Force | Out-Null
Set-ItemProperty $reg 'DisplayName'     'FMSuperScout 24'
Set-ItemProperty $reg 'DisplayIcon'     $ico
Set-ItemProperty $reg 'DisplayVersion'  '0.3.0'
Set-ItemProperty $reg 'Publisher'       'FMSuperScout'
Set-ItemProperty $reg 'InstallLocation' $target
Set-ItemProperty $reg 'NoModify' 1; Set-ItemProperty $reg 'NoRepair' 1
Set-ItemProperty $reg 'UninstallString' ("powershell.exe -ExecutionPolicy Bypass -File `"" + (Join-Path $target 'uninstall.ps1') + "`"")

Write-Host ''
Write-Host '  Klaar! FMSuperScout 24 staat in het Startmenu en op je bureaublad.' -ForegroundColor Green
Write-Host ''
$launch = Read-Host '  Nu starten? (j/n)'
if ($launch -eq 'j' -or $launch -eq 'y') { Start-Process $vbs }
