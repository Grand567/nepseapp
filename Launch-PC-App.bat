@echo off
title Drabyashree NEPSE Desktop
echo ========================================================
echo        Starting Drabyashree NEPSE Desktop Platform
echo ========================================================
echo.
echo 1. Starting local NEPSE proxy in background...
start /b "" node --max-old-space-size=450 proxy/server.mjs
echo 2. Starting native desktop window...
npm run desktop
