param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$reader = Split-Path $PSScriptRoot -Parent
$output = Join-Path $reader 'bin\native-query'
$environment = Join-Path $reader 'bin\native-query-build'
& (Join-Path $PSScriptRoot 'build-inprocess.ps1')
if (-not (Test-Path (Join-Path $environment 'Scripts\python.exe'))) {
  & $Python -m venv $environment
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the native-query build environment.' }
}
$builder = Join-Path $environment 'Scripts\python.exe'
& $builder -m pip install --disable-pip-version-check -r (Join-Path $PSScriptRoot 'requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Could not install the native-query build dependencies.' }
& $builder -m pip uninstall --disable-pip-version-check --yes unicorn
if ($LASTEXITCODE -ne 0) { throw 'Could not remove the obsolete Unicorn build dependency.' }
& $builder -m PyInstaller --noconfirm --clean --onedir --contents-directory _native-runtime --console --name FMSuperScout24.NativeQuery --distpath (Join-Path $environment 'dist') --workpath (Join-Path $environment 'work') --specpath $environment (Join-Path $PSScriptRoot 'query.py')
if ($LASTEXITCODE -ne 0) { throw 'Could not build the native-query worker.' }
Remove-Item (Join-Path $output '_native-runtime') -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item (Join-Path $output 'licenses') -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $output | Out-Null
Copy-Item (Join-Path $environment 'dist\FMSuperScout24.NativeQuery\*') -Destination $output -Recurse -Force
$licenses = Join-Path $output 'licenses'
New-Item -ItemType Directory -Force -Path $licenses | Out-Null
& $builder -c "import sys,shutil; from pathlib import Path; shutil.copyfile(Path(sys.base_prefix) / 'LICENSE.txt',Path(sys.argv[1]) / 'Python-LICENSE.txt'); import PyInstaller; shutil.copyfile(Path(PyInstaller.__file__).parent.parent / 'pyinstaller-6.22.3.dist-info' / 'licenses' / 'COPYING.txt',Path(sys.argv[1]) / 'PyInstaller-COPYING.txt')" $licenses
if ($LASTEXITCODE -ne 0) { throw 'Could not bundle the runtime license files.' }
Copy-Item (Join-Path $PSScriptRoot 'NOTICE.txt') $licenses -Force
Write-Host "Built $output\FMSuperScout24.NativeQuery.exe"
