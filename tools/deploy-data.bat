@echo off
REM ============================================================
REM Devidends — Scrape + Deploy Data Pipeline
REM Runs all scrapers, then commits and pushes updated JSON data
REM to GitHub. Vercel auto-deploys on push to main.
REM ============================================================

cd /d "C:\Users\HP\Claude Projects\devidends"

echo [%date% %time%] Starting Devidends data scrape...

REM Run all scrapers
echo --- Running ReliefWeb scraper ---
node scripts/poc/test-reliefweb.js
echo --- Running World Bank scraper ---
node scripts/poc/test-worldbank.js
echo --- Running Workday (FHI360 + UNHCR) scraper ---
node scripts/poc/test-workday.js
echo --- Running Kifiya scraper ---
node scripts/poc/test-kifiya.js
echo --- Running AU scraper ---
node scripts/poc/test-au.js
echo --- Running UN Careers scraper ---
node scripts/poc/test-uncareers.js
echo --- Running Oracle (NRC + WFP) scraper ---
node scripts/poc/test-oracle.js
echo --- Running UNJobs scraper ---
node scripts/poc/test-unjobs.js
echo --- Running DRC scraper ---
node scripts/poc/test-drc.js

echo.
echo [%date% %time%] Scraping complete. Committing and pushing...

REM Stage only JSON data files
git add test-output/*.json

REM Check if there are changes to commit
git diff --cached --quiet
if %ERRORLEVEL% EQU 0 (
    echo No data changes to commit.
    goto :end
)

REM Commit and push
git commit -m "Update opportunity data [%date%]"
git push origin main

echo [%date% %time%] Data deployed successfully!

:end
echo Done.
