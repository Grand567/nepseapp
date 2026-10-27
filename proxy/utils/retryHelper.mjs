/**
 * retryHelper.mjs
 * Resilient Retry Engine with Exponential Backoff and Jitter
 * Handles transient network dropouts, HTTP 429 rate limits, and server 5xx errors.
 */

export function isTransientNetworkError(err) {
  if (!err) return false;
  const code = err.code || err.cause?.code;
  const status = Number(err.response?.status || err.status || 0);
  const transientCodes = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT'];
  if (transientCodes.includes(code)) return true;
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  if (err.message && (
    err.message.includes('timeout') ||
    err.message.includes('socket hang up') ||
    err.message.includes('Network error') ||
    err.message.includes('rate limit')
  )) {
    return true;
  }
  return false;
}

/**
 * Executes an asynchronous function with exponential backoff retry.
 * Formula: delay = Math.min(initialDelayMs * Math.pow(backoffFactor, attempt - 1), maxDelayMs) + jitter
 *
 * @param {Function} fn - Async operation to execute: (attempt) => Promise<T>
 * @param {object} options
 * @param {number} options.maxRetries - Maximum retry attempts (default: 3)
 * @param {number} options.initialDelayMs - Initial delay in ms (default: 300)
 * @param {number} options.backoffFactor - Multiplier per attempt (default: 2)
 * @param {number} options.maxDelayMs - Maximum delay cap in ms (default: 5000)
 * @param {Function} options.retryCondition - Custom check returning boolean
 * @param {Function} options.onRetry - Notification callback: (err, attempt, delayMs) => void
 * @returns {Promise<any>}
 */
export async function fetchWithRetryBackoff(fn, {
  maxRetries = 3,
  initialDelayMs = 300,
  backoffFactor = 2,
  maxDelayMs = 5000,
  retryCondition = isTransientNetworkError,
  onRetry = null,
} = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt++;
      const shouldRetry = attempt <= maxRetries && (!retryCondition || retryCondition(err));
      if (!shouldRetry) {
        throw err;
      }
      const exponentialDelay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
      const jitter = Math.floor(Math.random() * 50);
      const delayMs = cappedDelay + jitter;

      if (typeof onRetry === 'function') {
        try { onRetry(err, attempt, delayMs); } catch (_) {}
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
