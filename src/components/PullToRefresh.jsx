import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RefreshCw, ArrowDown } from 'lucide-react';

const PULL_THRESHOLD = 70; // px required to trigger refresh
const MAX_PULL = 120; // maximum pull distance

export default function PullToRefresh({
  children,
  onRefresh,
  isRefreshing = false,
  disabled = false
}) {
  const containerRef = useRef(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);
  const isDraggingRef = useRef(false);

  // Check if container is scrolled to top
  const isAtTop = useCallback(() => {
    if (!containerRef.current) return true;
    const el = containerRef.current;
    return el.scrollTop <= 0;
  }, []);

  // Touch Start
  const handleTouchStart = (e) => {
    if (disabled || isRefreshing) return;
    if (isAtTop()) {
      startYRef.current = e.touches[0].clientY;
      currentYRef.current = startYRef.current;
      isDraggingRef.current = true;
    }
  };

  // Touch Move
  const handleTouchMove = (e) => {
    if (!isDraggingRef.current || disabled || isRefreshing) return;
    currentYRef.current = e.touches[0].clientY;
    const diff = currentYRef.current - startYRef.current;

    if (diff > 0 && isAtTop()) {
      // Apply elastic resistance
      const distance = Math.min(MAX_PULL, diff * 0.42);
      setPullDistance(distance);
      setIsPulling(true);

      // Prevent native overscroll / pull if possible
      if (e.cancelable && diff > 8) {
        e.preventDefault();
      }
    } else {
      setPullDistance(0);
      setIsPulling(false);
    }
  };

  // Touch End
  const handleTouchEnd = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsPulling(false);

    if (pullDistance >= PULL_THRESHOLD && !isRefreshing && onRefresh) {
      // Trigger Haptic Feedback on mobile if available
      try {
        if (window.navigator?.vibrate) {
          window.navigator.vibrate(25);
        }
      } catch (_) {}

      setPullDistance(50); // Snap to loading height
      onRefresh();
    } else {
      setPullDistance(0);
    }
  };

  // Mouse Drag (Desktop testing support)
  const handleMouseDown = (e) => {
    if (disabled || isRefreshing) return;
    if (isAtTop() && e.button === 0) {
      startYRef.current = e.clientY;
      currentYRef.current = startYRef.current;
      isDraggingRef.current = true;

      const handleMouseMove = (moveEvent) => {
        if (!isDraggingRef.current) return;
        currentYRef.current = moveEvent.clientY;
        const diff = currentYRef.current - startYRef.current;
        if (diff > 0 && isAtTop()) {
          const distance = Math.min(MAX_PULL, diff * 0.42);
          setPullDistance(distance);
          setIsPulling(true);
        } else {
          setPullDistance(0);
          setIsPulling(false);
        }
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        setIsPulling(false);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);

        if (currentYRef.current - startYRef.current >= PULL_THRESHOLD * 2 && !isRefreshing && onRefresh) {
          setPullDistance(50);
          onRefresh();
        } else {
          setPullDistance(0);
        }
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
  };

  // Reset pull distance once refreshing finishes
  useEffect(() => {
    if (!isRefreshing && !isDraggingRef.current) {
      const timer = setTimeout(() => {
        setPullDistance(0);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isRefreshing]);

  const progress = Math.min(1, pullDistance / PULL_THRESHOLD);
  const isReady = pullDistance >= PULL_THRESHOLD;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: isPulling ? 'none' : 'pan-y'
      }}
    >
      {/* ── Pull Indicator Header ── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: `${pullDistance}px`,
          maxHeight: `${MAX_PULL}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: 40,
          transition: isPulling ? 'none' : 'height 0.28s cubic-bezier(0.33, 1, 0.68, 1)',
        }}
      >
        {(pullDistance > 10 || isRefreshing) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 14px',
              borderRadius: 24,
              background: 'rgba(15, 23, 42, 0.95)',
              border: `1px solid ${isReady || isRefreshing ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.12)'}`,
              boxShadow: isReady || isRefreshing ? '0 0 16px rgba(16, 185, 129, 0.3)' : '0 4px 12px rgba(0,0,0,0.4)',
              transform: `scale(${Math.min(1.05, 0.8 + progress * 0.25)})`,
              transition: 'transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease'
            }}
          >
            {isRefreshing ? (
              <RefreshCw
                style={{
                  width: 16,
                  height: 16,
                  color: '#10B981',
                  animation: 'spin 0.85s linear infinite'
                }}
              />
            ) : (
              <div style={{ position: 'relative', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="3"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke={isReady ? '#10B981' : '#3875F6'}
                    strokeWidth="3.5"
                    strokeDasharray={`${progress * 100}, 100`}
                  />
                </svg>
                <ArrowDown
                  style={{
                    position: 'absolute',
                    width: 10,
                    height: 10,
                    color: isReady ? '#10B981' : '#94a3b8',
                    transform: isReady ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s ease, color 0.2s ease'
                  }}
                />
              </div>
            )}

            <span
              style={{
                fontSize: 11.5,
                fontWeight: 800,
                color: isReady || isRefreshing ? '#10B981' : '#cbd5e1',
                letterSpacing: '0.01em'
              }}
            >
              {isRefreshing
                ? 'Updating NEPSE Data…'
                : isReady
                ? 'Release to Refresh'
                : 'Pull down to refresh'}
            </span>
          </div>
        )}
      </div>

      {/* ── Content Wrapper ── */}
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? 'none' : 'transform 0.28s cubic-bezier(0.33, 1, 0.68, 1)'
        }}
      >
        {children}
      </div>
    </div>
  );
}
