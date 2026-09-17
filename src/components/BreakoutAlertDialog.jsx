import React, { useState, useEffect } from 'react';
import {
  Bell,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  X,
  RefreshCw,
  Sliders,
  ShieldCheck
} from 'lucide-react';
import {
  getWatchlistAlertConfig,
  saveWatchlistAlertConfig,
  deriveDefaultBreakoutPlan,
  playBreakoutChime,
  requestNotificationPermission,
  resetAlertTrigger,
  calculateStockRvol
} from '../utils/watchlistAlerts';

export default function BreakoutAlertDialog({
  isOpen,
  onClose,
  symbol,
  stock,
  entryExitPlan = null,
  onSaved = null
}) {
  if (!isOpen || !symbol) return null;

  const sym = String(symbol).trim().toUpperCase();
  const ltp = Number(stock?.ltp || entryExitPlan?.ltp || 100);
  const currentRvol = calculateStockRvol(stock);

  // Initialize config
  const existingConfig = getWatchlistAlertConfig(sym);
  const defaultConfig = deriveDefaultBreakoutPlan(stock, entryExitPlan);

  const [breakoutPrice, setBreakoutPrice] = useState(
    existingConfig?.breakoutPrice != null ? existingConfig.breakoutPrice : defaultConfig.breakoutPrice
  );
  const [rvolThreshold, setRvolThreshold] = useState(
    existingConfig?.rvolThreshold != null ? existingConfig.rvolThreshold : defaultConfig.rvolThreshold
  );
  const [alertEnabled, setAlertEnabled] = useState(
    existingConfig?.alertEnabled !== undefined ? existingConfig.alertEnabled : true
  );
  const [soundEnabled, setSoundEnabled] = useState(
    existingConfig?.soundEnabled !== undefined ? existingConfig.soundEnabled : true
  );
  const [pushEnabled, setPushEnabled] = useState(
    existingConfig?.pushEnabled !== undefined ? existingConfig.pushEnabled : true
  );
  const [syncedBadge, setSyncedBadge] = useState(Boolean(existingConfig?.autoSyncFromPlan));
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pushPermission, setPushPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'denied'
  );

  useEffect(() => {
    if (existingConfig) {
      setBreakoutPrice(existingConfig.breakoutPrice);
      setRvolThreshold(existingConfig.rvolThreshold);
      setAlertEnabled(existingConfig.alertEnabled !== false);
      setSoundEnabled(existingConfig.soundEnabled !== false);
      setPushEnabled(existingConfig.pushEnabled !== false);
      setSyncedBadge(Boolean(existingConfig.autoSyncFromPlan));
    } else {
      const def = deriveDefaultBreakoutPlan(stock, entryExitPlan);
      setBreakoutPrice(def.breakoutPrice);
      setRvolThreshold(def.rvolThreshold);
      setAlertEnabled(true);
      setSoundEnabled(true);
      setPushEnabled(true);
      setSyncedBadge(true);
    }
  }, [sym, stock, entryExitPlan]);

  const handleTakeFromPlan = () => {
    const planDefaults = deriveDefaultBreakoutPlan(stock, entryExitPlan);
    setBreakoutPrice(planDefaults.breakoutPrice);
    setRvolThreshold(planDefaults.rvolThreshold);
    setSyncedBadge(true);
  };

  const handleTestChime = () => {
    playBreakoutChime();
  };

  const handleRequestPush = async () => {
    const res = await requestNotificationPermission();
    setPushPermission(res);
  };

  const handleSave = () => {
    const updated = saveWatchlistAlertConfig(sym, {
      breakoutPrice: Number(breakoutPrice) || ltp,
      rvolThreshold: Number(rvolThreshold) || 1.5,
      alertEnabled,
      soundEnabled,
      pushEnabled,
      autoSyncFromPlan: syncedBadge
    });

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      if (typeof onSaved === 'function') onSaved(updated);
      onClose();
    }, 600);
  };

  const handleResetTrigger = () => {
    resetAlertTrigger(sym);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 1200);
  };

  const isPriceMetNow = ltp >= Number(breakoutPrice);
  const isRvolMetNow = currentRvol >= Number(rvolThreshold);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 99999,
      background: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(6px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16
    }}>
      <div style={{
        background: 'linear-gradient(135deg, #151922 0%, #0F172A 100%)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 20,
        width: '100%',
        maxWidth: 460,
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.8), 0 0 30px rgba(56, 189, 248, 0.15)',
        overflow: 'hidden',
        animation: 'modalSlideUp 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(255, 255, 255, 0.02)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Bell style={{ width: 18, height: 18, color: '#38bdf8' }} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.01em' }}>
                Breakout Alert: {sym}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>
                Simultaneous Dual-Gate (Price + RVOL)
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: 8,
              width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#94a3b8', cursor: 'pointer'
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '18px 20px', maxHeight: 'calc(80vh - 120px)', overflowY: 'auto' }}>
          {/* Live Status Pill */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 12,
            padding: '10px 14px',
            marginBottom: 16,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8
          }}>
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Current Market State</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#ffffff', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                Rs. {ltp.toFixed(1)} <span style={{ fontSize: 11, color: (stock?.pChange ?? 0) >= 0 ? '#34d399' : '#f87171' }}>
                  ({(stock?.pChange ?? 0) >= 0 ? '+' : ''}{(stock?.pChange ?? 0).toFixed(2)}%)
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>Live Volume Surge</div>
              <div style={{
                fontSize: 14,
                fontWeight: 800,
                color: currentRvol >= 1.5 ? '#34d399' : currentRvol >= 1.0 ? '#38bdf8' : '#f59e0b',
                fontFamily: 'var(--font-mono)',
                marginTop: 2
              }}>
                {currentRvol.toFixed(2)}x RVOL
              </div>
            </div>
          </div>

          {/* Quick 1-Click Sync Button */}
          <button
            type="button"
            onClick={handleTakeFromPlan}
            style={{
              width: '100%',
              background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.15), rgba(37, 99, 235, 0.15))',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: 12,
              padding: '10px 14px',
              marginBottom: 16,
              color: '#38bdf8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'all 0.15s'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap style={{ width: 16, height: 16, color: '#38bdf8' }} />
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#ffffff' }}>
                  Take Directly from Stock Plan
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>
                  Auto-fills pivot (Rs. {defaultConfig.breakoutPrice}) &amp; RVOL ({defaultConfig.rvolThreshold}x)
                </div>
              </div>
            </div>
            <span style={{
              background: 'rgba(56, 189, 248, 0.2)',
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 6,
              fontWeight: 700
            }}>
              Auto-Sync
            </span>
          </button>

          {/* Condition 1: Price Trigger Input */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>1. Breakout Target Price (Rs.)</span>
                {isPriceMetNow ? (
                  <span style={{ fontSize: 10, color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <CheckCircle2 size={11} /> Met (LTP {ltp})
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>
                    {(((Number(breakoutPrice) - ltp) / ltp) * 100).toFixed(1)}% to trigger
                  </span>
                )}
              </label>
            </div>

            <div style={{ position: 'relative' }}>
              <input
                type="number"
                step="0.1"
                value={breakoutPrice}
                onChange={e => {
                  setBreakoutPrice(e.target.value);
                  setSyncedBadge(false);
                }}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 10,
                  padding: '9px 12px',
                  fontSize: 14,
                  fontWeight: 800,
                  color: '#ffffff',
                  fontFamily: 'var(--font-mono)',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
              Triggers when price climbs and trades at or above this resistance pivot.
            </div>
          </div>

          {/* Condition 2: RVOL Hurdle Input */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ fontSize: 12, fontWeight: 800, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>2. Minimum RVOL Hurdle (x)</span>
                {isRvolMetNow ? (
                  <span style={{ fontSize: 10, color: '#34d399', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}>
                    <CheckCircle2 size={11} /> Met ({currentRvol}x)
                  </span>
                ) : (
                  <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>
                    Current: {currentRvol}x
                  </span>
                )}
              </label>
            </div>

            <input
              type="number"
              step="0.05"
              value={rvolThreshold}
              onChange={e => {
                setRvolThreshold(e.target.value);
                setSyncedBadge(false);
              }}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 10,
                padding: '9px 12px',
                fontSize: 14,
                fontWeight: 800,
                color: '#ffffff',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />

            {/* Quick Multiplier Chips */}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {[
                { label: '1.50x Festive Hurdle (Standard)', val: 1.50 },
                { label: '1.75x High Conviction', val: 1.75 },
                { label: '2.00x Whale Surge', val: 2.00 }
              ].map(chip => (
                <button
                  key={chip.val}
                  type="button"
                  onClick={() => {
                    setRvolThreshold(chip.val);
                    setSyncedBadge(false);
                  }}
                  style={{
                    background: Number(rvolThreshold) === chip.val ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                    border: `1px solid ${Number(rvolThreshold) === chip.val ? 'rgba(56, 189, 248, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
                    borderRadius: 6,
                    padding: '3px 8px',
                    fontSize: 10,
                    color: Number(rvolThreshold) === chip.val ? '#38bdf8' : '#94a3b8',
                    cursor: 'pointer'
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>
              Filters out low-volume festival traps. Breakouts with RVOL &lt; 1.5x during pre-Dashain have a 36% win rate.
            </div>
          </div>

          {/* Preferences & Sound */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 12,
            border: '1px solid rgba(255, 255, 255, 0.05)',
            padding: '12px 14px',
            marginBottom: 16
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Volume2 size={15} style={{ color: soundEnabled ? '#38bdf8' : '#64748b' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>Audible Breakout Chime</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={handleTestChime}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: 6,
                    padding: '2px 8px',
                    fontSize: 10,
                    color: '#94a3b8',
                    cursor: 'pointer'
                  }}
                >
                  Test Sound
                </button>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={e => setSoundEnabled(e.target.checked)}
                  style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bell size={15} style={{ color: pushEnabled ? '#38bdf8' : '#64748b' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#ffffff' }}>System Notifications</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {pushPermission !== 'granted' && (
                  <button
                    type="button"
                    onClick={handleRequestPush}
                    style={{
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: 10,
                      color: '#38bdf8',
                      cursor: 'pointer'
                    }}
                  >
                    Allow Push
                  </button>
                )}
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={e => setPushEnabled(e.target.checked)}
                  style={{ cursor: 'pointer', transform: 'scale(1.15)' }}
                />
              </div>
            </div>
          </div>

          {/* Trigger State & Reset Button if already triggered today */}
          {existingConfig?.triggeredToday && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: 10,
              padding: '10px 12px',
              marginBottom: 16,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#34d399' }}>
                <CheckCircle2 size={16} />
                <span>Alert Triggered in Today's Session!</span>
              </div>
              <button
                type="button"
                onClick={handleResetTrigger}
                style={{
                  background: 'rgba(16, 185, 129, 0.2)',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: '#34d399',
                  cursor: 'pointer'
                }}
              >
                Reset Trigger
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '14px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 10,
              padding: '8px 16px',
              color: '#94a3b8',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSave}
            style={{
              background: saveSuccess ? '#10B981' : 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              border: 'none',
              borderRadius: 10,
              padding: '8px 20px',
              color: '#ffffff',
              fontSize: 12.5,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.35)',
              transition: 'all 0.15s'
            }}
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 size={15} />
                <span>Alert Saved &amp; Armed!</span>
              </>
            ) : (
              <>
                <Bell size={15} />
                <span>Save &amp; Arm Alert</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
