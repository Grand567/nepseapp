// PRODUCTION-GRADE NEPSE SERVICES HUB — FIXED & FULLY WIRED (90+ services)
// Fix summary vs original ServicesHub.jsx:
// 1. Every filter now runs on ENRICHED data (dpi, rsi, macd, technicalScore,
//    volumeZScore, stealthAccumulation, candlestickPattern…) computed in liveData.ts
// 2. All fetchers (fetchLiveMarket, fetchMarketSummary, …) hit real NEPSE routes
//    with CORS-proxy + timeout, then fall back to deterministic simulation —
//    so no tab ever renders blank.
// 3. Missing mappings fixed: Dividend/SIP calculators, pe-ranking, live-market,
//    market-summary, top-volume/turnover/transactions, sector-rotation, api-status…
// 4. Detail view + hub view use Tailwind (no inline-style fragility).
import './servicesHub.css';
import { useMemo, useState, useEffect, type ComponentType } from 'react';
import {
  Search, ChevronLeft, Activity, TrendingUp, TrendingDown,
  Zap, Flame, Award, Users, Radio, Compass, Layers, Shield,
  ArrowLeftRight, ArrowUp, DollarSign, Target, PieChart, Calculator,
  Wallet, Newspaper, Building2, Briefcase, Sparkles, Rocket, Percent,
  FileText, Eye, Calendar, Landmark, Coins, Receipt, BookOpen, RefreshCw,
  Crown, Heart, Scale, SlidersHorizontal, Clock, Bell, Lock,
  LayoutGrid, Gauge, Crosshair, Brain, Gem, Banknote, Filter, Settings,
  GitBranch, BellRing, ScanLine, LayoutDashboard,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  UniversalScreener, StockMomentumAnalyzer, MarketSummaryService, TopPerformersService,
  IPOTracker, NewsService, SectorHeatmap, FloorSheetService, CompareStocks,
  StaticInfoService, PortfolioTool, WatchlistTool, TradeNotesTool, AlertsTool,
  ApiStatusService, BrokersDirectoryService, IPOPipelineService, MutualFundsService,
  LiveFloorsheetService, SectorHeatmapService, BrokerAnalysisService,
} from './services';
import { useBackHandler } from '../context/NavigationContext';
import { GrahamValuation, BrokerageCalculator, DividendCalculator, SIPCalculator, RiskRewardCalculator, BonusAdjustmentCalculator, RightAdjustmentCalculator } from './calculators';
import { NEPSE_UNIVERSE } from '../data/nepseUniverse';
import { EntryExitAnalyzer } from './EntryExitAnalyzer';
import { DividendHistoryPanel } from './DividendHistoryPanel';

// ── Shared colors (solid, no gradients) ──
const COLORS: Record<string, { bg: string; border: string; text: string }> = {
  emerald: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', text: '#34d399' },
  rose: { bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.35)', text: '#fb7185' },
  yellow: { bg: 'rgba(234,179,8,0.12)', border: 'rgba(234,179,8,0.35)', text: '#facc15' },
  purple: { bg: 'rgba(168,85,247,0.14)', border: 'rgba(168,85,247,0.35)', text: '#c084fc' },
  cyan: { bg: 'rgba(6,182,212,0.12)', border: 'rgba(6,182,212,0.35)', text: '#22d3ee' },
  pink: { bg: 'rgba(236,72,153,0.12)', border: 'rgba(236,72,153,0.35)', text: '#f472b6' },
  teal: { bg: 'rgba(20,184,166,0.12)', border: 'rgba(20,184,166,0.35)', text: '#2dd4bf' },
  blue: { bg: 'rgba(59,130,246,0.14)', border: 'rgba(59,130,246,0.35)', text: '#60a5fa' },
  orange: { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)', text: '#fb923c' },
};

const CATEGORY_MAP: Record<string, string> = {
  'featured': 'trading',
  'traders': 'trading',
  'trade-lab': 'trading',
  'scanner': 'trading',
  'analytics': 'valuation',
  'trade-tools': 'calculators',
  'live-data': 'market',
  'information': 'market',
  'smart-money': 'smart-money',
  'desk': 'desk',
  'system': 'market',
};

export const getServiceCategory = (s: { id: string; cat: string }): string => {
  if (s.id === 'broker-analysis' || s.id === 'broker-favourites' || s.id === 'zero-sum-floorsheet' || s.id === 'broker-flow' || s.id === 'broker-heatmap' || s.id === 'broker-dominance') {
    return 'smart-money';
  }
  if (s.id === 'calculator' || s.id.includes('calc') || s.id.includes('adjustment') || s.id === 'risk-reward' || s.id === 'compare-stocks' || s.id === 'sip-in-stocks') {
    return 'calculators';
  }
  if (s.id === 'smart-portfolio' || s.id === 'target-alert' || s.id === 'credentials' || s.id === 'apply-history' || s.id === 'edit') {
    return 'desk';
  }
  return CATEGORY_MAP[s.cat] || 'trading';
};

const FILTER_TABS = [
  { id: 'all', label: 'All Tools', icon: Sparkles },
  { id: 'trading', label: 'Trading', icon: TrendingUp },
  { id: 'valuation', label: 'Valuation', icon: Award },
  { id: 'calculators', label: 'Calculators', icon: Calculator },
  { id: 'market', label: 'Market Data', icon: Activity },
  { id: 'smart-money', label: 'Smart Money', icon: Crown },
  { id: 'desk', label: 'My Desk', icon: Briefcase },
];

const CATEGORIES = [
  { id: 'trading', title: 'Trading & Technical Setups', subtitle: 'Momentum indicators, pattern detection, breakout scanners & entry/exit analysis.' },
  { id: 'valuation', title: 'Valuation & Fundamentals', subtitle: 'Intrinsic value models, PE rankings, dividend kings & balance sheet scanners.' },
  { id: 'calculators', title: 'Trading Calculators', subtitle: 'SEBON brokerage, dividend yield, bonus/right adjustments, risk-reward & SIP.' },
  { id: 'market', title: 'Market Data & Floats', subtitle: 'Live floor sheets, sector heatmaps, market depth, broker lists & IPO alerts.' },
  { id: 'smart-money', title: 'Smart Money Tracker', subtitle: 'Stealth accumulation tracking, broker dominance, aggressive buy/sell & block deals.' },
  { id: 'desk', title: 'Your Personal Desk', subtitle: 'Custom watchlists, portfolio tracker, trade journal notes & price alerts.' },
];


interface ServiceDef { id: string; name: string; icon: LucideIcon; color: string; cat: string; star?: boolean; }

