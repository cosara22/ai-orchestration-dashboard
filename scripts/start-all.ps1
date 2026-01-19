# Start All AOD Services (PowerShell)
# Usage: .\scripts\start-all.ps1 [-Mode dev|prod]

param(
    [string]$Mode = "dev"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  AI Orchestration Dashboard" -ForegroundColor Cyan
Write-Host "  Starting in $Mode mode" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan

Set-Location $ProjectDir

if ($Mode -eq "prod") {
    Write-Host "Starting production services..."
    docker compose up -d
} else {
    Write-Host "Starting development services..."
    docker compose -f docker-compose.dev.yml up -d
}

Write-Host ""
Write-Host "Waiting for services to be ready..."
Start-Sleep -Seconds 5

# Check health
Write-Host ""
Write-Host "Checking service health..."

# Check Backend
$maxRetries = 30
for ($i = 1; $i -le $maxRetries; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:4000/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        Write-Host "✅ Backend: OK" -ForegroundColor Green
        break
    } catch {
        if ($i -eq $maxRetries) {
            Write-Host "❌ Backend: Failed to start" -ForegroundColor Red
        } else {
            Start-Sleep -Seconds 1
        }
    }
}

# Check Frontend
for ($i = 1; $i -le $maxRetries; $i++) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3002" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
        Write-Host "✅ Frontend: OK" -ForegroundColor Green
        break
    } catch {
        if ($i -eq $maxRetries) {
            Write-Host "⏳ Frontend: Still starting..." -ForegroundColor Yellow
        } else {
            Start-Sleep -Seconds 1
        }
    }
}

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Services Ready!" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Dashboard: http://localhost:3002" -ForegroundColor White
Write-Host "  API:       http://localhost:4000" -ForegroundColor White
Write-Host "  Redis:     localhost:6379" -ForegroundColor White
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start agents (in separate terminals):" -ForegroundColor Yellow
Write-Host '  $env:AOD_PROJECT_ID="your-project"; .\agents\conductor\start.ps1' -ForegroundColor Gray
Write-Host ""
