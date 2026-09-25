@echo off
title Drabyashree NEPSE Launcher
echo ========================================================
echo        Starting Drabyashree NEPSE Platform
echo ========================================================
echo.
echo 1. Starting Proxy & Web Server...
start "" "http://localhost:3000"
npm run dev