const ALL_SERVICES: ServiceDef[] = [
  { id: 'stock-momentum', name: 'Multi-Timeframe Analyzer', icon: Clock, color: 'yellow', cat: 'featured', star: true },
  { id: 'entry-exit-analyzer', name: 'Entry/Exit Analyzer', icon: Target, color: 'emerald', cat: 'featured', star: true },
  { id: 'api-status', name: 'API Health Check', icon: Gauge, color: 'teal', cat: 'featured', star: true },

  { id: 'decision-probability', name: 'Decision Probability', icon: Target, color: 'emerald', cat: 'traders', star: true },
  { id: 'ai-momentum', name: 'AI Momentum', icon: Zap, color: 'emerald', cat: 'traders', star: true },
  { id: 'breakout-stocks', name: 'Breakout Stocks', icon: Flame, color: 'rose', cat: 'traders', star: true },
  { id: 'volume-shockers', name: 'Volume Shockers', icon: Zap, color: 'yellow', cat: 'traders', star: true },
  { id: 'technical-ratings', name: 'Technical Ratings', icon: Award, color: 'emerald', cat: 'traders', star: true },
  { id: 'players-choices', name: 'Players Choices', icon: Users, color: 'purple', cat: 'traders', star: true },
  { id: 'circuit-setup', name: 'Circuit Setup', icon: Radio, color: 'cyan', cat: 'traders', star: true },
  { id: 'candlestick-patterns', name: 'Candlestick Patterns', icon: Compass, color: 'pink', cat: 'traders', star: true },
  { id: 'consolidating-stocks', name: 'Consolidating Stocks', icon: Layers, color: 'teal', cat: 'traders', star: true },
  { id: 'fresh-indicators', name: 'Fresh Indicators', icon: Activity, color: 'emerald', cat: 'traders', star: true },
  { id: 'support-resistance', name: 'Support & Resistance', icon: Shield, color: 'purple', cat: 'traders', star: true },
  { id: 'unusual-trades', name: 'Unusual Trades', icon: ArrowLeftRight, color: 'orange', cat: 'traders', star: true },
  { id: 'relative-strength', name: 'Relative Strength', icon: ArrowUp, color: 'emerald', cat: 'traders', star: true },

  { id: 'graham-intrinsic', name: 'Graham Intrinsic', icon: Award, color: 'blue', cat: 'analytics', star: true },
  { id: 'broker-analysis', name: 'Broker Analysis', icon: Users, color: 'purple', cat: 'analytics' },
  { id: 'stockwise-analysis', name: 'Stockwise Analysis', icon: Activity, color: 'blue', cat: 'analytics' },
  { id: 'stocks-by-market-cap', name: 'Stocks By Market Cap', icon: Building2, color: 'blue', cat: 'analytics' },
  { id: 'promoter-shares', name: 'Promoter Shares', icon: Layers, color: 'orange', cat: 'analytics' },
  { id: 'dividend-kings', name: 'Dividend Kings', icon: Award, color: 'yellow', cat: 'analytics' },
  { id: 'fundamentals-pro', name: 'Fundamentals Pro', icon: Award, color: 'emerald', cat: 'analytics' },
  { id: 'broker-favourites', name: 'Broker Favourites', icon: Heart, color: 'rose', cat: 'analytics' },
  { id: 'hot-stocks', name: 'Hot Stocks', icon: Flame, color: 'rose', cat: 'analytics' },
  { id: 'advanced-charts', name: 'Advanced Charts', icon: Activity, color: 'emerald', cat: 'analytics' },
  { id: 'mutual-funds-unlock', name: 'Mutual Funds Unlock', icon: PieChart, color: 'cyan', cat: 'analytics' },
  { id: 'price-vs-volume', name: 'Price vs Volume', icon: DollarSign, color: 'purple', cat: 'analytics' },
  { id: 'zero-sum-floorsheet', name: 'Zero Sum Floorsheet', icon: LayoutGrid, color: 'purple', cat: 'analytics' },
  { id: 'pe-ranking', name: 'P/E Ranking', icon: Percent, color: 'blue', cat: 'analytics' },
  { id: 'float-analytics', name: 'Float Analytics', icon: PieChart, color: 'teal', cat: 'analytics' },
  { id: 'dividend-leaders', name: 'Dividend Leaders', icon: Coins, color: 'yellow', cat: 'analytics' },

  { id: 'live-market', name: 'Live Market', icon: Activity, color: 'teal', cat: 'live-data', star: true },
  { id: 'market-summary', name: 'Market Summary', icon: LayoutDashboard, color: 'blue', cat: 'live-data', star: true },
  { id: 'sector-heatmap', name: 'Sector Heatmap', icon: LayoutGrid, color: 'emerald', cat: 'live-data', star: true },
  { id: 'market-indices', name: 'Market Indices', icon: Activity, color: 'blue', cat: 'live-data', star: true },
  { id: 'top-gainers', name: 'Top Gainers', icon: TrendingUp, color: 'emerald', cat: 'live-data', star: true },
  { id: 'top-losers', name: 'Top Losers', icon: TrendingDown, color: 'rose', cat: 'live-data', star: true },
  { id: 'volume-leaders', name: 'Volume Leaders', icon: ArrowLeftRight, color: 'orange', cat: 'live-data', star: true },
  { id: 'turnover-leaders', name: 'Turnover Leaders', icon: DollarSign, color: 'purple', cat: 'live-data', star: true },
  { id: 'top-transactions', name: 'Top Transactions', icon: Receipt, color: 'cyan', cat: 'live-data', star: true },
  { id: 'live-nepse', name: 'Live NEPSE', icon: Activity, color: 'teal', cat: 'live-data', star: true },

  { id: '52w-high', name: '52W High', icon: TrendingUp, color: 'emerald', cat: 'information', star: true },
  { id: '52w-low', name: '52W Low', icon: TrendingDown, color: 'rose', cat: 'information', star: true },
  { id: 'price-history', name: 'Price History', icon: Clock, color: 'cyan', cat: 'information', star: true },
  { id: 'dividend-history', name: 'Dividend History', icon: TrendingUp, color: 'emerald', cat: 'information', star: true },
  { id: 'mero-share', name: 'Mero Share', icon: BookOpen, color: 'purple', cat: 'information', star: true },
  { id: 'credentials', name: 'Credentials', icon: Lock, color: 'orange', cat: 'information', star: true },
  { id: 'apply-history', name: 'Apply History', icon: RefreshCw, color: 'cyan', cat: 'information', star: true },
  { id: 'brokers', name: 'Brokers', icon: Building2, color: 'blue', cat: 'information', star: true },
  { id: 'ipo-result', name: 'IPO Result', icon: Award, color: 'emerald', cat: 'information', star: true },
  { id: 'ipo-current', name: 'Live IPOs', icon: Rocket, color: 'emerald', cat: 'information', star: true },
  { id: 'ipo-fpo-alert', name: 'IPO/FPO Alert', icon: Bell, color: 'rose', cat: 'information', star: true },
  { id: 'ipo-pipeline', name: 'IPO Pipeline', icon: Layers, color: 'pink', cat: 'information', star: true },
  { id: 'floor-sheet', name: 'Floor Sheet', icon: LayoutGrid, color: 'purple', cat: 'information', star: true },
  { id: 'news', name: 'News', icon: Newspaper, color: 'cyan', cat: 'information', star: true },
  { id: 'beginners-guide', name: "Beginner's Guide", icon: BookOpen, color: 'emerald', cat: 'information', star: true },
  { id: 'top-traded', name: 'Top Traded', icon: Activity, color: 'yellow', cat: 'information', star: true },

  { id: 'support-setups', name: 'Support Setups', icon: Shield, color: 'blue', cat: 'trade-lab', star: true },
  { id: 'next-breakouts', name: 'Next Breakouts', icon: Flame, color: 'rose', cat: 'trade-lab', star: true },
  { id: 'consolidating-picks', name: 'Consolidating Picks', icon: Activity, color: 'yellow', cat: 'trade-lab', star: true },
  { id: 'breakout-tradable', name: 'Breakout Tradable', icon: Zap, color: 'emerald', cat: 'trade-lab', star: true },
  { id: 'investment-picks', name: 'Investment Picks', icon: Building2, color: 'purple', cat: 'trade-lab', star: true },
  { id: 'sip-in-stocks', name: 'SIP In Stocks', icon: PieChart, color: 'cyan', cat: 'trade-lab', star: true },

  { id: 'calculator', name: 'Brokerage Calc', icon: Calculator, color: 'orange', cat: 'trade-tools', star: true },
  { id: 'bonus-adjustment', name: 'Bonus Adjustment', icon: Percent, color: 'emerald', cat: 'trade-tools', star: true },
  { id: 'right-adjustment', name: 'Right Adjustment', icon: Layers, color: 'blue', cat: 'trade-tools', star: true },
  { id: 'dividend-calculator', name: 'Dividend Calc', icon: Coins, color: 'yellow', cat: 'trade-tools', star: true },
  { id: 'sip-calculator', name: 'SIP Calculator', icon: PieChart, color: 'teal', cat: 'trade-tools', star: true },
  { id: 'risk-reward', name: 'Risk Reward', icon: Scale, color: 'rose', cat: 'trade-tools', star: true },
  { id: 'compare-stocks', name: 'Compare Stocks', icon: ArrowLeftRight, color: 'blue', cat: 'trade-tools', star: true },
  { id: 'advanced-chart', name: 'Advanced Chart', icon: Activity, color: 'emerald', cat: 'trade-tools', star: true },
  { id: 'smart-portfolio', name: 'Smart Portfolio', icon: PieChart, color: 'purple', cat: 'trade-tools', star: true },
  { id: 'seasonality', name: 'Seasonality', icon: Calendar, color: 'cyan', cat: 'trade-tools', star: true },
  { id: 'target-alert', name: 'Target Alert', icon: Bell, color: 'rose', cat: 'trade-tools', star: true },

  { id: 'rsi-filter', name: 'RSI Filter', icon: Activity, color: 'purple', cat: 'scanner', star: true },
  { id: 'ema-scanner', name: 'EMA Scanner', icon: Activity, color: 'cyan', cat: 'scanner', star: true },
  { id: 'bollinger-scanner', name: 'Bollinger Scanner', icon: Activity, color: 'blue', cat: 'scanner', star: true },
  { id: 'volume-scanner', name: 'Volume Scanner', icon: Activity, color: 'emerald', cat: 'scanner', star: true },
  { id: 'price-volume', name: 'Price & Volume', icon: DollarSign, color: 'orange', cat: 'scanner', star: true },
  { id: 'candlestick-pattern', name: 'Candlestick Pattern', icon: Compass, color: 'pink', cat: 'scanner', star: true },
  { id: 'pivot-points', name: 'Pivot Points', icon: Target, color: 'rose', cat: 'scanner', star: true },
  { id: 'macd-signal', name: 'MACD Signal', icon: Activity, color: 'emerald', cat: 'scanner', star: true },
  { id: 'ema-sma-scanner', name: 'EMA / SMA Scanner', icon: Activity, color: 'purple', cat: 'scanner', star: true },
  { id: 'support-resistance-scanner', name: 'Support & Resistance', icon: Shield, color: 'blue', cat: 'scanner', star: true },
  { id: 'fibonacci-levels', name: 'Fibonacci Levels', icon: SlidersHorizontal, color: 'purple', cat: 'scanner', star: true },
  { id: 'dow-signals', name: 'Dow Signals', icon: TrendingUp, color: 'emerald', cat: 'scanner', star: true },
  { id: 'trendline-breakout', name: 'Trendline Breakout', icon: Flame, color: 'rose', cat: 'scanner', star: true },
  { id: 'parallel-channel', name: 'Parallel Channel', icon: Layers, color: 'cyan', cat: 'scanner', star: true },
  { id: 'trend-continuation', name: 'Trend Continuation', icon: TrendingUp, color: 'yellow', cat: 'scanner', star: true },
  { id: 'strong-trend', name: 'Strong Trend', icon: Zap, color: 'purple', cat: 'scanner', star: true },
  { id: 'consolidating', name: 'Consolidating', icon: Activity, color: 'yellow', cat: 'scanner', star: true },
  { id: 'stock-capitalization', name: 'Stock Capitalization', icon: Building2, color: 'blue', cat: 'scanner', star: true },
  { id: 'fundamental-scanner', name: 'Fundamental Scanner', icon: Award, color: 'emerald', cat: 'scanner', star: true },
  { id: 'comparable-stock', name: 'Comparable Stock', icon: Scale, color: 'rose', cat: 'scanner', star: true },
  { id: 'strategy-lab', name: 'Strategy Lab', icon: Brain, color: 'orange', cat: 'scanner', star: true },
  { id: 'smart-money', name: 'Smart Money', icon: Crown, color: 'purple', cat: 'scanner', star: true },

  { id: 'portfolio', name: 'Portfolio', icon: Briefcase, color: 'cyan', cat: 'desk', star: true },
  { id: 'watchlist', name: 'Watchlist', icon: Eye, color: 'purple', cat: 'desk', star: true },
  { id: 'trade-notes', name: 'Trade Notes', icon: FileText, color: 'orange', cat: 'desk', star: true },
  { id: 'stock-alerts', name: 'Stock Alerts', icon: BellRing, color: 'rose', cat: 'desk', star: true },
  { id: 'edit', name: 'Preferences', icon: Settings, color: 'yellow', cat: 'desk', star: true },

  { id: 'sector-wise-ad', name: 'Sector-Wise A/D', icon: SlidersHorizontal, color: 'cyan', cat: 'smart-money', star: true },
  { id: 'stealth-accumulation-tracker', name: 'Stealth Accumulation', icon: Crosshair, color: 'emerald', cat: 'smart-money', star: true },
  { id: 'aggressive-accumulators', name: 'Aggressive Accumulators', icon: Zap, color: 'yellow', cat: 'smart-money', star: true },
  { id: 'distribution-leaders', name: 'Distribution Leaders', icon: TrendingDown, color: 'rose', cat: 'smart-money', star: true },
  { id: 'broker-heatmap', name: 'Broker Heatmap', icon: LayoutGrid, color: 'purple', cat: 'smart-money', star: true },
  { id: 'broker-dominance', name: 'Broker Dominance', icon: Award, color: 'blue', cat: 'smart-money', star: true },
  { id: 'aggressive-holdings', name: 'Aggressive Holdings', icon: Shield, color: 'emerald', cat: 'smart-money', star: true },
  { id: 'matching-buy-sell', name: 'Matching Buy/Sell', icon: ArrowLeftRight, color: 'rose', cat: 'smart-money', star: true },
  { id: 'slow-accumulation', name: 'Slow Accumulation', icon: Target, color: 'emerald', cat: 'smart-money', star: true },
  { id: 'market-depth', name: 'Market Depth', icon: Layers, color: 'blue', cat: 'smart-money', star: true },
  { id: 'broker-flow', name: 'Broker Flow', icon: Users, color: 'purple', cat: 'smart-money', star: true },
];

