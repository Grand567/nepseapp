import React from 'react';

/**
 * Sub-Millisecond Progress Bar: A sleek gradient loading shimmer line
 * beneath headers during timeframe transitions, delta polling, and network synchronizations.
 */
export const LoadingShimmerBar = ({ active = false, className = '' }) => {
  if (!active) return null;
  return (
    <div className={`w-full h-[2.5px] relative overflow-hidden bg-white/5 pointer-events-none z-30 ${className}`}>
      <div 
        className="absolute inset-y-0 w-3/5 bg-gradient-to-r from-transparent via-emerald-400 to-sky-400 animate-shimmer-slide"
        style={{
          boxShadow: '0 0 10px rgba(52, 211, 153, 0.8), 0 0 5px rgba(56, 189, 248, 0.8)'
        }}
      />
    </div>
  );
};

export default LoadingShimmerBar;
