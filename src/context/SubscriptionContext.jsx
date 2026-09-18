// src/context/SubscriptionContext.jsx
// Global React context providing real-time Pro state, monthly timeframe management, and modal controls.

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  getStoredSubscription,
  saveStoredSubscription,
  normalizeSubscription,
  computeSubscriptionMetrics,
  createProSubscription,
  redeemVoucherKey,
  getFreeSubscription,
  getDeviceLicenseId,
  PRO_PLANS
} from '../utils/subscription';
import { syncUserDataToCloud, getLocalSession } from '../utils/firebase';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const [subState, setSubState] = useState(() => getStoredSubscription());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialPlan, setModalInitialPlan] = useState('1m');
  const [lockedFeatureName, setLockedFeatureName] = useState(null);

  // Periodically re-evaluate expiration (every 60 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setSubState(prev => normalizeSubscription(prev));
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Compute live metrics
  const metrics = useMemo(() => computeSubscriptionMetrics(subState), [subState]);

  // Activate / Extend a Pro plan (1m, 2m, 3m, 6m, 12m)
  const activatePlan = useCallback((durationStr = '1m', source = 'manual', voucherCode = null) => {
    const updated = createProSubscription(durationStr, source, voucherCode, subState);
    saveStoredSubscription(updated);
    setSubState(updated);

    // Sync with cloud user vault if logged in
    try {
      const user = getLocalSession();
      if (user && (user.uid || user.id)) {
        syncUserDataToCloud(user.uid || user.id, { subscription: updated }).catch(() => {});
      }
    } catch (_) {}

    return updated;
  }, [subState]);

  // Cancel / Reset plan to free
  const cancelPlan = useCallback(() => {
    const free = getFreeSubscription();
    saveStoredSubscription(free);
    setSubState(free);

    try {
      const user = getLocalSession();
      if (user && (user.uid || user.id)) {
        syncUserDataToCloud(user.uid || user.id, { subscription: free }).catch(() => {});
      }
    } catch (_) {}
  }, []);

  const [deviceId] = useState(() => getDeviceLicenseId());

  // Redeem voucher code or device-bound license key
  const redeemCode = useCallback((code) => {
    const result = redeemVoucherKey(code, deviceId);
    if (result.success && result.duration) {
      activatePlan(result.duration, 'license_key', result.code);
    }
    return result;
  }, [activatePlan, deviceId]);

  // Synchronize cloud subscription when user logs in or syncs
  const syncFromCloud = useCallback((cloudSub) => {
    if (!cloudSub || typeof cloudSub !== 'object') return;
    const normalized = normalizeSubscription(cloudSub);
    // If cloud has newer or active pro subscription, adopt it
    if (normalized.isPro || (!subState.isPro && normalized.expiresAt > Date.now())) {
      saveStoredSubscription(normalized);
      setSubState(normalized);
    }
  }, [subState]);

  // Open modal with feature context
  const openSubscriptionModal = useCallback((plan = '1m', featureName = null) => {
    setModalInitialPlan(plan || '1m');
    setLockedFeatureName(featureName || null);
    setIsModalOpen(true);
  }, []);

  const closeSubscriptionModal = useCallback(() => {
    setIsModalOpen(false);
    setLockedFeatureName(null);
  }, []);

  const value = useMemo(() => ({
    ...metrics,
    rawSubscription: subState,
    deviceId,
    plans: PRO_PLANS,
    isModalOpen,
    lockedFeatureName,
    openSubscriptionModal,
    closeSubscriptionModal,
    activatePlan,
    cancelPlan,
    redeemCode,
    syncFromCloud
  }), [
    metrics,
    subState,
    deviceId,
    isModalOpen,
    lockedFeatureName,
    openSubscriptionModal,
    closeSubscriptionModal,
    activatePlan,
    cancelPlan,
    redeemCode,
    syncFromCloud
  ]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