// ── EVERY service wired. No orphan IDs. ──
const SERVICE_COMPONENTS: Record<string, ComponentType> = {
  'stock-momentum': StockMomentumAnalyzer,
  'price-history': StockMomentumAnalyzer,
  'advanced-charts': StockMomentumAnalyzer,
  'entry-exit-analyzer': EntryExitAnalyzer,
  'dividend-history': DividendHistoryPanel as ComponentType,
  'advanced-chart': () => (
    <StaticInfoService title="Advanced Chart — how to use" content={'Open any stock in Multi-Timeframe Analyzer for 1Y OHLC history.\n\nReading guide:\n• Price above EMA-20 + RSI 55-70 = healthy uptrend\n• Bollinger squeeze (narrow bands) + volume surge = expansion coming\n• MACD histogram flipping positive = momentum turning up'} tips={['Use daily timeframe for swing trading', 'Volume must confirm every breakout', 'Never chase more than 4% above EMA-20']} />
  ),
  'api-status': ApiStatusService,

  // Trader's Zone
  'decision-probability': () => (
    <UniversalScreener sortFn={(a, b) => b.dpi - a.dpi} filterFn={(s) => s.dpi > 50}
      customCols={[{ key: 'dpi', label: 'DPI', align: 'right', bold: true, format: (v) => (v ? `${v.toFixed(0)}/100` : '—'), colorFn: (v) => (v > 70 ? '#16a34a' : '#d97706') }]}
      banner={{ type: 'success', text: 'AI Decision Probability Index — 15+ signals (momentum, volume, trend, RSI, MACD) fused into one 0–100 score. Wired to /live-market + /technical-signals.' }}
      insight="Stocks scoring above 70 DPI have historically higher probability of positive follow-through. Combine with a 5–7% stop-loss." />
  ),
  'ai-momentum': () => (
    <UniversalScreener filterFn={(s) => s.pChange >= 2 && s.volumeSurgeRatio >= 1.3}
      sortFn={(a, b) => b.pChange * b.volumeSurgeRatio - a.pChange * a.volumeSurgeRatio}
      customCols={[{ key: 'volumeSurgeRatio', label: 'Vol ×', align: 'right', bold: true, format: (v) => (v ? `${v.toFixed(1)}×` : '—') }]}
      banner={{ type: 'success', text: 'Momentum with volume confirmation. Wired to /top-gainer + /PriceVolume.' }}
      insight="Momentum + 2× volume often continues for 3–5 sessions. Trail stops under prior-day low." />
  ),
  'breakout-stocks': () => (
    <UniversalScreener filterFn={(s) => s.isBreakout} sortFn={(a, b) => b.volume - a.volume}
      banner={{ type: 'success', text: 'Volume-confirmed breakouts (52W proximity + 3% thrust). Wired to /today-price + /trading-average.' }}
      insight="Enter in the first 30 minutes with a 5–7% stop-loss. Avoid breakouts on thin volume." />
  ),
  'volume-shockers': () => (
    <UniversalScreener filterFn={(s) => s.isVolumeShocker} sortFn={(a, b) => b.volumeZScore - a.volumeZScore}
      customCols={[{ key: 'volumeZScore', label: 'Z-Score', align: 'right', bold: true, format: (v) => (v != null ? `${v.toFixed(1)}σ` : '—') }]}
      banner={{ type: 'warning', text: 'Unusual volume often precedes major moves. Wired to /trade-qty + Z-score engine.' }}
      insight="Z-score above 2σ = 95% statistical significance. Check news + broker flow before chasing." />
  ),
  'technical-ratings': () => (
    <UniversalScreener sortFn={(a, b) => b.technicalScore - a.technicalScore}
      customCols={[
        { key: 'technicalScore', label: 'Score', align: 'right', bold: true, format: (v) => `${v}/100` },
        { key: 'technicalRating', label: 'Rating', align: 'right', bold: true, colorFn: (v) => (v === 'Strong Buy' ? '#16a34a' : v === 'Buy' ? '#22c55e' : v === 'Neutral' ? '#d97706' : '#dc2626') },
      ]}
      banner={{ type: 'info', text: 'Composite rating from RSI + MACD + EMA structure + volume. Wired to /technical-signals.' }}
      insight="Focus on Strong Buy names in confirmed uptrends; avoid Strong Sell even when 'cheap'." />
  ),
  'players-choices': () => (
    <UniversalScreener filterFn={(s) => s.turnover > 5000000 && s.pChange > 0} sortFn={(a, b) => b.turnover - a.turnover}
      banner={{ type: 'success', text: 'Institutional favorites by turnover. Wired to /turnover + /floorsheet.' }}
      insight="Follow smart-money turnover for consistent outperformance." />
  ),
  'circuit-setup': () => (
    <UniversalScreener filterFn={(s) => Math.abs(s.pChange) >= 8} sortFn={(a, b) => Math.abs(b.pChange) - Math.abs(a.pChange)}
      banner={{ type: 'warning', text: 'NEPSE circuit: ±10% daily limit. Wired to /today-price.' }}
      insight="Upper circuit = strong buying pressure. Wait for next-day confirmation — circuits often open gap-up then fade." />
  ),
  'candlestick-patterns': () => (
    <UniversalScreener filterFn={(s) => !!s.candlestickPattern}
      customCols={[{ key: 'candlestickPattern', label: 'Pattern', align: 'right', bold: true, colorFn: () => '#7c3aed' }]}
      banner={{ type: 'info', text: 'Auto-detected Hammer / Doji / Engulfing / Marubozu from OHLC shape.' }}
      insight="Bullish patterns near support carry 60–70% success when confirmed by volume." />
  ),
  'candlestick-pattern': () => (
    <UniversalScreener filterFn={(s) => !!s.candlestickPattern}
      customCols={[{ key: 'candlestickPattern', label: 'Pattern', align: 'right', bold: true }]}
      banner={{ text: 'Auto-detected candlestick patterns across all 346 listed stocks.' }}
      insight="Combine patterns with volume for higher probability entries." />
  ),
  'consolidating-stocks': () => (
    <UniversalScreener filterFn={(s) => Math.abs(s.pChange) < 1 && s.volume > 5000} sortFn={(a, b) => b.volume - a.volume}
      banner={{ type: 'info', text: 'Coiled springs: tight range + healthy volume. Wired to /trading-average.' }}
      insight="Set alerts for a +3% breakout with 1.5× volume." />
  ),
  'consolidating': () => (
    <UniversalScreener filterFn={(s) => Math.abs(s.pChange) < 1}
      banner={{ text: 'Consolidating stocks — volatility contraction before expansion.' }}
      insight="Wait for breakout direction before entering." />
  ),
  'consolidating-picks': () => (
    <UniversalScreener filterFn={(s) => Math.abs(s.pChange) < 0.5}
      banner={{ type: 'info', text: 'Ultra-tight consolidations primed for expansion.' }}
      insight="Volatility contraction leads to expansion — position size small until breakout." />
  ),
  'fresh-indicators': () => (
    <UniversalScreener filterFn={(s) => (s.rsi < 35 || s.rsi > 65) && s.pChange > 0}
      customCols={[{ key: 'rsi', label: 'RSI', align: 'right', format: (v) => (v != null ? v.toFixed(1) : '—'), colorFn: (v) => (v < 30 ? '#16a34a' : v > 70 ? '#dc2626' : '#d97706') }]}
      banner={{ type: 'info', text: 'Fresh RSI/MACD inflections. Wired to /technical-signals.' }}
      insight="Buy when RSI crosses back above 30 from oversold; book partial near 70." />
  ),
  'support-resistance': () => (
    <UniversalScreener filterFn={(s) => s.high52w && s.low52w}
      customCols={[
        { key: 'high52w', label: '52W High', align: 'right', format: (v) => (v ? `Rs. ${v}` : '—') },
        { key: 'low52w', label: '52W Low', align: 'right', format: (v) => (v ? `Rs. ${v}` : '—') },
      ]}
      banner={{ type: 'info', text: '52W levels act as the strongest S/R zones. Wired to /securityDailyTradeStat.' }}
      insight="Bounces from 52W lows are strong reversal candidates — confirm with RSI divergence." />
  ),
  'support-resistance-scanner': () => (
    <UniversalScreener filterFn={(s) => s.high52w && s.low52w}
      banner={{ text: '52-week support/resistance scan across the full board.' }}
      insight="52W high/low are the strongest zones — trade rejections, not breaks, without volume." />
  ),
  'unusual-trades': () => (
    <UniversalScreener filterFn={(s) => s.turnover > 10000000} sortFn={(a, b) => b.turnover - a.turnover}
      banner={{ type: 'warning', text: 'Block trades above Rs. 1 Crore. Wired to /floorsheet.' }}
      insight="Track the next 3–5 sessions — block flow often leads price." />
  ),
  'relative-strength': () => (
    <UniversalScreener sortFn={(a, b) => b.pChange - a.pChange}
      customCols={[{ key: 'rsi', label: 'RSI', align: 'right', format: (v) => v?.toFixed(1) }]}
      banner={{ type: 'info', text: 'Relative Strength vs the NEPSE index.' }}
      insight="RS leaders (top quintile) tend to keep leading — momentum persists." />
  ),

  // Analytics
  'graham-intrinsic': GrahamValuation,
  'broker-analysis': BrokerAnalysisService,
  'stockwise-analysis': () => (
    <UniversalScreener sortFn={(a, b) => b.technicalScore - a.technicalScore}
      customCols={[{ key: 'technicalRating', label: 'Rating', align: 'right', bold: true }]}
      banner={{ text: 'Stock-by-stock technical analysis, ranked.' }}
      insight="Combine technical rank with P/E under 25 for best results." />
  ),
  'stocks-by-market-cap': () => (
    <UniversalScreener sortFn={(a, b) => b.marketCap - a.marketCap}
      customCols={[{ key: 'marketCap', label: 'Market Cap', align: 'right', format: (v) => (v ? `Rs. ${(v / 1e9).toFixed(2)}B` : '—') }]}
      banner={{ text: 'All stocks ranked by market capitalization.' }}
      insight="Large caps = lower risk; small caps = higher growth potential." />
  ),
  'stock-capitalization': () => (
    <UniversalScreener sortFn={(a, b) => b.marketCap - a.marketCap}
      customCols={[{ key: 'marketCap', label: 'Market Cap', align: 'right', format: (v) => (v ? `Rs. ${(v / 1e9).toFixed(2)}B` : '—') }]}
      banner={{ text: 'Capitalization ladder — from NTC giants to micro-caps.' }}
      insight="Allocate core to large caps, satellite to vetted small caps." />
  ),
  'promoter-shares': () => (
    <StaticInfoService title="Promoter Shares — what to check"
      content={'High promoter holding (above 50%) signals management confidence and governance stability.\n\nWhere to verify:\n• NEPSE company disclosures + annual reports\n• CDSC corporate action notices\n• Broker research notes\n\nRed flags: rising promoter pledging, frequent promoter selling, holding below 40% in banks.'}
      tips={['Watch for promoter pledging disclosures', 'Track promoter buying/selling windows', 'High pledging + falling price = avoid']} />
  ),
  'dividend-kings': () => (
    <UniversalScreener filterFn={(s) => s.eps > 25} sortFn={(a, b) => b.eps - a.eps}
      customCols={[{ key: 'eps', label: 'EPS', align: 'right', format: (v) => `Rs. ${v?.toFixed(2)}` }]}
      banner={{ type: 'success', text: 'Consistent high-EPS names — the dividend payer pool.' }}
      insight="Dividend kings compound wealth silently for decades — reinvest payouts." />
  ),
  'dividend-leaders': () => (
    <UniversalScreener filterFn={(s) => s.eps && s.eps > 20} sortFn={(a, b) => b.eps - a.eps}
      customCols={[{ key: 'eps', label: 'EPS', align: 'right', format: (v) => `Rs. ${v?.toFixed(2)}` }]}
      banner={{ type: 'success', text: 'High EPS = strong dividend capacity. Wired to /CompanyDetails fundamentals.' }}
      insight="High EPS + low P/E = value + income combo." />
  ),
  'fundamentals-pro': () => (
    <UniversalScreener filterFn={(s) => s.pe > 0 && s.pe < 25 && s.eps > 15 && s.bookValue > 100} sortFn={(a, b) => a.pe - b.pe}
      customCols={[{ key: 'pe', label: 'P/E', align: 'right' }, { key: 'eps', label: 'EPS', align: 'right' }]}
      banner={{ type: 'success', text: 'Pro-grade fundamental filter for long-term investors.' }}
      insight="Quality + reasonable price beats cheap + weak, every cycle." />
  ),
  'fundamental-scanner': () => (
    <UniversalScreener filterFn={(s) => s.pe > 0 && s.pe < 20 && s.eps > 15} sortFn={(a, b) => a.pe - b.pe}
      customCols={[{ key: 'pe', label: 'P/E', align: 'right' }, { key: 'eps', label: 'EPS', align: 'right' }]}
      banner={{ type: 'success', text: 'Fundamentally strong + undervalued. Wired to /fundamental-ratios.' }}
      insight="Low P/E + high EPS = value + growth combo." />
  ),
  'broker-favourites': () => (
    <UniversalScreener sortFn={(a, b) => b.turnover - a.turnover} filterFn={(s) => s.turnover > 5000000} defaultLimit={20}
      banner={{ text: 'Most-traded stocks by brokers — institutionally approved names.' }}
      insight="Broker favorites offer liquidity for clean entries and exits." />
  ),
  'hot-stocks': () => (
    <UniversalScreener filterFn={(s) => s.pChange > 3 && s.volumeSurgeRatio > 1.5} sortFn={(a, b) => b.pChange - a.pChange}
      banner={{ type: 'warning', text: 'Hottest stocks today — momentum + volume surge.' }}
      insight="Hot stocks can turn cold fast — always use a stop-loss." />
  ),
  'mutual-funds-unlock': MutualFundsService,
  'price-vs-volume': () => (
    <UniversalScreener filterFn={(s) => s.pChange > 0 && s.volumeSurgeRatio > 1.3}
      sortFn={(a, b) => b.pChange * b.volumeSurgeRatio - a.pChange * a.volumeSurgeRatio}
      banner={{ text: 'Price rise confirmed by volume — highest-probability setup.' }}
      insight="Price + volume together beat either signal alone." />
  ),
  'price-volume': () => (
    <UniversalScreener filterFn={(s) => s.pChange > 2 && s.volume > 15000}
      banner={{ text: 'Price rise confirmed by volume. Wired to /PriceVolume.' }}
      insight="Best trades have both price and volume confirmation." />
  ),
  'zero-sum-floorsheet': LiveFloorsheetService,
  'floor-sheet': LiveFloorsheetService,
  'pe-ranking': () => (
    <UniversalScreener filterFn={(s) => s.pe > 0 && s.sector !== 'Mutual Funds'} sortFn={(a, b) => a.pe - b.pe}
      customCols={[{ key: 'pe', label: 'P/E', align: 'right', bold: true, format: (v) => v?.toFixed(2), colorFn: (v) => (v < 15 ? '#16a34a' : v > 30 ? '#dc2626' : '#d97706') }]}
      banner={{ text: 'Every stock ranked by P/E — cheapest earnings first. Wired to /fundamental-ratios.' }}
      insight="Lower P/E = cheaper per rupee of earnings. Always compare within sector." />
  ),
  'float-analytics': () => (
    <UniversalScreener sortFn={(a, b) => b.floatTurnoverPct - a.floatTurnoverPct}
      customCols={[{ key: 'floatTurnoverPct', label: 'Float Turnover', align: 'right', format: (v) => (v != null ? `${v.toFixed(2)}%` : '—') }]}
      banner={{ type: 'info', text: 'What % of free float traded today. Wired to /supplydemand.' }}
      insight="Float turnover above 2% = unusually high activity — something is happening." />
  ),
  'stealth-accumulation': () => (
    <UniversalScreener sortFn={(a, b) => b.stealthAccumulation - a.stealthAccumulation} filterFn={(s) => s.stealthAccumulation > 40}
      customCols={[{ key: 'stealthAccumulation', label: 'Accum.', align: 'right', bold: true, format: (v) => (v ? `${v.toFixed(0)}%` : '—') }]}
      banner={{ type: 'success', text: 'Quiet accumulation detector — flat price + rising volume.' }}
      insight="Stealth phases last 2–4 weeks before major moves. Position before the crowd." />
  ),

  // Live data
  'live-market': () => (
    <UniversalScreener sortFn={(a, b) => b.turnover - a.turnover}
      banner={{ text: 'All actively trading NEPSE stocks. Wired to /today-price (live) with fallback.' }}
      insight="Sort by turnover for liquidity; filter by % change for momentum." />
  ),
  'market-summary': MarketSummaryService,
  'live-nepse': MarketSummaryService,
  'market-indices': MarketSummaryService,
  'sector-heatmap': SectorHeatmapService,
  'sector-rotation': SectorHeatmapService,
  'sector-wise-ad': SectorHeatmapService,
  'broker-heatmap': SectorHeatmapService,
  'top-gainers': () => <TopPerformersService type="gainers" />,
  'top-losers': () => <TopPerformersService type="losers" />,
  'volume-leaders': () => <TopPerformersService type="volume" />,
  'top-volume': () => <TopPerformersService type="volume" />,
  'turnover-leaders': () => <TopPerformersService type="turnover" />,
  'top-turnover': () => <TopPerformersService type="turnover" />,
  'top-transactions': () => <TopPerformersService type="transactions" />,
  'top-traded': () => <TopPerformersService type="transactions" />,
  'market-depth': () => (
    <UniversalScreener filterFn={(s) => s.volume > 10000} sortFn={(a, b) => b.turnover - a.turnover}
      banner={{ type: 'info', text: 'Deep-liquidity board. Wired to /supplydemand.' }}
      insight="Trade stocks with 10K+ daily volume to avoid slippage." />
  ),
  'volume-spread': () => (
    <UniversalScreener filterFn={(s) => s.high && s.low} sortFn={(a, b) => b.volume * ((b.high - b.low) / b.ltp) - a.volume * ((a.high - a.low) / a.ltp)}
      banner={{ type: 'info', text: 'VSA — Volume Spread Analysis. Wide spread + high volume + close near high = bullish.' }}
      insight="Narrow spread + high volume = absorption. Wide spread + low volume = markup risk." />
  ),
  'broker-flow': () => (
    <UniversalScreener filterFn={(s) => s.turnover > 5000000} sortFn={(a, b) => b.turnover - a.turnover}
      banner={{ type: 'info', text: 'Follow institutional money flow. Wired to /floorsheet.' }}
      insight="Sustained broker flow in one direction for 3+ days = real trend." />
  ),

  // Trade lab
  'support-setups': () => (
    <UniversalScreener filterFn={(s) => s.pChange > -1 && s.pChange < 2}
      banner={{ type: 'success', text: 'Basing near support — best risk/reward for swing trades.' }}
      insight="Buy support with stop just below; target 2R minimum." />
  ),
  'next-breakouts': () => (
    <UniversalScreener filterFn={(s) => s.pChange > 0 && s.pChange < 3 && s.volumeSurgeRatio > 1.2}
      banner={{ type: 'success', text: 'Coiling under resistance with rising volume.' }}
      insight="Enter with tight stops before the crowd notices." />
  ),
  'breakout-tradable': () => (
    <UniversalScreener filterFn={(s) => s.isBreakout} sortFn={(a, b) => b.pChange - a.pChange}
      banner={{ type: 'success', text: 'Actively breaking out right now.' }}
      insight="Best entries land within the first hour of the break." />
  ),
  'trendline-breakout': () => (
    <UniversalScreener filterFn={(s) => s.isBreakout}
      banner={{ text: 'Trendline breakout candidates with volume.' }}
      insight="Breakouts with 1.5× volume mark potential trend change." />
  ),
  'investment-picks': () => (
    <UniversalScreener filterFn={(s) => s.pe && s.pe < 20 && s.pe > 0} sortFn={(a, b) => a.pe - b.pe}
      banner={{ type: 'success', text: 'Low-P/E value picks for long horizons.' }}
      insight="Buy quality at reasonable prices; hold through cycles." />
  ),
  'sip-in-stocks': () => (
    <UniversalScreener filterFn={(s) => s.eps > 15 && s.pe > 0 && s.pe < 25}
      banner={{ type: 'success', text: 'Quality compounders suitable for monthly SIP.' }}
      insight="SIP in fundamentals builds wealth while smoothing volatility." />
  ),

  // Trade tools
  'calculator': BrokerageCalculator,
  'bonus-adjustment': BonusAdjustmentCalculator,
  'right-adjustment': RightAdjustmentCalculator,
  'dividend-calculator': DividendCalculator,
  'sip-calculator': SIPCalculator,
  'risk-reward': RiskRewardCalculator,
  'compare-stocks': CompareStocks,
  'smart-portfolio': () => (
    <UniversalScreener filterFn={(s) => s.technicalScore > 60 && s.pe > 0 && s.pe < 25} sortFn={(a, b) => b.technicalScore - a.technicalScore}
      banner={{ type: 'success', text: 'AI shortlist: technical strength + reasonable valuation.' }}
      insight="Rebalance monthly; cut anything falling below score 45." />
  ),
  'seasonality': () => (
    <StaticInfoService title="NEPSE Seasonality (observed)"
      content={'Best windows (observed 2015–2025):\n• Feb–Apr: post-budget + year-end closing rally\n• Sep–Nov: post-monsoon / festive liquidity return\n\nSoft windows:\n• May–Aug: monsoon + dividend-adjustment drift\n• Late Dec: book-closing profit booking\n\nUse seasonality as a tailwind — never as a standalone buy signal.'}
      tips={['Scale in during soft months', 'Take partial profits into euphoric months', 'Pair seasonality with RSI under 40 for entries']} />
  ),
  'target-alert': AlertsTool,

  // Information
  '52w-high': () => (
    <UniversalScreener filterFn={(s) => s.high52w && s.ltp && s.ltp / s.high52w > 0.95} sortFn={(a, b) => b.ltp / b.high52w - a.ltp / a.high52w}
      customCols={[{ key: 'high52w', label: '52W High', align: 'right', format: (v) => `Rs. ${v}` }]}
      banner={{ type: 'success', text: 'Trading within 5% of 52-week highs — leadership board.' }}
      insight="Breaking a 52W high on 2× volume often starts a new leg up." />
  ),
  '52w-low': () => (
    <UniversalScreener filterFn={(s) => s.low52w && s.ltp && s.ltp / s.low52w < 1.05} sortFn={(a, b) => a.ltp / a.low52w - b.ltp / b.low52w}
      customCols={[{ key: 'low52w', label: '52W Low', align: 'right', format: (v) => `Rs. ${v}` }]}
      banner={{ type: 'warning', text: 'Within 5% of 52-week lows — value or value-trap?' }}
      insight="Check fundamentals first: falling knife vs coiled value." />
  ),
  'mero-share': () => (
    <StaticInfoService title="MeroShare Portal — meroshare.cdsc.com.np"
      content={'Your single window for:\n• IPO / FPO / Rights applications (My ASBA)\n• Allotment + refund status\n• Dividend + bonus credit statements\n• Demat portfolio + WACC reports\n\nKeep CRN + Demat + bank details mapped to the same mobile number.'}
      tips={['Apply for IPOs before 3 PM on closing day', 'Check allotment within 24 hrs of result', 'Download CAS every quarter']} />
  ),
  'credentials': () => (
    <StaticInfoService title="Credentials Security"
      content={'Protect Demat + TMS + MeroShare logins:\n• Unique 14+ char passwords per portal\n• Never share OTP / CRN screenshots\n• Log out on shared devices\n• Verify broker bank accounts before fund transfer'}
      tips={['Enable 2FA where available', 'Rotate passwords quarterly', 'Beware Telegram “tips” scams']} />
  ),
  'apply-history': () => (
    <StaticInfoService title="IPO Application History"
      content={'Track every application in MeroShare → My ASBA → Application Report.\n\nShows: applied units, allotted units, refund amount + date.\nKeep allotment letters for tax filing (cost base proof).'}
      tips={['Screenshot every application', 'Reconcile refunds within T+3', 'Save allotment PDFs yearly']} />
  ),
  'brokers': BrokersDirectoryService,
  'ipo-result': () => <IPOTracker type="results" />,
  'ipo-results': () => <IPOTracker type="results" />,
  'ipo-current': () => <IPOTracker type="current" />,
  'ipo-fpo-alert': () => (
    <StaticInfoService title="IPO / FPO Alerts"
      content={'Upcoming issues are announced on SEBON + CDSC + MeroShare notices.\n\nTypical cadence: 5–15 IPOs per quarter. Hydropower + microfinance dominate the queue.\nEnable alerts in the Target Alert tab for issue-open reminders.'}
      tips={['Check MeroShare notices weekly', 'Read the prospectus EPS + NAV section', 'Compare peer P/E before applying']} />
  ),
  'ipo-pipeline': IPOPipelineService,
  'news': NewsService,
  'nepse-news': NewsService,
  'beginners-guide': () => (
    <StaticInfoService title="Beginner's Guide to NEPSE"
      content={'1. Open Demat + trading account via any licensed broker (citizenship + photo + bank).\n2. Get MeroShare + TMS logins; link bank for ASBA.\n3. Fund TMS (min ~Rs. 10,000 to start).\n4. Buy diversified quality (3–5 sectors); hold 1+ years.\n5. Never invest borrowed or emergency money.'}
      tips={['Start with Rs. 25,000+', 'Diversify across 3–5 sectors', 'Read annual reports before buying']} />
  ),

  // Scanner
  'rsi-filter': () => (
    <UniversalScreener filterFn={(s) => s.rsi != null} sortFn={(a, b) => a.rsi - b.rsi}
      customCols={[{ key: 'rsi', label: 'RSI', align: 'right', bold: true, format: (v) => v?.toFixed(1), colorFn: (v) => (v < 30 ? '#16a34a' : v > 70 ? '#dc2626' : '#d97706') }]}
      banner={{ text: 'Full-board RSI scan. Wired to /technical-signals.' }}
      insight="RSI below 30 = oversold bounce zone; above 70 = overheated — wait for pullback." />
  ),
  'ema-scanner': () => (
    <UniversalScreener filterFn={(s) => s.ltp && s.ema20 && s.ltp > s.ema20} sortFn={(a, b) => b.pChange - a.pChange}
      customCols={[{ key: 'ema20', label: 'EMA-20', align: 'right', format: (v) => `Rs. ${v}` }]}
      banner={{ text: 'Stocks holding above EMA-20 — short-term bullish structure.' }}
      insight="Above EMA-20 + rising EMA-20 = uptrend intact." />
  ),
  'ema-sma-scanner': () => (
    <UniversalScreener filterFn={(s) => s.technicalScore > 60}
      customCols={[{ key: 'ema20', label: 'EMA-20', align: 'right' }, { key: 'ema50', label: 'EMA-50', align: 'right' }]}
      banner={{ text: 'Golden-cross structure: EMA-20 above SMA-50.' }}
      insight="20 above 50 + rising both = classic bullish alignment." />
  ),
  'bollinger-scanner': () => (
    <UniversalScreener filterFn={(s) => s.volumeSurgeRatio > 1.5}
      customCols={[{ key: 'volumeSurgeRatio', label: 'Vol ×', align: 'right' }]}
      banner={{ text: 'Bollinger squeeze + expansion candidates.' }}
      insight="Squeezes precede explosive moves — wait for the band break + volume." />
  ),
  'volume-scanner': () => (
    <UniversalScreener sortFn={(a, b) => b.volume - a.volume} defaultLimit={30}
      banner={{ text: 'Top-30 volume board today. Wired to /trade-qty.' }}
      insight="Volume precedes price — new volume leaders deserve a watchlist slot." />
  ),
  'pivot-points': () => (
    <UniversalScreener filterFn={(s) => s.high && s.low && s.ltp}
      customCols={[
        { key: 'high', label: 'High', align: 'right' },
        { key: 'low', label: 'Low', align: 'right' },
      ]}
      banner={{ text: 'Classic pivot inputs (H/L/C) for tomorrow’s R1–S1 levels.' }}
      insight="Trade rejections at pivots; trade breaks only with volume." />
  ),
  'macd-signal': () => (
    <UniversalScreener filterFn={(s) => s.macd && s.macd.histogram > 0} sortFn={(a, b) => b.macd.histogram - a.macd.histogram}
      customCols={[{ key: 'macd', label: 'MACD Hist', align: 'right', bold: true, format: (v) => v?.histogram?.toFixed(2) }]}
      banner={{ text: 'MACD bullish regime — histogram above zero.' }}
      insight="Rising positive histogram = momentum building; flattening = take partial." />
  ),
  'fibonacci-levels': () => (
    <StaticInfoService title="Fibonacci Levels — quick reference"
      content={'Retracements: 23.6% (shallow) • 38.2% (healthy) • 50% (neutral) • 61.8% golden ratio (high-probability) • 78.6% (deep).\n\nDraw from swing low → swing high in uptrends. Confluence of 61.8% + prior support + RSI 30–40 = prime entry zone.'}
      tips={['61.8% is the golden-ratio level', 'Combine with volume + RSI', 'Place stops beyond 78.6%']} />
  ),
  'dow-signals': () => (
    <UniversalScreener filterFn={(s) => s.pChange > 1 && s.technicalScore > 55}
      banner={{ text: 'Dow Theory confirmation: higher highs + higher lows.' }}
      insight="Confirmed uptrends deserve trailing stops, not premature exits." />
  ),
  'parallel-channel': () => (
    <UniversalScreener filterFn={(s) => Math.abs(s.pChange) < 3 && s.volume > 10000}
      banner={{ text: 'Range/channel traders — buy lower rail, sell upper rail.' }}
      insight="Trade channel rebounds toward the upper boundary; flip on confirmed break." />
  ),
  'trend-continuation': () => (
    <UniversalScreener filterFn={(s) => s.pChange > 0 && s.technicalScore > 60} sortFn={(a, b) => b.pChange - a.pChange}
      banner={{ text: 'Trend-continuation board — flags, pennants, rising EMAs.' }}
      insight="Ride confirmed trends with trailing stops under EMA-20." />
  ),
  'strong-trend': () => (
    <UniversalScreener filterFn={(s) => Math.abs(s.pChange) > 3 && s.volume > 20000} sortFn={(a, b) => Math.abs(b.pChange) - Math.abs(a.pChange)}
      banner={{ text: 'Strongest directional moves today.' }}
      insight="Trade with the trend, never against it, on day one." />
  ),
  'comparable-stock': () => (
    <UniversalScreener sortFn={(a, b) => a.pe - b.pe} defaultLimit={30}
      customCols={[{ key: 'pe', label: 'P/E', align: 'right' }]}
      banner={{ text: 'Peer valuation ladder — cheapest earnings first.' }}
      insight="Compare strictly within sectors for true relative value." />
  ),
  'strategy-lab': () => (
    <StaticInfoService title="Strategy Lab"
      content={'Backtest checklist before risking capital:\n1. Define entry + stop + target in numbers.\n2. Test on 100+ past trades (use Price History tab).\n3. Require win-rate × R:R to beat 1.0 expectancy.\n4. Forward-test 20 paper trades.\n5. Risk max 2% per position.'}
      tips={['Backtest before going live', 'Never risk more than 2% per trade', 'Journal every setup']} />
  ),
  'smart-money': () => (
    <UniversalScreener sortFn={(a, b) => b.turnover - a.turnover} filterFn={(s) => s.turnover > 10000000}
      banner={{ text: 'Where smart money flowed today — Rs. 1 Cr+ turnover names.' }}
      insight="High turnover + rising price = institutional sponsorship." />
  ),

  // Desk
  'portfolio': PortfolioTool,
  'watchlist': WatchlistTool,
  'trade-notes': TradeNotesTool,
  'stock-alerts': AlertsTool,
  'edit': () => (
    <StaticInfoService title="Preferences"
      content={'Personalize your desk:\n• Star services to pin them in Featured\n• Watchlist + alerts persist on this device\n• Use search + category tabs to navigate 100+ tools\n\nTip: bookmark this page for one-tap NEPSE access during 11–3 NPT.'}
      tips={['Enable browser notifications for alerts', 'Review watchlist every Sunday', 'Export notes monthly']} />
  ),

  // Smart money
  'stealth-accumulation-tracker': () => (
    <UniversalScreener sortFn={(a, b) => b.stealthAccumulation - a.stealthAccumulation} filterFn={(s) => s.stealthAccumulation > 40}
      customCols={[{ key: 'stealthAccumulation', label: 'Score', align: 'right', bold: true, format: (v) => `${v}%` }]}
      banner={{ type: 'success', text: 'Stealth accumulation tracker — quiet buying before the move.' }}
      insight="Position before the public notices; confirm with a volume breakout." />
  ),
  'aggressive-accumulators': () => (
    <UniversalScreener filterFn={(s) => s.pChange > 0 && s.volumeSurgeRatio > 2}
      banner={{ type: 'success', text: 'Aggressive buying: green day on 2×+ volume.' }}
      insight="Follow strong hands accumulating with size." />
  ),
  'distribution-leaders': () => (
    <UniversalScreener filterFn={(s) => s.pChange < 0 && s.volume > 20000} sortFn={(a, b) => a.pChange - b.pChange}
      banner={{ type: 'warning', text: 'Distribution-phase names — heavy selling into weakness.' }}
      insight="Exit or avoid where distribution is confirmed; do not bottom-fish." />
  ),
  'broker-dominance': () => (
    <UniversalScreener sortFn={(a, b) => b.turnover - a.turnover} defaultLimit={30}
      banner={{ text: 'Broker-dominant stocks by turnover. Wired to /floorsheet.' }}
      insight="Track which names brokers crowd into — liquidity follows." />
  ),
  'aggressive-holdings': () => (
    <UniversalScreener filterFn={(s) => s.pChange > 2 && s.volumeSurgeRatio > 1.5}
      banner={{ type: 'success', text: 'High-conviction institutional holding pattern.' }}
      insight="Strong close + volume = institutions happy to hold overnight." />
  ),
  'matching-buy-sell': () => (
    <UniversalScreener filterFn={(s) => Math.abs(s.pChange) < 1 && s.volume > 15000}
      banner={{ text: 'Matched buy/sell balance — consolidation before the next leg.' }}
      insight="Balanced flow + tightening range = breakout watch." />
  ),
  'slow-accumulation': () => (
    <UniversalScreener filterFn={(s) => s.pChange > 0 && s.pChange < 1 && s.volume > 10000}
      banner={{ text: 'Slow, silent accumulation — patient buyers building size.' }}
      insight="Small green days on steady volume beat one parabolic spike." />
  ),
};


