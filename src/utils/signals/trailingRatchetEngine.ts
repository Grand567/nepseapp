/**
 * src/utils/signals/trailingRatchetEngine.ts
 *
 * Multi-Stage Trailing Stop-Loss Ratchet Engine for NEPSE Paper Trading
 *
 * Implements Institutional Dynamic Risk Protection:
 * - Stage 0 (INITIAL_RISK): Initial technical stop loss floor (e.g. -4% to -6%)
 * - Stage 1 (BREAKEVEN_LOCKED): Ratchets stop-loss to Breakeven (+0.6% friction buffer) upon reaching +1.0R gain
 * - Stage 2 (PROFIT_LOCKED): Banks 50% partial profit at Target 1 (+1.5R) and ratchets runner stop-loss to +1.0R
 * - Stage 3 (RUNNER_COMPLETED): Exits final runner shares at Target 2 (+2.5R to +3.0R)
 * - NEPSE Invariants: Strictly enforces T+2 Demat Settlement lock (`holdSessions >= 2`) before trade liquidation
 */

export type RatchetStage =
  | 'INITIAL_RISK'
  | 'BREAKEVEN_LOCKED'
  | 'PROFIT_LOCKED'
  | 'RUNNER_COMPLETED';

export interface PaperPosition {
  id: string;
  symbol: string;
  sector?: string;
  entryDate?: string;
  shares: number;
  entryPrice: number;
  costBasisNpr: number;
  initialStopLoss: number;
  currentStopLoss: number;
  target1: number;
  target2: number;
  t1Banked?: boolean;
  holdSessions: number;
  ratchetStage: RatchetStage;
  triggers: string[];
}

export interface RatchetLevels {
  rAmount: number;
  target1: number;
  target2: number;
  breakevenPrice: number;
  profitLockedFloor: number;
}

export interface RatchetEvaluationResult {
  newStopLoss: number;
  ratchetStage: RatchetStage;
  takePartialProfit: boolean;
  partialSharesToSell: number;
  isClosed: boolean;
  exitPrice?: number;
  exitReason?: string;
  settlementBlocked?: boolean;
  notes: string[];
}

/**
 * Calculates R-Multiple risk targets and statutory friction buffers for an order
 */
export function calculateRatchetLevels(entryPrice: number, initialStopLoss: number): RatchetLevels {
  const entry = Math.max(0, Number(entryPrice || 0));
  const initialStop = Math.max(0, Number(initialStopLoss || (entry * 0.95)));
  const rAmount = Math.max(0.1, Number((entry - initialStop).toFixed(2)));

  // NEPSE Statutory Friction Buffer: 5-Tier Brokerage (~0.35%) + SEBON (0.015%) + DP fee (Rs 25) + buffer = ~0.6%
  const breakevenPrice = Number((entry * 1.006).toFixed(2));
  const target1 = Number((entry + 1.5 * rAmount).toFixed(2));
  const target2 = Number((entry + 2.5 * rAmount).toFixed(2));
  const profitLockedFloor = Number((entry + 1.0 * rAmount).toFixed(2));

  return {
    rAmount,
    target1,
    target2,
    breakevenPrice,
    profitLockedFloor
  };
}

/**
 * Evaluates position against current price bar and updates trailing stop-loss / targets
 */
export function evaluateTrailingRatchet({
  position,
  currentHigh,
  currentLow,
  currentClose,
  holdSessions
}: {
  position: PaperPosition;
  currentHigh: number;
  currentLow: number;
  currentClose: number;
  holdSessions: number;
}): RatchetEvaluationResult {
  const high = Number(currentHigh || currentClose);
  const low = Number(currentLow || currentClose);
  const close = Number(currentClose || high);
  const entry = position.entryPrice;
  const initialStop = position.initialStopLoss || (entry * 0.95);
  const levels = calculateRatchetLevels(entry, initialStop);

  let currentStop = position.currentStopLoss || initialStop;
  let stage: RatchetStage = position.ratchetStage || 'INITIAL_RISK';
  let takePartial = false;
  let partialQty = 0;
  let closed = false;
  let exitPx: number | undefined;
  let exitRsn: string | undefined;
  let blockedSettlement = false;
  const notes: string[] = [];

  const isSettledInDemat = holdSessions >= 2;

  // ── Step 1: Check Target 2 (Full Exit) ──
  if (high >= position.target2) {
    if (isSettledInDemat) {
      closed = true;
      exitPx = position.target2;
      exitRsn = 'TARGET_2_HIT';
      stage = 'RUNNER_COMPLETED';
      notes.push(`Target 2 reached (+2.5R at Rs. ${position.target2}). Full runner profit banked.`);
      return {
        newStopLoss: currentStop,
        ratchetStage: stage,
        takePartialProfit: false,
        partialSharesToSell: 0,
        isClosed: closed,
        exitPrice: exitPx,
        exitReason: exitRsn,
        notes
      };
    } else {
      blockedSettlement = true;
      notes.push(`Target 2 hit at Rs. ${high}, but execution blocked by NEPSE T+2 Demat Settlement Lock.`);
    }
  }

  // ── Step 2: Check Target 1 (Partial 50% Profit & Ratchet to +1.0R) ──
  if (!position.t1Banked && high >= position.target1) {
    takePartial = true;
    partialQty = Math.floor(position.shares / 2);
    // Elevate stop-loss to at least +1.0R floor to protect gains on the remainder
    currentStop = Math.max(currentStop, levels.profitLockedFloor);
    stage = 'PROFIT_LOCKED';
    notes.push(`Target 1 reached (+1.5R at Rs. ${position.target1}). Banked 50% shares (${partialQty} kitta). Runner stop-loss elevated to Rs. ${currentStop} (+1R floor).`);
  }

  // ── Step 3: Check Breakeven Armor Trigger (+1.0R Gain) ──
  else if (stage === 'INITIAL_RISK' && high >= (entry + levels.rAmount)) {
    currentStop = Math.max(currentStop, levels.breakevenPrice);
    stage = 'BREAKEVEN_LOCKED';
    notes.push(`Reached +1.0R gain (Rs. ${entry + levels.rAmount}). Stop-loss ratcheted to Breakeven Armor (Rs. ${levels.breakevenPrice}).`);
  }

  // ── Step 4: Check Stop-Loss Trigger ──
  if (low <= currentStop) {
    if (isSettledInDemat) {
      closed = true;
      exitPx = Math.min(currentStop, close);
      exitRsn = 'STOP_LOSS_HIT';
      notes.push(`Stop-loss triggered at Rs. ${currentStop}. Position liquidated at Rs. ${exitPx}.`);
    } else {
      blockedSettlement = true;
      notes.push(`Stop-loss reached at Rs. ${low}, but sale blocked: NEPSE T+2 settlement requires holdSessions >= 2 (current: ${holdSessions}).`);
    }
  }

  return {
    newStopLoss: currentStop,
    ratchetStage: stage,
    takePartialProfit: takePartial,
    partialSharesToSell: partialQty,
    isClosed: closed,
    exitPrice: exitPx,
    exitReason: exitRsn,
    settlementBlocked: blockedSettlement,
    notes
  };
}
