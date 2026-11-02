# Installs or updates INV Utility on an IIS server. Run in an Administrator PowerShell
# from the extracted package folder:
#   powershell -ExecutionPolicy Bypass -File .\setup-iis.ps1 -Port 8080
# Re-run the same command with a newer package to update; backend\.env on the server is kept.
#
# Creates two IIS sites:
#   InvUtility     (port -Port)    - the React screens; forwards /api/* to the API site
#   InvUtilityApi  (port -ApiPort) - the Node backend, started and managed by IIS (HttpPlatformHandler)

param(
  [int]$Port = 8080,
  [int]$ApiPort = 5050,
  [string]$InstallDir = 'C:\inetpub\InvUtility',
  [string]$SiteName = 'InvUtility',
  [string]$ApiSiteName = 'InvUtilityApi'
)

$ErrorActionPreference = 'Stop'
$siteDir = Join-Path $InstallDir 'site'
$apiDir = Join-Path $InstallDir 'backend'

# --- Prerequisites -----------------------------------------------------------
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script in an Administrator PowerShell.'
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  throw 'Node.js is not installed. Install the LTS version from https://nodejs.org and run again.'
}
if (-not (Get-Service W3SVC -ErrorAction SilentlyContinue)) {
  throw 'IIS is not installed. Enable "Internet Information Services" in Windows Features / Server Manager.'
}
if (-not (Test-Path "$env:windir\System32\inetsrv\rewrite.dll")) {
  throw 'IIS URL Rewrite module is missing. Install it from https://www.iis.net/downloads/microsoft/url-rewrite'
}
if (-not (Test-Path "$env:ProgramFiles\IIS\Application Request Routing")) {
  throw 'IIS Application Request Routing (ARR) is missing. Install it from https://www.iis.net/downloads/microsoft/application-request-routing'
}
if (-not (Test-Path "$env:windir\System32\inetsrv\httpPlatformHandler.dll")) {
  throw 'IIS HttpPlatformHandler module is missing. Install it from https://www.iis.net/downloads/microsoft/httpplatformhandler'
}
if (-not (Test-Path "$env:windir\System32\inetsrv\warmup.dll")) {
  throw 'IIS "Application Initialization" feature is missing (needed so the sync schedules start after a reboot). Enable it in Windows Features / Server Manager under Web Server > Application Development.'
}
Import-Module WebAdministration

# --- Remove the Windows service used by older versions of this package ---------
$oldService = Get-Service -DisplayName 'InvUtility Backend' -ErrorAction SilentlyContinue
if ($oldService) {
  Write-Host 'Removing old InvUtility Backend Windows service...'
  if ($oldService.Status -eq 'Running') { Stop-Service $oldService.Name -Force }
  sc.exe delete $oldService.Name | Out-Null
}

# --- Copy files ----------------------------------------------------------------
if (Test-Path "IIS:\AppPools\$ApiSiteName") {
  if ((Get-WebAppPoolState -Name $ApiSiteName).Value -ne 'Stopped') {
    Write-Host 'Stopping backend...'
    Stop-WebAppPool -Name $ApiSiteName
    Start-Sleep -Seconds 3
  }
}

$envFile = Join-Path $apiDir '.env'
$savedEnv = if (Test-Path $envFile) { Get-Content $envFile -Raw } else { $null }

Write-Host "Copying files to $InstallDir..."
New-Item -ItemType Directory -Force $InstallDir | Out-Null
robocopy (Join-Path $PSScriptRoot 'site') $siteDir /MIR /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "File copy failed (robocopy exit $LASTEXITCODE)" }
robocopy (Join-Path $PSScriptRoot 'backend') $apiDir /MIR /XD logs daemon /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "File copy failed (robocopy exit $LASTEXITCODE)" }
if ($savedEnv) { Set-Content $envFile $savedEnv -NoNewline -Encoding ascii }

