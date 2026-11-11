// src/utils/proxyBase.js
// Dedicated proxy resolution utility to decouple network configuration from data cache engines.

import { Capacitor } from '@capacitor/core';

let _localProxyState = 'unknown'; // 'unknown' | 'alive' | 'dead'

export function getLocalProxyState() {
  return _localProxyState;
}

export function setLocalProxyState(val) {
  _localProxyState = val;
}

/**
 * Returns the configured backend proxy URL.
 * Used across services for API calls.
 * Handles Desktop Electron (file://), local development (localhost), LAN IP, and mobile Capacitor.
 * Falls back to production Render proxy if no local backend is configured or alive.
 */
export function getProxyBase() {
  const isNative = typeof Capacitor !== 'undefined' && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform();
  if (isNative) {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('nepse_proxy_base') || localStorage.getItem('proxy_base');
      if (stored && stored.startsWith('http')) return stored.replace(/\/$/, '');
    }
    return 'https://nepseapp.onrender.com';
  }

  // 1. Electron environment (protocol file: or Electron in userAgent)
  if (typeof window !== 'undefined') {
    const isElectron = window.location.protocol === 'file:' || 
                       (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.includes('Electron')) ||
                       typeof window.electron !== 'undefined';
    if (isElectron) {
      if (_localProxyState === 'dead') return 'https://nepseapp.onrender.com';
      return 'http://localhost:5000';
    }

    // 2. Desktop browser on localhost / 127.0.0.1
    const h = window.location.hostname || '';
    if (h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0') {
      return '';
    }

    // 3. Local LAN access (e.g. 192.168.x.x, 10.x.x.x)
    if (/^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(h)) {
      if (_localProxyState === 'dead') return 'https://nepseapp.onrender.com';
      return '';
    }
  }

  // 4. If explicitly configured in localStorage, respect it
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('nepse_proxy_base') || localStorage.getItem('proxy_base');
    if (stored && stored.startsWith('http')) return stored.replace(/\/$/, '');
  }

  // 5. Environment variable (VITE_PROXY_URL from .env or Vite config)
  try {
    const env = import.meta?.env?.VITE_PROXY_URL;
    if (env && env.trim()) {
      const cleanEnv = env.trim().replace(/\/$/, '');
      if (cleanEnv.includes('localhost') || cleanEnv.includes('127.0.0.1')) {
        if (_localProxyState !== 'dead') return cleanEnv;
      } else {
        return cleanEnv;
      }
    }
  } catch (_) {}

  // 6. Default production proxy on Render (reliable public backend with live NOTS data)
  return 'https://nepseapp.onrender.com';
}
