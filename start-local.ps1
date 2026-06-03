$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Ports = @(3000, 4000)
$ApiLog = Join-Path $Root "api-lan.log"
$ApiErrLog = Join-Path $Root "api-lan.err.log"
$WebLog = Join-Path $Root "web-lan.log"
$WebErrLog = Join-Path $Root "web-lan.err.log"

function Stop-Ports {
  param([int[]]$TargetPorts)

  $connections = Get-NetTCPConnection -LocalPort $TargetPorts -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq "Listen" }

  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq "node") {
      Stop-Process -Id $processId -Force
      Write-Host "Stopped node process $processId"
    } elseif ($process) {
      Write-Host "Port is occupied by non-node process $processId ($($process.ProcessName)); skipped."
    }
  }
}

function Start-App {
  param(
    [string]$Name,
    [string[]]$Arguments,
    [string]$OutLog,
    [string]$ErrLog
  )

  if (Test-Path $OutLog) { Remove-Item -LiteralPath $OutLog -Force }
  if (Test-Path $ErrLog) { Remove-Item -LiteralPath $ErrLog -Force }

  Start-Process `
    -FilePath "npm" `
    -ArgumentList $Arguments `
    -WorkingDirectory $Root `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -WindowStyle Hidden

  Write-Host "$Name starting..."
}

Set-Location $Root
Write-Host "Stopping existing local dev ports..."
Stop-Ports -TargetPorts $Ports

Write-Host "Starting API on http://0.0.0.0:4000"
Start-App -Name "API" -Arguments @("run", "dev:api") -OutLog $ApiLog -ErrLog $ApiErrLog

Write-Host "Starting Web on http://0.0.0.0:3000"
Start-App -Name "Web" -Arguments @("--workspace", "@aba/web", "run", "dev", "--", "-H", "0.0.0.0", "-p", "3000") -OutLog $WebLog -ErrLog $WebErrLog

Start-Sleep -Seconds 5

Write-Host ""
Write-Host "Current listeners:"
Get-NetTCPConnection -LocalPort $Ports -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq "Listen" } |
  Select-Object LocalPort, State, OwningProcess |
  Format-Table -AutoSize

$LanIp = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
  Select-Object -First 1 -ExpandProperty IPAddress

Write-Host ""
Write-Host "Local: http://localhost:3000"
if ($LanIp) {
  Write-Host "LAN:   http://$LanIp`:3000"
}
Write-Host "API:   http://localhost:4000/api/health"
Write-Host ""
Write-Host "Logs:"
Write-Host "  $ApiLog"
Write-Host "  $WebLog"
