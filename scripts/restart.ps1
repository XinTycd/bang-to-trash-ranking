$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $rootDir "config.json"
$serverPath = Join-Path $rootDir "server.js"
$pidPath = Join-Path $rootDir ".server.pid"
$serverFullPath = [System.IO.Path]::GetFullPath($serverPath)
$savedProcessId = $null
if (Test-Path $pidPath) {
  $savedProcessId = [int](Get-Content -Raw -LiteralPath $pidPath)
}

$port = 5980
if (Test-Path $configPath) {
  $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
  if ($config.server.port) {
    $port = [int]$config.server.port
  }
}

$listeners = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq "Listen" } |
  Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $listeners) {
  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction SilentlyContinue
  if (-not $process) {
    continue
  }

  $commandLine = [string]$process.CommandLine
  $isProjectServer =
    $processId -eq $savedProcessId -or
    $commandLine -like "*$serverFullPath*" -or
    ($commandLine -like "*$rootDir*" -and $commandLine -like "*server.js*")

  if ($isProjectServer) {
    Write-Host "Stopping existing project server on port $port (PID $processId)..."
    Stop-Process -Id $processId -Force
  } else {
    throw "Port $port is occupied by PID $processId, but it does not look like this project server: $commandLine"
  }
}

$processInfo = Start-Process node -ArgumentList "`"$serverFullPath`"" -WorkingDirectory $rootDir -PassThru
Set-Content -LiteralPath $pidPath -Value $processInfo.Id

Start-Sleep -Milliseconds 800
if ($processInfo.HasExited) {
  throw "Server exited immediately. Run npm start to see the error output."
}

Write-Host "Started server on http://localhost:$port/ (PID $($processInfo.Id))"
