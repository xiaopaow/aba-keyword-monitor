$ErrorActionPreference = "Stop"

$Ports = @(3000, 4000)

$connections = Get-NetTCPConnection -LocalPort $Ports -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq "Listen" }

if (-not $connections) {
  Write-Host "No local dev processes found on ports 3000 or 4000."
  exit 0
}

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

Write-Host "Done."