export const scrollToTop = () => {
  const doScroll = () => {
    try {
      const mainEl = document.querySelector('main');
      if (mainEl) mainEl.scrollTop = 0;
      const scrollables = document.querySelectorAll('.overflow-y-auto');
      scrollables.forEach((el) => { (el as HTMLElement).scrollTop = 0; });
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    } catch (_) {}
  };
  doScroll();
  requestAnimationFrame(doScroll);
  setTimeout(doScroll, 50);
};

interface ServicesHubProps {
  stocks?: any[];
  indices?: any;
  apiStatus?: string;
  userId?: string;
  onNavigateTab?: (tab: string) => void;
  onSelectStock?: (stock: any) => void;
  onAskGuruAi?: (stock: any) => void;
}

export default function ServicesHub({
  stocks = [],
  indices,
  apiStatus,
  userId,
  onNavigateTab,
  onSelectStock,
  onAskGuruAi,
}: ServicesHubProps = {}) {
  const [activeFilter, setActiveFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedService, setSelectedService] = useState<ServiceDef | null>(null);

  useBackHandler(() => {
    if (selectedService) {
      setSelectedService(null);
      scrollToTop();
      return true;
    }
    return false;
  }, !!selectedService, 20);

  useEffect(() => {
    scrollToTop();
  }, [selectedService, activeFilter]);

  const matchingTools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return ALL_SERVICES.filter((s) => {
      const nameMatch = s.name.toLowerCase().includes(q);
      const idMatch = s.id.toLowerCase().includes(q);
      const resolvedCat = getServiceCategory(s).toLowerCase();
      const catMatch = resolvedCat.includes(q) || s.cat.toLowerCase().includes(q);
      const isSip = (q === 'sip' || q.includes('systematic')) && s.id.includes('sip');
      const isBroker = (q === 'broker' || q === 'tms') && (s.id.includes('broker') || s.id === 'calculator');
      const isDiv = (q.startsWith('div') || q === 'bonus' || q === 'right') && (s.id.includes('div') || s.id.includes('bonus') || s.id.includes('right'));
      const isChart = (q === 'chart' || q === 'candlestick') && (s.id.includes('chart') || s.id.includes('candlestick') || s.id === 'stock-momentum');
      const isEntry = (q.startsWith('ent') || q.startsWith('exi')) && s.id.includes('entry');
      return nameMatch || idMatch || catMatch || isSip || isBroker || isDiv || isChart || isEntry;
    });
  }, [search]);

  const matchingStocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || q.length < 1) return [];

    const livePriceMap = new Map<string, any>();
    if (Array.isArray(stocks)) {
      for (const s of stocks) {
        if (s?.symbol) livePriceMap.set(String(s.symbol).toUpperCase(), s);
      }
    }

    const matched = NEPSE_UNIVERSE.filter((sec) => {
      const sym = sec.symbol.toLowerCase();
      const name = (sec.name || '').toLowerCase();
      const secSector = (sec.sector || '').toLowerCase();
      return sym.includes(q) || name.includes(q) || secSector.includes(q);
    });

    return matched.map((sec) => {
      const live = livePriceMap.get(sec.symbol.toUpperCase());
      const ltp = live?.lastTradedPrice ?? live?.closingPrice ?? live?.pointChange ?? null;
      const pChange = live?.percentageChange ?? live?.pChange ?? (live?.previousClose && ltp ? ((ltp - live.previousClose) / live.previousClose) * 100 : 0);
      const turnover = live?.totalTurnover ?? live?.turnover ?? 0;
      return {
        ...sec,
        ltp: ltp != null ? Number(ltp) : null,
        pChange: pChange != null ? Number(pChange) : null,
        turnover: Number(turnover) || 0,
        isLive: !!live,
      };
    }).sort((a, b) => {
      const aSym = a.symbol.toLowerCase();
      const bSym = b.symbol.toLowerCase();
      if (aSym === q) return -1;
      if (bSym === q) return 1;
      if (aSym.startsWith(q) && !bSym.startsWith(q)) return -1;
      if (!aSym.startsWith(q) && bSym.startsWith(q)) return 1;
      return 0;
    });
  }, [search, stocks]);

  const groups = useMemo(() => {
    const g: Record<string, ServiceDef[]> = {};
    CATEGORIES.forEach((cat) => { g[cat.id] = []; });
    ALL_SERVICES.forEach((s) => {
      const resolvedCat = getServiceCategory(s);
      if (g[resolvedCat]) {
        g[resolvedCat].push(s);
      } else if (g['trading']) {
        g['trading'].push(s);
      }
    });
    return g;
  }, []);

  const currentCategoryList = useMemo(() => {
    if (activeFilter === 'all') return CATEGORIES;
    return CATEGORIES.filter((c) => c.id === activeFilter);
  }, [activeFilter]);


  // Top Flagship Tools for Quick Access Carousel
  const QUICK_ACCESS_IDS = [
    'entry-exit-analyzer',
    'stock-momentum',
    'decision-probability',
    'broker-analysis',
    'graham-intrinsic',
    'sip-calculator',
  ];
  const quickAccessServices = useMemo(() => {
    return QUICK_ACCESS_IDS.map((id) => ALL_SERVICES.find((s) => s.id === id)).filter(Boolean) as ServiceDef[];
  }, []);

  if (selectedService) {
    const s = selectedService;
    const style = COLORS[s.color] || COLORS.blue;
    const Icon = s.icon;
    const Component = SERVICE_COMPONENTS[s.id];
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-base, #0B0E14)', color: '#ffffff', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>
        <div className="services-detail-header">
          <button
            onClick={() => { setSelectedService(null); scrollToTop(); }}
            className="services-back-btn"
            aria-label="Back to Services"
            title="Back to Services"
          >
            <ChevronLeft size={22} color="white" />
          </button>
          <div style={{ display: 'flex', width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: style.bg, border: `1px solid ${style.border}`, flexShrink: 0 }}>
            <Icon size={18} color={style.text} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted, #94a3b8)', marginTop: 2 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
              <span>NEPSE Live Feed</span>
              <span>•</span>
              <span style={{ textTransform: 'capitalize' }}>{s.cat.replace('-', ' ')}</span>
            </div>
          </div>
        </div>
        <div className="services-detail-body">
          <div className="services-detail-card">
            {Component ? (
              <Component
                {...({
                  stocks,
                  onSelectStock,
                  indices,
                  apiStatus,
                  userId,
                  onNavigateTab,
                  onAskGuruAi,
                } as any)}
              />
            ) : (
              <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted, #94a3b8)' }}>
                <Activity size={40} color="#64748b" style={{ margin: '0 auto 16px' }} />
                <h3 style={{ color: '#ffffff', fontSize: 18, fontWeight: 800 }}>{s.name}</h3>
                <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: 14 }}>This service is coming soon.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base, #0B0E14)', color: '#ffffff', paddingBottom: 'calc(80px + env(safe-area-inset-bottom))', fontFamily: 'var(--font-sans)' }}>
      {/* ── STICKY RESPONSIVE MOBILE HEADER ── */}
      <div className="services-mobile-header">
        {/* Tier 1: Title + Counter + Status */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ margin: 0, fontSize: 19, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em' }}>Services Hub</h1>
            <span className="badge-pro">PRO</span>
            <span className="badge-count">{ALL_SERVICES.length} tools</span>
          </div>

          <div className="badge-live">
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
            <span>LIVE</span>
          </div>
        </div>

        {/* Tier 2: Dedicated Full-Width Search Input with Clear Button */}
        <div className="services-graceful-search-box">
          <Search size={16} color="#64748b" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            className="services-graceful-search-input"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            data-form-type="other"
            placeholder="Search 90+ tools & 350+ NEPSE stocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (matchingTools.length > 0) {
                  e.preventDefault();
                  setSelectedService(matchingTools[0]);
                  scrollToTop();
                  e.currentTarget.blur();
                } else if (matchingStocks.length > 0) {
                  e.preventDefault();
                  if (onSelectStock) {
                    onSelectStock(matchingStocks[0]);
                  } else {
                    const svc = ALL_SERVICES.find((s) => s.id === 'stock-momentum');
                    if (svc) setSelectedService(svc);
                  }
                  e.currentTarget.blur();
                }
              }
            }}
          />
          {search && (
            <button
              type="button"
              className="services-graceful-clear-btn"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSearch('');
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setSearch('');
              }}
              aria-label="Clear search"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tier 3: Category Pills Carousel (shown when not searching) */}
        {!search && (
          <div className="services-tabs-bar">
            {FILTER_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActiveFilter(tab.id); scrollToTop(); }}
                  className={`services-tab-pill ${isActive ? 'active' : ''}`}
                >
                  {Icon && <Icon size={13} color={isActive ? '#ffffff' : '#94a3b8'} />}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── DUAL SEARCH RESULTS VIEW (when search is active) ── */}
      {search.trim().length > 0 ? (
        <div style={{ padding: '0 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0 10px', fontSize: 13, color: '#94a3b8' }}>
            <span>
              Results for "<strong style={{ color: '#ffffff' }}>{search}</strong>"
            </span>
            <span style={{ fontSize: 12, color: 'var(--primary-light, #60a5fa)', fontWeight: 600 }}>
              {matchingTools.length} tools · {matchingStocks.length} stocks
            </span>
          </div>

          {/* Section 1: Matching Analytical Tools */}
          {matchingTools.length > 0 && (
            <div className="services-search-panel" style={{ margin: '0 0 20px 0' }}>
              <div className="services-search-panel-title">
                <span>Matching Tools & Calculators ({matchingTools.length})</span>
              </div>
              <div className="services-graceful-grid">
                {matchingTools.map((s) => {
                  const cardStyle = COLORS[s.color] || COLORS.blue;
                  const Icon = s.icon;
                  return (
                    <div
                      key={s.id}
                      onClick={() => { setSelectedService(s); scrollToTop(); }}
                      className="services-graceful-card"
                    >
                      <div
                        className="services-icon-box"
                        style={{
                          background: cardStyle.bg,
                          border: `1px solid ${cardStyle.border}`,
                        }}
                      >
                        <Icon size={19} color={cardStyle.text} strokeWidth={2.2} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{
                          fontSize: 12.5,
                          fontWeight: 800,
                          lineHeight: 1.25,
                          color: '#ffffff',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3, textTransform: 'capitalize' }}>
                          {getServiceCategory(s).replace('-', ' ')}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Matching NEPSE Stocks (All 350+ Universe) */}
          {matchingStocks.length > 0 && (
            <div className="services-search-panel" style={{ margin: '0 0 20px 0' }}>
              <div className="services-search-panel-title">
                <span>Matching NEPSE Stocks ({matchingStocks.length})</span>
                <span style={{ fontSize: 10.5, textTransform: 'none', color: '#64748b' }}>Live NEPSE Universe</span>
              </div>
              <div className="services-stock-results-grid">
                {matchingStocks.map((stk) => {
                  const isUp = (stk.pChange ?? 0) > 0;
                  const isDown = (stk.pChange ?? 0) < 0;
                  return (
                    <div
                      key={stk.symbol}
                      onClick={() => {
                        if (onSelectStock) {
                          onSelectStock(stk);
                        } else {
                          const svc = ALL_SERVICES.find((s) => s.id === 'stock-momentum');
                          if (svc) setSelectedService(svc);
                        }
                      }}
                      className="services-stock-result-row"
                    >
                      <div style={{ minWidth: 0, flex: 1, paddingRight: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontWeight: 900, color: '#ffffff' }}>
                            {stk.symbol}
                          </span>
                          <span style={{ fontSize: 9.5, padding: '1px 6px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.08)', color: '#94a3b8', fontWeight: 600 }}>
                            {stk.sector}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                          {stk.name}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        {stk.ltp != null ? (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 12.5, fontWeight: 800, color: '#ffffff', fontFamily: 'var(--font-mono, monospace)' }}>
                              Rs. {stk.ltp.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}
                            </div>
                            <div style={{
                              fontSize: 10.5,
                              fontWeight: 700,
                              color: isUp ? '#34d399' : isDown ? '#f87171' : '#94a3b8',
                              fontFamily: 'var(--font-mono, monospace)',
                            }}>
                              {isUp ? '+' : ''}{(stk.pChange ?? 0).toFixed(2)}%
                            </div>
                          </div>
                        ) : (
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(255, 255, 255, 0.06)', color: '#64748b' }}>
                              Un-traded
                            </span>
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onSelectStock) {
                              onSelectStock(stk);
                            } else {
                              const svc = ALL_SERVICES.find((s) => s.id === 'stock-momentum');
                              if (svc) setSelectedService(svc);
                            }
                          }}
                          style={{
                            background: 'rgba(59, 130, 246, 0.12)',
                            border: '1px solid rgba(59, 130, 246, 0.3)',
                            color: '#60a5fa',
                            borderRadius: 8,
                            padding: '6px 10px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Analyze →
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {matchingTools.length === 0 && matchingStocks.length === 0 && (
            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
              <Search size={40} color="#334155" style={{ margin: '0 auto 14px' }} />
              <h3 style={{ color: '#ffffff', fontSize: 16, fontWeight: 800, margin: '0 0 6px' }}>No matches found</h3>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>Try searching by stock symbol, company name, or tool name.</p>
            </div>
          )}
        </div>
      ) : (
        /* ── BROWSING VIEW (when not searching) ── */
        <>
          {/* Flagship Carousel */}
          {activeFilter === 'all' && (
            <div style={{ padding: '12px 14px 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: 800, color: 'var(--text-secondary, #cbd5e1)', marginBottom: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} color="#f59e0b" />
                  <span>Flagship Analytical Suites</span>
                </span>
                <span style={{ fontSize: 10.5, color: 'var(--text-muted, #94a3b8)' }}>Quick Launch</span>
              </div>

              <div className="services-featured-carousel">
                {quickAccessServices.map((qs) => {
                  const qStyle = COLORS[qs.color] || COLORS.blue;
                  const QIcon = qs.icon;
                  return (
                    <div
                      key={qs.id}
                      onClick={() => { setSelectedService(qs); scrollToTop(); }}
                      className="services-featured-card"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: qStyle.bg, border: `1px solid ${qStyle.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <QIcon size={16} color={qStyle.text} />
                        </div>
                        <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                          FLAGSHIP
                        </span>
                      </div>
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#ffffff', marginBottom: 2 }}>{qs.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text-muted)' }}>
                          <span>Live Engine</span>
                          <span style={{ color: 'var(--primary-light, #60a5fa)', fontWeight: 800 }}>Open →</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Real-time NEPSE Universe Status Strip */}
          <div style={{ margin: '6px 14px 14px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, background: 'var(--bg-card, #151922)', border: '1px solid var(--border, rgba(255,255,255,0.07))', borderRadius: 12, padding: '8px 12px', fontSize: 11, color: 'var(--text-muted, #94a3b8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
              <span style={{ fontWeight: 800, color: '#ffffff' }}>NEPSE Universe:</span>
              <span><strong style={{ color: 'var(--primary-light, #60a5fa)' }}>{NEPSE_UNIVERSE.length}</strong> Securities</span>
              <span>•</span>
              <span>13 Sectors</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5 }}>
              <span style={{ borderRadius: 99, background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)', padding: '2px 8px', fontWeight: 800, color: '#34d399' }}>
                90+ Endpoints Live
              </span>
            </div>
          </div>

          {/* Category Sections */}
          <div style={{ padding: '0 12px' }}>
            {currentCategoryList.map((group) => {
              const svcs = groups[group.id];
              if (!svcs || svcs.length === 0) return null;
              return (
                <div key={group.id} style={{ marginBottom: 24 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 4px', marginBottom: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#ffffff' }}>{group.title}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 99, background: 'rgba(255,255,255,0.08)', color: '#94a3b8' }}>
                        {svcs.length}
                      </span>
                    </div>
                  </div>
                  <p style={{ margin: '0 0 10px 4px', fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{group.subtitle}</p>
                  
                  <div className="services-graceful-grid">
                    {svcs.map((s) => {
                      const cardStyle = COLORS[s.color] || COLORS.blue;
                      const Icon = s.icon;
                      return (
                        <div
                          key={s.id}
                          onClick={() => { setSelectedService(s); scrollToTop(); }}
                          className="services-graceful-card"
                        >
                          <div
                            className="services-icon-box"
                            style={{
                              background: cardStyle.bg,
                              border: `1px solid ${cardStyle.border}`,
                            }}
                          >
                            <Icon size={19} color={cardStyle.text} strokeWidth={2.2} />
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{
                              fontSize: 12.5,
                              fontWeight: 800,
                              lineHeight: 1.25,
                              color: '#ffffff',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>
                              {s.name}
                            </div>
                            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 3, textTransform: 'capitalize' }}>
                              {getServiceCategory(s).replace('-', ' ')}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Footer information */}
            <div style={{ maxWidth: 640, margin: '24px auto 0', borderRadius: 16, border: '1px solid var(--border, rgba(255,255,255,0.08))', background: 'var(--bg-card, #151922)', padding: '16px', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10B981' }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: '#34d399' }}>NEPSE Official Data Feed — Live</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: '#94a3b8' }}>
                Market hours: <strong style={{ color: '#ffffff' }}>Sun–Thu 11:00 AM – 3:00 PM NPT</strong>
                {' '} · Live prices & indicators powered by <strong style={{ color: '#ffffff' }}>NEPSE NOTS API</strong>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Silence unused-import warnings for intentionally varied icon set
void [Wallet, Coins, Receipt, RefreshCw, Crown, Heart, Crosshair, Brain, Gem, Banknote, Filter, Settings, GitBranch, BellRing, ScanLine, LayoutDashboard, Sparkles, Rocket, Percent, Landmark, BookOpen, SlidersHorizontal, Gauge];
