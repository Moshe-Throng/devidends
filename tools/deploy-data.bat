@echo off
REM ============================================================
REM Devidends — Daily Scrape + Deploy Pipeline
REM Runs all scrapers, commits data to GitHub, and redeploys
REM to Vercel. Designed to run via Windows Task Scheduler.
REM ============================================================

set LOGFILE=C:\Users\HP\Claude Projects\devidends\.tmp\pipeline.log
if not exist "C:\Users\HP\Claude Projects\devidends\.tmp" mkdir "C:\Users\HP\Claude Projects\devidends\.tmp"

cd /d "C:\Users\HP\Claude Projects\devidends"

echo ============================================ >> "%LOGFILE%"
echo [%date% %time%] Pipeline started >> "%LOGFILE%"
echo ============================================ >> "%LOGFILE%"

REM Run all scrapers
echo [%date% %time%] Running ReliefWeb... >> "%LOGFILE%"
node scripts/poc/test-reliefweb.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] Running World Bank... >> "%LOGFILE%"
node scripts/poc/test-worldbank.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] Running Workday... >> "%LOGFILE%"
node scripts/poc/test-workday.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] Running Kifiya... >> "%LOGFILE%"
node scripts/poc/test-kifiya.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] Running AU... >> "%LOGFILE%"
node scripts/poc/test-au.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] Running UN Careers... >> "%LOGFILE%"
node scripts/poc/test-uncareers.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] Running Oracle... >> "%LOGFILE%"
node scripts/poc/test-oracle.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] Running UNJobs... >> "%LOGFILE%"
node scripts/poc/test-unjobs.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] Running DRC... >> "%LOGFILE%"
node scripts/poc/test-drc.js >> "%LOGFILE%" 2>&1

echo [%date% %time%] Scraping complete. >> "%LOGFILE%"

REM Stage only JSON data files
git add test-output/*.json

REM Check if there are changes to commit
git diff --cached --quiet
if %ERRORLEVEL% EQU 0 (
    echo [%date% %time%] No data changes. Skipping deploy. >> "%LOGFILE%"
    goto :end
)

REM Commit and push to GitHub
git commit -m "Update opportunity data [%date%]" >> "%LOGFILE%" 2>&1
git push origin main >> "%LOGFILE%" 2>&1

REM Redeploy to Vercel
echo [%date% %time%] Deploying to Vercel... >> "%LOGFILE%"
npx vercel --prod --yes >> "%LOGFILE%" 2>&1

echo [%date% %time%] Pipeline complete! >> "%LOGFILE%"

:end
echo [%date% %time%] Done. >> "%LOGFILE%"
