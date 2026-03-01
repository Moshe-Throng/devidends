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

echo [1/3] Running crawl engine (all sources)...
npx tsx scripts/crawl-engine/engine.ts
if %errorlevel% neq 0 (
    echo WARNING: Crawl engine exited with code %errorlevel%, continuing with available data...
)
echo.

echo [2/3] Committing updated data...
git add test-output/*.json
git diff --cached --quiet
if %errorlevel% neq 0 (
    git commit -m "Update opportunity data [%date%]"
    echo.
    echo [3/3] Pushing to GitHub (triggers Vercel deploy)...
    git push origin main
) else (
    echo No changes to commit, skipping push.
)
echo.

echo ========================================
echo Pipeline completed!
echo Finished: %date% %time%
echo ========================================
