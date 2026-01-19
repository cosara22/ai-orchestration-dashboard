# Conductor Agent Startup Script (PowerShell)

# Configuration
$AgentId = if ($env:AOD_AGENT_ID) { $env:AOD_AGENT_ID } else { "conductor-$(Get-Date -Format 'yyyyMMddHHmmss')" }
$AgentName = if ($env:AOD_AGENT_NAME) { $env:AOD_AGENT_NAME } else { "Conductor" }
$ProjectId = if ($env:AOD_PROJECT_ID) { $env:AOD_PROJECT_ID } else { "default" }
$ApiUrl = if ($env:AOD_API_URL) { $env:AOD_API_URL } else { "http://localhost:4000" }

# Export environment variables
$env:AOD_AGENT_ID = $AgentId
$env:AOD_AGENT_NAME = $AgentName
$env:AOD_PROJECT_ID = $ProjectId
$env:AOD_API_URL = $ApiUrl

# Register agent with AOD
Write-Host "Registering conductor agent: $AgentName ($AgentId)"
try {
    $body = @{
        agent_id = $AgentId
        name = $AgentName
        type = "conductor"
        project_id = $ProjectId
    } | ConvertTo-Json

    Invoke-RestMethod -Uri "$ApiUrl/api/agents" -Method Post -ContentType "application/json" -Body $body -ErrorAction SilentlyContinue | Out-Null
} catch {}

# Register capabilities
Write-Host "Registering capabilities..."
try {
    $capabilities = @{
        capabilities = @(
            @{ tag = "orchestration"; proficiency = 100 }
            @{ tag = "planning"; proficiency = 100 }
            @{ tag = "coordination"; proficiency = 100 }
        )
    } | ConvertTo-Json -Depth 3

    Invoke-RestMethod -Uri "$ApiUrl/api/agents/$AgentId/capabilities" -Method Post -ContentType "application/json" -Body $capabilities -ErrorAction SilentlyContinue | Out-Null
} catch {}

Write-Host ""
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Conductor Agent Starting" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host "  Agent ID:   $AgentId" -ForegroundColor White
Write-Host "  Agent Name: $AgentName" -ForegroundColor White
Write-Host "  Project:    $ProjectId" -ForegroundColor White
Write-Host "  API URL:    $ApiUrl" -ForegroundColor White
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Start Claude Code with conductor CLAUDE.md
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
claude --claude-md "$ScriptDir\CLAUDE.md"
