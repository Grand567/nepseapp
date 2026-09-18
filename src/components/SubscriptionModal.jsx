// src/components/SubscriptionModal.jsx
// Interactive Subscription & Pro Pass Management Modal
// Allows selecting monthly timeframes (1m, 2m, 3m, 6m, 12m), redeeming vouchers, and activating Pro access.

import React, { useState, useEffect } from 'react';
import {
  Crown,
  Sparkles,
  CheckCircle2,
  X,
  Zap,
  Clock,
  ShieldCheck,
  Award,
  Key,
  Calendar,
  ChevronRight,
  TrendingUp,
  AlertCircle,
  Copy,
  Check,
  Smartphone,
  Lock,
  Unlock,
  Terminal,
  Share2
} from 'lucide-react';
import { useSubscription } from '../context/SubscriptionContext';
import { PRO_PLANS } from '../utils/subscription';
import { generateLicenseKey, cleanDeviceId, formatDeviceId } from '../utils/licenseEngine';

export default function SubscriptionModal() {
  const {
    isPro,
    daysRemaining,
    formattedExpiry,
    planDuration,
    voucherCode,
    deviceId,
    isModalOpen,
    closeSubscriptionModal,
    lockedFeatureName,
    activatePlan,
    redeemCode,
    cancelPlan
  } = useSubscription();

  const [selectedPlanId, setSelectedPlanId] = useState('1m');
  const [promoInput, setPromoInput] = useState('');
  const [promoMessage, setPromoMessage] = useState(null);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // In-App Developer Key Generator State (Master PIN required for security; PIN number is never exposed in UI)
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [devPinInput, setDevPinInput] = useState('');
  const [devUnlocked, setDevUnlocked] = useState(false);
  const [pinError, setPinError] = useState(false);
  const [devTargetId, setDevTargetId] = useState(deviceId || '');
  const [devPlan, setDevPlan] = useState('1m');
  const [generatedKey, setGeneratedKey] = useState(null);
  const [copiedGenKey, setCopiedGenKey] = useState(false);
  const [copiedWhatsAppMsg, setCopiedWhatsAppMsg] = useState(false);

  useEffect(() => {
    if (deviceId && !devTargetId) {
      setDevTargetId(deviceId);
    }
  }, [deviceId, devTargetId]);

  if (!isModalOpen) return null;

  const selectedPlan = PRO_PLANS.find(p => p.id === selectedPlanId) || PRO_PLANS[0];

  const handleRedeem = (e) => {
    e.preventDefault();
    if (!promoInput.trim()) return;
    setIsRedeeming(true);
    setPromoMessage(null);

    const result = redeemCode(promoInput);
    setIsRedeeming(false);
    setPromoMessage(result);
    if (result.success) {
      setPromoInput('');
    }
  };

  const handleDirectActivate = () => {
    activatePlan(selectedPlan.code, 'in_app_selection');
    setPromoMessage({
      success: true,
      message: `🎉 Success! Unlocked ${selectedPlan.label} Pro Access (${selectedPlan.days} days).`
    });
  };

  const copyTextToClipboard = (text, setSuccessState) => {
    if (!text) return;
    const onSuccess = () => {
      setSuccessState(true);
      setTimeout(() => setSuccessState(false), 2200);
    };

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        fallbackCopy(text, onSuccess);
      });
    } else {
      fallbackCopy(text, onSuccess);
    }
  };

  const fallbackCopy = (text, cb) => {
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'absolute';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      cb?.();
    } catch (e) {
      console.warn('Clipboard copy fallback failed', e);
    }
  };

  const handleCopyDeviceId = () => {
    copyTextToClipboard(deviceId, setCopiedId);
  };

  const handleShareDeviceIdWhatsApp = () => {
    const text = `Hi Rexsh, I would like to activate Drabyashree Pro for my device: ${deviceId}`;
    const url = `https://wa.me/9779841576936?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleUnlockDev = (e) => {
    e.preventDefault();
    if (devPinInput.trim() === '8899' || devPinInput.trim().toUpperCase() === 'NEPSE2026') {
      setDevUnlocked(true);
      setPinError(false);
    } else {
      setPinError(true);
    }
  };

  const handleGenerateDeveloperKey = (e) => {
    e.preventDefault();
    try {
      const clean = cleanDeviceId(devTargetId || deviceId);
      if (clean.length !== 8) {
        alert('Please enter a valid 8-character device ID like DS-8A7F-94B2');
        return;
      }
      const formatted = formatDeviceId(clean);
      const key = generateLicenseKey({
        deviceId: formatted,
        planDuration: devPlan
      });
      const days = PRO_PLANS.find(p => p.id === devPlan)?.days || 30;
      setGeneratedKey({
        key,
        targetDevice: formatted,
        plan: devPlan.toUpperCase(),
        days
      });
      setCopiedGenKey(false);
      setCopiedWhatsAppMsg(false);
    } catch (err) {
      alert(err?.message || 'Failed to generate key');
    }
  };

  const getWhatsAppCustomerTemplate = () => {
    if (!generatedKey) return '';
    return `🇳🇵 *DRABYASHREE PRO - LICENSE ACTIVATION KEY* 🚀\n\n` +
      `Hello! Here is your verified single-use Pro activation key:\n` +
      `🔑 *Key:* ${generatedKey.key}\n` +
      `📱 *Bound to Device:* ${generatedKey.targetDevice}\n` +
      `⏳ *Duration:* ${generatedKey.plan} (${generatedKey.days} Days Full Access)\n\n` +
      `*How to Activate:*\n` +
      `1. Open Drabyashree NEPSE App.\n` +
      `2. Click on the Crown (👑 PRO) button.\n` +
      `3. Paste this key into the *Activation Key / Voucher* box and tap *Redeem*.\n\n` +
      `⚠️ *Note:* This key is cryptographically bound to your device ID (${generatedKey.targetDevice}) and can only be activated once. It cannot be shared with other devices.\n\n` +
      `Developer Support: Rexsh K Suwal (+977 9841576936)`;
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSubscriptionModal();
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #161D2B 0%, #0F141E 100%)',
          border: '1px solid rgba(245, 158, 11, 0.35)',
          borderRadius: 20,
          width: '100%',
          maxWidth: 540,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 35px rgba(245, 158, 11, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}
      >
        {/* Header Ribbon */}
        <div style={{
          background: 'linear-gradient(90deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)',
          height: 5,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20
        }} />

        {/* Close Button */}
        <button
          type="button"
          onClick={closeSubscriptionModal}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'rgba(255, 255, 255, 0.08)',
            border: 'none',
            borderRadius: '50%',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            zIndex: 10
          }}
        >
          <X style={{ width: 18, height: 18 }} />
        </button>

        <div style={{ padding: '20px 22px 24px' }}>
          {/* Top Title & Badge */}
          <div style={{ textAlign: 'center', marginBottom: 18 }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: 20,
              padding: '4px 12px',
              color: '#f59e0b',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.05em',
              marginBottom: 10
            }}>
              <Crown style={{ width: 14, height: 14 }} />
              DRABYASHREE PRO WORKSTATION
            </div>

            <h2 style={{
              fontSize: 22,
              fontWeight: 900,
              color: '#ffffff',
              margin: '0 0 6px',
              letterSpacing: '-0.02em'
            }}>
              {isPro ? 'Manage Pro Subscription' : 'Unlock Pro Quantitative Features'}
            </h2>

            <p style={{
              fontSize: 12.5,
              color: 'var(--text-muted)',
              margin: 0,
              lineHeight: 1.5
            }}>
              {lockedFeatureName ? (
                <span>
                  <strong style={{ color: '#f59e0b' }}>{lockedFeatureName}</strong> requires an active Pro subscription pass.
                </span>
              ) : (
                'Gain institutional edge with AI predictions, breakout radars & smart money flows.'
              )}
            </p>
          </div>

          {/* Current Membership Status Card */}
          <div style={{
            background: isPro ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.03)',
            border: isPro ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border)',
            borderRadius: 14,
            padding: '12px 16px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: isPro ? '#10B981' : '#64748b'
                }} />
                <span style={{ fontSize: 13, fontWeight: 800, color: isPro ? '#10B981' : 'var(--text-secondary)' }}>
                  {isPro ? `Active Pro (${planDuration || 'Monthly'})` : 'Free Plan (Pro Locked)'}
                </span>
              </div>
              {isPro ? (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Expires: <strong style={{ color: '#fff' }}>{formattedExpiry}</strong> · <strong style={{ color: '#10B981' }}>{daysRemaining} days remaining</strong>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  Select a monthly pass below to activate immediate access.
                </div>
              )}
            </div>

            {isPro && (
              <span style={{
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10B981',
                fontSize: 11,
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: 8,
                fontFamily: 'var(--font-mono)'
              }}>
                ⭐ PRO ACTIVE
              </span>
            )}
          </div>

          {/* Customer Device License ID Card */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(30, 41, 59, 0.5) 100%)',
            border: '1px solid rgba(245, 158, 11, 0.28)',
            borderRadius: 14,
            padding: '13px 15px',
            marginBottom: 20
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Smartphone style={{ width: 14, height: 14, color: '#f59e0b' }} />
                <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Your Device License ID
                </span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                Hardware Tied
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'rgba(0, 0, 0, 0.35)', borderRadius: 10, padding: '8px 12px', border: '1px solid rgba(255, 255, 255, 0.07)' }}>
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 15,
                fontWeight: 900,
                color: '#ffffff',
                letterSpacing: '0.08em'
              }}>
                {deviceId || 'DS-SYNCING'}
              </span>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleCopyDeviceId}
                  style={{
                    background: copiedId ? '#10B981' : 'rgba(245, 158, 11, 0.2)',
                    border: copiedId ? '1px solid #10B981' : '1px solid rgba(245, 158, 11, 0.4)',
                    color: copiedId ? '#ffffff' : '#fbbf24',
                    borderRadius: 7,
                    padding: '5px 10px',
                    fontSize: 11,
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    transition: 'all 0.15s ease'
                  }}
                >
                  {copiedId ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                  {copiedId ? 'Copied!' : 'Copy ID'}
                </button>

                <button
                  type="button"
                  onClick={handleShareDeviceIdWhatsApp}
                  title="Send ID via WhatsApp to Admin"
                  style={{
                    background: 'rgba(37, 211, 102, 0.15)',
                    border: '1px solid rgba(37, 211, 102, 0.4)',
                    color: '#25D366',
                    borderRadius: 7,
                    padding: '5px 9px',
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Share2 style={{ width: 12, height: 12 }} />
                  WhatsApp
                </button>
              </div>
            </div>

            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.4 }}>
              💡 Pro activation keys are cryptographically locked to this ID. Send this Device ID to the developer/admin to receive your personal activation key.
            </div>
          </div>

          {/* Monthly Timeframe Selector */}
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block',
              fontSize: 11.5,
              fontWeight: 800,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 10
            }}>
              Select Access Duration (Monthly Timeframe)
            </label>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              {PRO_PLANS.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    onClick={() => setSelectedPlanId(plan.id)}
                    style={{
                      background: isSelected
                        ? 'rgba(245, 158, 11, 0.12)'
                        : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected
                        ? '1.5px solid #f59e0b'
                        : '1px solid var(--border)',
                      borderRadius: 12,
                      padding: '12px 10px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between'
                    }}
                  >
                    {plan.popular && (
                      <div style={{
                        position: 'absolute',
                        top: -8,
                        right: 8,
                        background: 'linear-gradient(90deg, #f59e0b, #d97706)',
                        color: '#000',
                        fontSize: 8.5,
                        fontWeight: 900,
                        padding: '2px 6px',
                        borderRadius: 6,
                        letterSpacing: '0.05em'
                      }}>
                        POPULAR
                      </div>
                    )}

                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: isSelected ? '#f59e0b' : '#ffffff' }}>
                        {plan.label}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                        {plan.days} Days Full Access
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={{
                        fontSize: 15,
                        fontWeight: 900,
                        color: '#ffffff',
                        fontFamily: 'var(--font-mono)'
                      }}>
                        Rs. {plan.priceRs}
                      </div>
                      <div style={{ fontSize: 9.5, color: isSelected ? '#fbbf24' : '#10b981', fontWeight: 700, marginTop: 2 }}>
                        {plan.savingsText}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action CTA Button */}
          <div style={{ marginBottom: 18 }}>
            <button
              type="button"
              onClick={handleDirectActivate}
              style={{
                width: '100%',
                background: 'linear-gradient(90deg, #d97706 0%, #f59e0b 50%, #fbbf24 100%)',
                color: '#090D14',
                border: 'none',
                borderRadius: 12,
                padding: '13px 16px',
                fontSize: 14,
                fontWeight: 900,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 8px 24px rgba(245, 158, 11, 0.35)',
                transition: 'transform 0.1s ease'
              }}
            >
              <Zap style={{ width: 17, height: 17 }} />
              {isPro ? `Extend Pro by ${selectedPlan.label}` : `Activate ${selectedPlan.label} Pro Access`}
            </button>
          </div>

          {/* Voucher / Activation Key Form */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '14px',
            marginBottom: 18
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Key style={{ width: 14, height: 14, color: '#f59e0b' }} />
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
                Have an Activation Key or Voucher?
              </span>
            </div>

            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.4 }}>
              Enter your developer-issued device key (e.g. <span style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>DS1M-{deviceId ? deviceId.replace('DS-', '') : '8A7F-94B2'}-XXXX-YYYY</span>) or promo code. Keys are single-use and device-locked.
            </div>

            <form onSubmit={handleRedeem} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                placeholder={`e.g. DS1M-${deviceId ? deviceId.replace('DS-', '') : '8A7F-94B2'}-... or PRO1M`}
                value={promoInput}
                onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                style={{
                  flex: 1,
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: '#ffffff',
                  outline: 'none'
                }}
              />
              <button
                type="submit"
                disabled={isRedeeming || !promoInput.trim()}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: 8,
                  padding: '0 14px',
                  color: '#ffffff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: (isRedeeming || !promoInput.trim()) ? 'not-allowed' : 'pointer',
                  opacity: (isRedeeming || !promoInput.trim()) ? 0.5 : 1
                }}
              >
                {isRedeeming ? 'Validating…' : 'Redeem'}
              </button>
            </form>

            {promoMessage && (
              <div style={{
                marginTop: 8,
                fontSize: 11.5,
                fontWeight: 600,
                color: promoMessage.success ? '#10B981' : '#F43F5E',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}>
                {promoMessage.success ? <CheckCircle2 style={{ width: 13, height: 13 }} /> : <AlertCircle style={{ width: 13, height: 13 }} />}
                {promoMessage.message}
              </div>
            )}
          </div>

          {/* Pro Exclusive Feature Checklist */}
          <div style={{
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 14,
            padding: '12px 14px',
            marginBottom: 14
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>
              Everything included with Drabyashree Pro:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 6, fontSize: 11.5 }}>
              {[
                'Real-Time Circuit Radar & Breakout Scanner (100% automated)',
                'Daily Master Prime Picks & Stealth Institutional Accumulation',
                'Institutional GURU AI Stock Predictions & Buy/Target/SL Levels',
                'Live Broker Heatmap & Floorsheet Accumulation Analytics',
                'Benjamin Graham Intrinsic Value & SEBON Regulatory Metrics',
                'Unlimited Price/Volume Alerts & Cross-Device Cloud Sync'
              ].map((feat, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--text-secondary)' }}>
                  <CheckCircle2 style={{ width: 13, height: 13, color: '#10B981', flexShrink: 0 }} />
                  <span>{feat}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Support / Payment Info */}
          <div style={{
            fontSize: 10.5,
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.5,
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
            paddingTop: 12
          }}>
            Need manual activation or payment via eSewa / Khalti?
            <br />
            Developer: <strong>Rexsh K Suwal</strong> · Phone / WhatsApp / Viber: <strong>+977 9841576936</strong>
          </div>

          {/* In-App Developer Key Generator (Direct Access - No PIN) */}
          <div style={{
            marginTop: 14,
            borderTop: '1px dashed rgba(245, 158, 11, 0.25)',
            paddingTop: 12
          }}>
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => setShowDevPanel(!showDevPanel)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 8px',
                  borderRadius: 6
                }}
              >
                <Terminal style={{ width: 12, height: 12, color: '#f59e0b' }} />
                <span>{showDevPanel ? 'Hide Developer Portal' : 'Developer Key Generator'}</span>
              </button>
            </div>

            {showDevPanel && (
              <div style={{
                marginTop: 10,
                background: 'rgba(0, 0, 0, 0.45)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 12,
                padding: '14px',
                animation: 'fadeIn 0.2s ease-out'
              }}>
                {!devUnlocked ? (
                  <form onSubmit={handleUnlockDev} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Lock style={{ width: 13, height: 13, color: '#f59e0b' }} />
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff' }}>
                        Developer Verification
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="password"
                        placeholder="Enter Master Passcode"
                        value={devPinInput}
                        onChange={(e) => { setDevPinInput(e.target.value); setPinError(false); }}
                        style={{
                          flex: 1,
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: pinError ? '1.5px solid #f43f5e' : '1px solid var(--border)',
                          borderRadius: 8,
                          padding: '7px 10px',
                          fontSize: 12,
                          color: '#fff',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="submit"
                        style={{
                          background: '#f59e0b',
                          color: '#000',
                          border: 'none',
                          borderRadius: 8,
                          padding: '0 14px',
                          fontSize: 11.5,
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        Unlock
                      </button>
                    </div>
                    {pinError && (
                      <span style={{ fontSize: 10.5, color: '#f43f5e', fontWeight: 700 }}>
                        ❌ Incorrect passcode. Access denied.
                      </span>
                    )}
                  </form>
                ) : (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Unlock style={{ width: 13, height: 13, color: '#10B981' }} />
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#10B981' }}>
                          Developer Portal Unlocked
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                        Cryptographic SHA-256 Engine
                      </span>
                    </div>

                    <form onSubmit={handleGenerateDeveloperKey} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                          Customer Device License ID:
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. DS-8A7F-94B2"
                          value={devTargetId}
                          onChange={(e) => setDevTargetId(e.target.value.toUpperCase())}
                          style={{
                            width: '100%',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            padding: '7px 10px',
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            color: '#fff',
                            outline: 'none'
                          }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                          Select Plan Duration:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                          {['1m', '2m', '3m', '6m', '12m'].map((pid) => (
                            <button
                              key={pid}
                              type="button"
                              onClick={() => setDevPlan(pid)}
                              style={{
                                background: devPlan === pid ? '#f59e0b' : 'rgba(255, 255, 255, 0.05)',
                                color: devPlan === pid ? '#000' : '#fff',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                padding: '6px 2px',
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: 'pointer'
                              }}
                            >
                              {pid.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="submit"
                        style={{
                          background: 'linear-gradient(90deg, #10B981 0%, #059669 100%)',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          padding: '9px 12px',
                          fontSize: 12,
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <Zap style={{ width: 14, height: 14 }} />
                        Generate Device-Bound Activation Key
                      </button>
                    </form>

                    {generatedKey && (
                      <div style={{
                        marginTop: 12,
                        background: 'rgba(16, 185, 129, 0.1)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        borderRadius: 10,
                        padding: '10px 12px'
                      }}>
                        <div style={{ fontSize: 10.5, color: '#10B981', fontWeight: 700, marginBottom: 4 }}>
                          🔑 Generated Single-Use Key ({generatedKey.plan} · {generatedKey.days} Days):
                        </div>
                        <div style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 13,
                          fontWeight: 900,
                          color: '#fff',
                          wordBreak: 'break-all',
                          background: 'rgba(0, 0, 0, 0.3)',
                          padding: '6px 8px',
                          borderRadius: 6,
                          marginBottom: 8
                        }}>
                          {generatedKey.key}
                        </div>

                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={() => copyTextToClipboard(generatedKey.key, setCopiedGenKey)}
                            style={{
                              flex: 1,
                              background: copiedGenKey ? '#10B981' : 'rgba(255, 255, 255, 0.1)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              color: '#fff',
                              borderRadius: 6,
                              padding: '6px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4
                            }}
                          >
                            {copiedGenKey ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                            {copiedGenKey ? 'Key Copied!' : 'Copy Key'}
                          </button>

                          <button
                            type="button"
                            onClick={() => copyTextToClipboard(getWhatsAppCustomerTemplate(), setCopiedWhatsAppMsg)}
                            style={{
                              flex: 1,
                              background: copiedWhatsAppMsg ? '#25D366' : 'rgba(37, 211, 102, 0.15)',
                              border: '1px solid rgba(37, 211, 102, 0.4)',
                              color: '#25D366',
                              borderRadius: 6,
                              padding: '6px 10px',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 4
                            }}
                          >
                            {copiedWhatsAppMsg ? <Check style={{ width: 12, height: 12 }} /> : <Share2 style={{ width: 12, height: 12 }} />}
                            {copiedWhatsAppMsg ? 'Copied WhatsApp Msg!' : 'Copy WhatsApp Msg'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Reset / Test Plan Cancel (Optional for testing) */}
          {isPro && (
            <div style={{ textAlign: 'center', marginTop: 10 }}>
              {!showCancelConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: 10.5,
                    textDecoration: 'underline',
                    cursor: 'pointer'
                  }}
                >
                  Cancel / Reset to Free Plan
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                  <span style={{ fontSize: 10.5, color: '#f43f5e' }}>Confirm reset?</span>
                  <button
                    type="button"
                    onClick={() => { cancelPlan(); setShowCancelConfirm(false); }}
                    style={{ background: '#f43f5e', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }}
                  >
                    Yes, Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(false)}
                    style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: 10, cursor: 'pointer' }}
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
