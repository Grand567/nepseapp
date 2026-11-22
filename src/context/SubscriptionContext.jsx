// src/context/SubscriptionContext.jsx
// Global React context providing server-verified Pro state, monthly timeframe management, and modal controls.

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getStoredSubscription,
  saveStoredSubscription,
  normalizeSubscription,
  computeSubscriptionMetrics,
  redeemVoucherKey,
  getFreeSubscription,
  getDeviceLicenseId,
  PRO_PLANS
} from '../utils/subscription';
import {
  fetchServerLicenseStatus,
  revokeServerLicenseStatusOnServer
} from '../utils/licenseEngine';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const [deviceId] = useState(() => getDeviceLicenseId());
  const [subState, setSubState] = useState(() => getStoredSubscription());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalInitialPlan, setModalInitialPlan] = useState('1m');
  const [lockedFeatureName, setLockedFeatureName] = useState(null);
  const mutationVersionRef = useRef(0);

  // Hydrate authoritative subscription state from server on mount & check expiry every 60s
  useEffect(() => {
    let active = true;
    const reqVersion = mutationVersionRef.current;

    fetchServerLicenseStatus(deviceId).then((serverSub) => {
      if (!active || reqVersion !== mutationVersionRef.current || !serverSub || typeof serverSub !== 'object') return;
      const norm = normalizeSubscription(serverSub);
      saveStoredSubscription(norm);
      setSubState(norm);
    }).catch(() => {});

    const timer = setInterval(() => {
      setSubState(prev => {
        const next = normalizeSubscription(prev);
        if (next.isPro !== prev.isPro) {
          saveStoredSubscription(next);
        }
        return next;
      });
    }, 60000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [deviceId]);

  const metrics = useMemo(() => computeSubscriptionMetrics(subState), [subState]);

  // Cancel / Reset local subscription state to free tier
  const cancelPlan = useCallback(async () => {
    mutationVersionRef.current += 1;
    await revokeServerLicenseStatusOnServer(deviceId).catch(() => {});
    const free = getFreeSubscription();
    saveStoredSubscription(free);
    setSubState(free);
  }, [deviceId]);

  // Redeem server-verified device-bound license key
  const redeemCode = useCallback(async (code) => {
    const result = await redeemVoucherKey(code, deviceId);
    if (result.success && result.subscription) {
      mutationVersionRef.current += 1;
      const verified = normalizeSubscription(result.subscription);
      saveStoredSubscription(verified);
      setSubState(verified);
    }
    return result;
  }, [deviceId]);

  // Refresh authoritative Pro entitlement from license server instead of trusting cloud sync blobs
  const syncFromCloud = useCallback((_cloudSub) => {
    const reqVersion = mutationVersionRef.current;
    fetchServerLicenseStatus(deviceId).then((serverSub) => {
      if (reqVersion !== mutationVersionRef.current || !serverSub || typeof serverSub !== 'object') return;
      const verified = normalizeSubscription(serverSub);
      saveStoredSubscription(verified);
      setSubState(verified);
    }).catch(() => {});
  }, [deviceId]);

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
    modalInitialPlan,
    isModalOpen,
    lockedFeatureName,
    openSubscriptionModal,
    closeSubscriptionModal,
    cancelPlan,
    redeemCode,
    syncFromCloud
  }), [
    metrics,
    subState,
    deviceId,
    modalInitialPlan,
    isModalOpen,
    lockedFeatureName,
    openSubscriptionModal,
    closeSubscriptionModal,
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
