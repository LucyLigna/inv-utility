# Builds a ready-to-copy deployment package for the IIS server.
# Run on the development machine:  powershell -ExecutionPolicy Bypass -File deploy\build-package.ps1
# Output: publish\InvUtility.zip  (copy it to the server, extract, run setup-iis.ps1 as Administrator)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $root 'publish'
$pkg = Join-Path $out 'InvUtility'

if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force "$pkg\site", "$pkg\backend" | Out-Null

Write-Host 'Building frontend...'
Push-Location (Join-Path $root 'Frontend')
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
Pop-Location
Copy-Item (Join-Path $root 'Frontend\dist\*') "$pkg\site" -Recurse

Write-Host 'Copying backend...'
$backend = Join-Path $root 'Backend'
foreach ($item in 'src', 'web.config', 'package.json', 'package-lock.json', '.env', '.env.example') {
  Copy-Item (Join-Path $backend $item) "$pkg\backend" -Recurse
}
Push-Location "$pkg\backend"
npm ci --omit=dev
if ($LASTEXITCODE -ne 0) { throw 'Backend npm install failed' }
Pop-Location

Copy-Item (Join-Path $PSScriptRoot 'setup-iis.ps1'), (Join-Path $PSScriptRoot 'README.md'),
  (Join-Path $PSScriptRoot 'invutility-create.sql') $pkg

Compress-Archive -Path $pkg -DestinationPath (Join-Path $out 'InvUtility.zip')
Write-Host "Package ready: $(Join-Path $out 'InvUtility.zip')"
