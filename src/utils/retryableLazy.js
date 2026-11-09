// src/utils/retryableLazy.js
import React from 'react';

/**
 * Wraps dynamic component import() to allow error recovery and retry.
 * In React, React.lazy permanently caches rejected promises in its internal _payload,
 * which prevents ErrorBoundary retries from re-fetching failed chunks.
 *
 * retryableLazy intercepts failures and resets the internal lazy payload to Uninitialized (-1)
 * so that when ErrorBoundary's "Retry" button is clicked, React will re-attempt the network fetch.
 *
 * @param {() => Promise<{ default: React.ComponentType<any> }>} importFactory
 * @returns {React.LazyExoticComponent<any>}
 */
export function retryableLazy(importFactory) {
  let lazyComponent;

  const load = () => {
    return importFactory().catch((err) => {
      // Schedule reset after React's lazy rejection handler executes
      setTimeout(() => {
        if (lazyComponent && lazyComponent._payload) {
          lazyComponent._payload._status = -1; // Uninitialized
          lazyComponent._payload._result = load; // Restore factory function
        }
      }, 0);
      throw err;
    });
  };

  lazyComponent = React.lazy(load);

  // Expose explicit retry method if needed
  lazyComponent.retry = () => {
    if (lazyComponent && lazyComponent._payload) {
      lazyComponent._payload._status = -1;
      lazyComponent._payload._result = load;
    }
  };

  return lazyComponent;
}
