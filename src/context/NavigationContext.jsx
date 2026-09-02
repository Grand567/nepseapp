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
});

export function NavigationProvider({ children, initialTab = 'dashboard' }) {
  const [activeTab, setActiveTabState] = useState(initialTab);
  const [tabHistory, setTabHistory] = useState([initialTab]);
  const [selectedStock, setSelectedStock] = useState(null);

  // Stack of back-button handlers (drawers, modals, sub-screens, etc.)
  // Handlers are evaluated from top (most recently pushed) to bottom.
  // A handler returning `true` signifies it has consumed the back event.
  const backHandlersRef = useRef([]);

  const registerBackHandler = useCallback((handler, priority = 0) => {
    const handlerObj = { id: Math.random().toString(36).substr(2, 9), handler, priority };
    backHandlersRef.current.push(handlerObj);
    // Sort descending by priority so higher priority handlers run first
    backHandlersRef.current.sort((a, b) => b.priority - a.priority);

    // Push a state into browser history to capture edge gestures / back button on web/mobile web
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
    }, 100); // Higher priority than sub-views
    return unregister;
  }, [selectedStock, registerBackHandler]);

  const setActiveTab = useCallback((tabId) => {
    setActiveTabState(prev => {
      if (prev === tabId) return prev;
      setTabHistory(h => [...h, tabId]);
      try {
        window.history.pushState({ tab: tabId }, '');
      } catch (_) {}
      return tabId;
    });
  }, []);

  const goBack = useCallback(() => {
    // 1. Run the topmost custom back handler if any (e.g. Stock detail, sub-service modal)
    if (backHandlersRef.current.length > 0) {
      const top = backHandlersRef.current[backHandlersRef.current.length - 1];
      try {
        const handled = top.handler();
        if (handled) return true;
      } catch (err) {
        console.warn('[Navigation] Back handler error:', err);
      }
    }

    // 2. If no modal is open, check if we can navigate back in tab history
    if (tabHistory.length > 1) {
      const newHistory = [...tabHistory];
      newHistory.pop(); // Remove current
      const prevTab = newHistory[newHistory.length - 1];
      setTabHistory(newHistory);
      setActiveTabState(prevTab);
      return true;
    }

    // 3. If on a non-dashboard tab, return to dashboard
    if (activeTab !== 'dashboard') {
      setActiveTabState('dashboard');
      setTabHistory(['dashboard']);
      return true;
    }

    return false; // Reached root, allowed to exit app
  }, [tabHistory, activeTab]);

  // Hook into Capacitor Android Hardware / Gesture Back Button
  useEffect(() => {
    let listener = null;

    const setupCapacitor = async () => {
      try {
        listener = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
          const handled = goBack();
          if (!handled) {
            // At root of app, allow default exit or minimize
            CapacitorApp.exitApp();
          }
        });
      } catch (e) {
        // Not in native Capacitor environment (e.g. running in standard browser)
      }
    };

    setupCapacitor();

    // Hook into Web browser / PWA popstate (swipe-back gestures on mobile browser)
    const handlePopState = (e) => {
      goBack();
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
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
