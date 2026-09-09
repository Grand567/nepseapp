export interface StockAnalysisPayload {
  symbol: string;
  ltp: number;
  fundamentals: {
    pe: number;
    pbv: number;
    eps: number;
    roe: number;
    dividendYield: number;
    bookValue: number;
  };
  technicals: {
    rsi14: number;
    macd: { line: number; signal: number; histogram: number };
    ema20: number;
    ema50: number;
    ema200: number;
    volumeZScore: number;
    bbwPct: number; // Bollinger Band Width
  };
  smartMoney: {
    brokerDominanceRatio: number;
    stealthAccumulationIndex: number;
    turnover: number;
    topBrokers: number[]; // e.g. [58, 45, 34]
  };
}

export interface GuruVerdict {
  symbol: string;
  timestamp: string;
  zone: 'Buying' | 'Entry' | 'Holding' | 'Exit' | 'Selling';
  confidenceScore: number; // 0 to 100
  momentumBipolar: number; // -100 to +100
  smartMoneyAccumulation: {
    dominantBrokers: number[];
    wyckoffPhase: 'Accumulation' | 'Markup' | 'Distribution' | 'Markdown';
  };
  intrinsicValue: {
    grahamNumber: number;
    marginOfSafetyPct: number;
  };
  riskReward: {
    entryTarget: number;
    stopLoss: number;
    profitTarget: number;
    rrr: number; // Risk-Reward Ratio
  };
  summaryReasoning: string;
}
