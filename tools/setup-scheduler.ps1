# ============================================================
# Devidends — Task Scheduler Setup
# Creates a daily task to run the scrape + deploy pipeline
# Run this script ONCE as Administrator:
#   powershell -ExecutionPolicy Bypass -File tools\setup-scheduler.ps1
# ============================================================

$TaskName = "Devidends-Daily-Pipeline"
$ScriptPath = "C:\Users\HP\Claude Projects\devidends\tools\deploy-data.bat"

# 8:00 AM Nairobi time (EAT = UTC+3) = 5:00 AM UTC
# Windows uses local time, so if your PC is set to EAT, use 08:00
$TriggerTime = "08:00"

# Remove existing task if it exists
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed existing task: $TaskName"
}

# Create the task
$Action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$ScriptPath`""
$Trigger = New-ScheduledTaskTrigger -Daily -At $TriggerTime
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Settings $Settings `
    -Description "Daily scrape of 9 job sources + deploy to Vercel"

Write-Host ""
Write-Host "Task '$TaskName' created successfully!" -ForegroundColor Green
Write-Host "Schedule: Daily at $TriggerTime"
Write-Host "Script:   $ScriptPath"
Write-Host "Log:      C:\Users\HP\Claude Projects\devidends\.tmp\pipeline.log"
Write-Host ""
Write-Host "To verify: Get-ScheduledTask -TaskName '$TaskName'"
Write-Host "To run now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "To remove:  Unregister-ScheduledTask -TaskName '$TaskName'"
