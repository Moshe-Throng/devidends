@echo off
REM Devidends Daily Pipeline — Crawl Engine v2
REM Runs: crawl-engine -> git commit -> git push -> Vercel auto-deploys
REM
REM Schedule via Windows Task Scheduler for daily execution
REM at 8:00 AM Nairobi time (EAT/UTC+3)

echo ========================================
echo Devidends Crawl Engine v2 — Daily Pipeline
echo Started: %date% %time%
echo ========================================
echo.

cd /d "C:\Users\HP\Claude Projects\devidends"

echo [1/4] Running crawl engine (all sources)...
npx tsx scripts/crawl-engine/engine.ts
if %errorlevel% neq 0 (
    echo ========================================
    echo ERROR: Crawl engine failed with code %errorlevel%
    echo ABORTING pipeline — refusing to broadcast stale data.
    echo Check the logs above and fix the crawler before re-running.
    echo ========================================
    exit /b %errorlevel%
)
echo.

echo [2/4] Checking crawl output freshness...
powershell -Command "$f = Get-Item 'test-output\_all_normalized.json' -ErrorAction Stop; $age = (Get-Date) - $f.LastWriteTime; if ($age.TotalHours -gt 6) { Write-Host ('ERROR: _all_normalized.json is {0:N1} hours old — crawler did not refresh' -f $age.TotalHours); exit 1 }"
if %errorlevel% neq 0 (
    echo ABORTING: crawl output is stale.
    exit /b 1
)
echo.

echo [3/7] Broadcasting to Telegram group...
npx tsx scripts/broadcast-group.ts
if %errorlevel% neq 0 (
    echo ERROR: Group broadcast failed with code %errorlevel%
    exit /b %errorlevel%
)
echo.

echo [4/7] Sending email digests to subscribers...
npx tsx scripts/send-alerts-email.ts
if %errorlevel% neq 0 (
    echo WARNING: Email digest failed — continuing but admin should check Resend
)
echo.

echo [5/7] One-shot: refine-preferences nudge (self-dedups via _refine_prefs_sent.json)...
npx tsx scripts/refine-preferences-email.ts
if %errorlevel% neq 0 (
    echo WARNING: Refine-preferences email failed — non-critical, continuing
)
echo.

echo [6/7] Committing updated data...
git add test-output/*.json
git diff --cached --quiet
if %errorlevel% neq 0 (
    git commit -m "Update opportunity data [%date%]"
    echo.
    echo [7/7] Pushing to GitHub (triggers Vercel deploy)...
    git push origin main
) else (
    echo No changes to commit, skipping push.
)
echo.

echo ========================================
echo Pipeline completed!
echo Finished: %date% %time%
echo ========================================