# Fill in this server's node.exe and install paths
$apiConfig = Join-Path $apiDir 'web.config'
(Get-Content $apiConfig -Raw).Replace('__NODE_EXE__', $node.Source).Replace('__APP_DIR__', $apiDir) |
  Set-Content $apiConfig -Encoding utf8

# Point the screens' /api forwarding at the API site's port
$siteConfig = Join-Path $siteDir 'web.config'
(Get-Content $siteConfig -Raw).Replace('http://localhost:5050/', "http://localhost:$ApiPort/") |
  Set-Content $siteConfig -Encoding utf8

# --- IIS -------------------------------------------------------------------------
Write-Host 'Enabling ARR proxy...'
Set-WebConfigurationProperty -PSPath 'MACHINE/WEBROOT/APPHOST' -Filter 'system.webServer/proxy' -Name 'enabled' -Value 'True'

foreach ($pool in $SiteName, $ApiSiteName) {
  if (-not (Test-Path "IIS:\AppPools\$pool")) {
    New-WebAppPool -Name $pool | Out-Null
    Set-ItemProperty "IIS:\AppPools\$pool" -Name managedRuntimeVersion -Value ''
  }
}
# Keep the Node process running (it runs the sync schedules): no shutdown after 20 idle minutes,
# no automatic recycle every 29 hours, and start it when IIS starts
Set-ItemProperty "IIS:\AppPools\$ApiSiteName" -Name processModel.idleTimeout -Value '00:00:00'
Set-ItemProperty "IIS:\AppPools\$ApiSiteName" -Name recycling.periodicRestart.time -Value '00:00:00'
Set-ItemProperty "IIS:\AppPools\$ApiSiteName" -Name startMode -Value 'AlwaysRunning'

# The backend writes its logs here, so its app pool needs write access
$logDir = Join-Path $apiDir 'logs'
New-Item -ItemType Directory -Force $logDir | Out-Null
icacls $logDir /grant "IIS AppPool\${ApiSiteName}:(OI)(CI)M" | Out-Null

if (-not (Test-Path "IIS:\Sites\$ApiSiteName")) {
  Write-Host "Creating IIS site '$ApiSiteName' on port $ApiPort..."
  New-Website -Name $ApiSiteName -Port $ApiPort -PhysicalPath $apiDir -ApplicationPool $ApiSiteName | Out-Null
}
Set-ItemProperty "IIS:\Sites\$ApiSiteName" -Name applicationDefaults.preloadEnabled -Value $true
# The backend's web.config registers its own handler, which IIS locks by default
Set-WebConfiguration -PSPath 'MACHINE/WEBROOT/APPHOST' -Location $ApiSiteName -Filter 'system.webServer/handlers' `
  -Metadata overrideMode -Value Allow

if (-not (Test-Path "IIS:\Sites\$SiteName")) {
  Write-Host "Creating IIS site '$SiteName' on port $Port..."
  New-Website -Name $SiteName -Port $Port -PhysicalPath $siteDir -ApplicationPool $SiteName | Out-Null
}

Start-WebAppPool -Name $ApiSiteName -ErrorAction SilentlyContinue
foreach ($site in $ApiSiteName, $SiteName) { Start-Website -Name $site -ErrorAction SilentlyContinue }

if (-not (Get-NetFirewallRule -DisplayName "$SiteName HTTP $Port" -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName "$SiteName HTTP $Port" -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
}

# --- Check ----------------------------------------------------------------------
try {
  $menu = Invoke-RestMethod "http://localhost:$Port/api/menu" -TimeoutSec 60
  Write-Host "OK - site is up at http://$($env:COMPUTERNAME):$Port ($($menu.Count) menus loaded from the database)" -ForegroundColor Green
  Write-Host "Sync runs: http://localhost:$ApiPort/api/sync/log"
} catch {
  Write-Warning "Sites created, but the API check failed: $($_.Exception.Message)"
  Write-Warning "Check the backend logs in $logDir and that this server can reach the MySQL server."
}
