@echo off
REM Nightly local-first course backfill (free tier). Pulls the next ~45 nearest
REM courses' tees/holes from GolfCourseAPI into D1, then stops. Resumable.
cd /d C:\Projects\Quell\api
node scripts\import_local.mjs >> .crawl\import.log 2>&1
