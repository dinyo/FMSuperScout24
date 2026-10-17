# Return a pinned, official Node.js LTS runtime for reproducible smaller builds.
$ErrorActionPreference = 'Stop'
$version = 'v24.22.0'
$archiveName = "node-$version-win-x64.zip"
$cache = Join-Path $env:LOCALAPPDATA "FMSuperScout24\build-cache\node-$version-win-x64"
New-Item -ItemType Directory -Force -Path $cache | Out-Null
$archivePath = Join-Path $cache $archiveName
$sumsPath = Join-Path $cache 'SHASUMS256.txt'
$extractRoot = Join-Path $cache 'verified-runtime'
$nodeDirectory = Join-Path $extractRoot "node-$version-win-x64"
$nodePath = Join-Path $nodeDirectory 'node.exe'
$licensePath = Join-Path $nodeDirectory 'node-LICENSE.txt'

if (-not (Test-Path -LiteralPath $archivePath)) {
  Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$version/$archiveName" -OutFile $archivePath
}
if (-not (Test-Path -LiteralPath $sumsPath)) {
  Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$version/SHASUMS256.txt" -OutFile $sumsPath
}

$checksumLine = Get-Content -LiteralPath $sumsPath | Where-Object { $_ -match [regex]::Escape($archiveName) } | Select-Object -First 1
if (-not $checksumLine -or $checksumLine -notmatch '^([0-9a-fA-F]{64})\s+') {
  throw "Official checksum for $archiveName was not found."
}
$expectedHash = $Matches[1].ToLowerInvariant()
$actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualHash -ne $expectedHash) {
  throw "Node.js $version archive checksum mismatch."
}

# Extract only node.exe and its bundled notices; npm, headers and docs are not used.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $entry = $archive.GetEntry("node-$version-win-x64/node.exe")
  $licenseEntry = $archive.GetEntry("node-$version-win-x64/LICENSE")
  if (-not $entry -or -not $licenseEntry) { throw "node.exe or its license is missing from $archiveName." }
  New-Item -ItemType Directory -Force -Path $nodeDirectory | Out-Null
  foreach ($file in @(@{ Entry = $entry; Path = $nodePath }, @{ Entry = $licenseEntry; Path = $licensePath })) {
    $source = $file.Entry.Open()
    try {
      $target = [IO.File]::Open($file.Path, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
      try { $source.CopyTo($target) } finally { $target.Dispose() }
    } finally { $source.Dispose() }
  }
} finally { $archive.Dispose() }

$runtimeVersion = (& $nodePath --version).Trim()
if ($runtimeVersion -ne $version) { throw "Expected Node.js $version, got $runtimeVersion." }
Write-Output $nodePath
