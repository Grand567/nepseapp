import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { App as CapacitorApp } from '@capacitor/app';

const NavigationContext = createContext({
  activeTab: 'dashboard',
  setActiveTab: () => {},
  selectedStock: null,
  openStockDetail: () => {},
  closeStockDetail: () => {},
  registerBackHandler: () => () => {},
  goBack: () => {},
  exitToast: null,
  setExitToast: () => {},
});

export function NavigationProvider({ children, initialTab = 'dashboard' }) {
  const [activeTab, setActiveTabState] = useState(() => {
    try {
      return sessionStorage.getItem('nepse_active_tab') || initialTab;
    } catch {
      return initialTab;
    }
  });
  const [tabHistory, setTabHistory] = useState([initialTab]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [exitToast, setExitToast] = useState(null);

  // Stack of custom back-button handlers (drawers, modals, sub-screens)
  const backHandlersRef = useRef([]);
  const lastBackTimeRef = useRef(0);
  const lastGoBackTimeRef = useRef(0);

  // Auto-dismiss exit toast after 2.5 seconds
  useEffect(() => {
    if (exitToast) {
      const timer = setTimeout(() => {
        setExitToast(null);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [exitToast]);

  const registerBackHandler = useCallback((handler, priority = 0) => {
    const handlerObj = { id: Math.random().toString(36).substr(2, 9), handler, priority };
    backHandlersRef.current.push(handlerObj);
    // Sort descending by priority so highest priority runs first
    backHandlersRef.current.sort((a, b) => b.priority - a.priority);

    // Push state into browser history for mobile web gesture support
    try {
      window.history.pushState({ modalId: handlerObj.id }, '');
    } catch (_) {}

    return () => {
      backHandlersRef.current = backHandlersRef.current.filter(h => h.id !== handlerObj.id);
    };
  }, []);

  const openStockDetail = useCallback((stock) => {
    if (!stock) return;
    setSelectedStock(stock);
  }, []);

  const closeStockDetail = useCallback(() => {
    setSelectedStock(null);
  }, []);

  // Register stock detail modal on the back stack when active
  useEffect(() => {
    if (!selectedStock) return;
    const unregister = registerBackHandler(() => {
      setSelectedStock(null);
      return true; // Handled
    }, 100);
    return unregister;
  }, [selectedStock, registerBackHandler]);

  const setActiveTab = useCallback((tabId) => {
    try {
      sessionStorage.setItem('nepse_active_tab', tabId);
    } catch (_) {}
    setActiveTabState(tabId);
  }, []);

  // Core back navigation handler (used by both hardware back & gestures)
  const goBack = useCallback(async () => {
    const now = Date.now();
    if (now - lastGoBackTimeRef.current < 280) {
      return true; // Debounce rapid multiple firings (e.g. Capacitor backButton + window popstate)
    }
    lastGoBackTimeRef.current = now;

    // 1. Run the topmost registered modal / drawer handler
    if (backHandlersRef.current.length > 0) {
      const top = backHandlersRef.current[0]; // Highest priority
      try {
        const handled = top.handler();
        if (handled) return true;
      } catch (err) {
        console.warn('[Navigation] Back handler error:', err);
      }
    }

    // 2. Dispatch custom event to allow child views (search dialogs, panels) to intercept
    const backEvent = new CustomEvent('nepse-back-pressed', { cancelable: true });
    const wasPrevented = !window.dispatchEvent(backEvent);
    if (wasPrevented) {
      return true;
    }

    // 3. Close stock detail modal if active
    if (selectedStock) {
      setSelectedStock(null);
      return true;
    }

    // 4. On any navbar screen: double back within 2 seconds exits app (Kharcha Tracker pattern)
    if (now - lastBackTimeRef.current < 2000) {
      try {
        await CapacitorApp.exitApp();
      } catch (_) {}
      return true;
    } else {
      lastBackTimeRef.current = now;
      setExitToast({
        title: 'एप बन्द गर्न फेरि ब्याक गर्नुहोस्',
        desc: 'Press back again within 2 seconds to exit'
      });
      return true;
    }
  }, [selectedStock]);

  // Hook into Capacitor Native Android Hardware Back Button & Swipe Gestures
  useEffect(() => {
    let listenerHandle = null;

    const setupCapacitor = async () => {
      try {
        listenerHandle = await CapacitorApp.addListener('backButton', () => {
          goBack();
        });
      } catch (_) {
        // Web / non-Capacitor environment
      }
    };

    setupCapacitor();

    // Hook into Web browser / PWA popstate (Android swipe gestures in WebView)
    const handlePopState = () => {
      goBack();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        listenerHandle.remove();
      }
      window.removeEventListener('popstate', handlePopState);
    };
  }, [goBack]);

  return (
    <NavigationContext.Provider
      value={{
        activeTab,
        setActiveTab,
        selectedStock,
        openStockDetail,
        closeStockDetail,
        registerBackHandler,
        goBack,
        exitToast,
        setExitToast,
      }}
    >
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  return useContext(NavigationContext);
}

/**
 * Custom hook to register a back-handler for a modal, drawer, or sub-view.
 * Automatically cleans up when component unmounts or when condition is false.
 */
export function useBackHandler(handler, isActive = true, priority = 10) {
  const { registerBackHandler } = useNavigation();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!isActive) return;
    return registerBackHandler(() => {
      if (handlerRef.current) {
        return handlerRef.current();
      }
      return false;
    }, priority);
  }, [isActive, priority, registerBackHandler]);
}
