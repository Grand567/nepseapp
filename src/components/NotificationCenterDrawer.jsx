import React, { useState, useEffect, useMemo } from 'react';
import { 
  Bell, 
  X, 
  CheckCheck, 
  Trash2, 
  Send, 
  ExternalLink, 
  TrendingUp, 
  ShieldAlert, 
  Award, 
  Newspaper, 
  Clock, 
  Sparkles, 
  ChevronRight,
  Filter,
  CheckCircle2,
  RefreshCw,
  Zap,
  Target
} from 'lucide-react';
import { 
  fetchNotificationsFeed, 
  getCachedNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead, 
  clearNotificationCache,
  triggerTestAlert 
} from '../utils/pushNotificationService';

export function NotificationCenterDrawer({ 
  isOpen, 
  onClose, 
  onOpenAlertModal, 
  onOpenStock, 
  onNavigateTab,
  userPortfolioSymbols = [],
  userWatchlistSymbols = []
}) {
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'pro' | 'general' | 'portfolio'
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Combine user symbols for portfolio/watchlist filtering
  const userTrackedSet = useMemo(() => {
    const set = new Set();
    userPortfolioSymbols.forEach(s => s && set.add(String(s).toUpperCase().trim()));
    userWatchlistSymbols.forEach(s => s && set.add(String(s).toUpperCase().trim()));
    return set;
  }, [userPortfolioSymbols, userWatchlistSymbols]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const feed = await fetchNotificationsFeed('all', 60);
      setNotifications(feed || []);
    } catch (_) {
      setNotifications(getCachedNotifications('all'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadNotifications();
    }
  }, [isOpen]);

  // Listen for real-time notification arrivals
  useEffect(() => {
    const handleUpdate = () => {
      setNotifications(getCachedNotifications('all'));
    };

    window.addEventListener('dravyashree_notifications_updated', handleUpdate);
    window.addEventListener('dravyashree_smart_alert_received', handleUpdate);

    return () => {
      window.removeEventListener('dravyashree_notifications_updated', handleUpdate);
      window.removeEventListener('dravyashree_smart_alert_received', handleUpdate);
    };
  }, []);

  if (!isOpen) return null;

  // Filter items based on activeTab
  const filteredNotifications = notifications.filter(item => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pro') {
      return item.category === 'pro' || item.tier === 'pro' || item.type?.includes('SMART') || item.type?.includes('PROFIT') || item.type?.includes('STOP_LOSS');
    }
    if (activeTab === 'general') {
      return item.category === 'general' || item.type === 'IPO_ALERT' || item.type === 'NEWS_ALERT' || item.type === 'NEPSE_MACRO';
    }
    if (activeTab === 'portfolio') {
      const sym = String(item.symbol || '').toUpperCase().trim();
      return sym && userTrackedSet.has(sym);
    }
    return true;
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleItemClick = (item) => {
    markNotificationAsRead(item.id);
    setNotifications(prev => prev.map(n => n.id === item.id ? { ...n, read: true } : n));
    onClose();

    // Unified routing through central notification router in App.jsx
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dravyashree_notification_clicked', { detail: item }));
    }
  };

  const handleMarkAllRead = () => {
    markAllNotificationsAsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleClearAll = () => {
    clearNotificationCache();
    setNotifications([]);
  };

  const handleSendTestAlert = async () => {
    setIsTesting(true);
    try {
      await triggerTestAlert('GHL', 269.50);
      await loadNotifications();
    } catch (_) {}
    setIsTesting(false);
  };

  const formatTime = (ts) => {
    if (!ts) return 'Just now';
    try {
      const date = new Date(ts);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      const diffHrs = Math.floor(diffMins / 60);
      if (diffHrs < 24) return `${diffHrs}h ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch (_) {
      return 'Recent';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      {/* Backdrop Click to close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Drawer Container */}
      <div className="relative w-full max-w-md h-full bg-[#080d1a] border-l border-slate-800 flex flex-col shadow-2xl z-10 animate-in slide-in-from-right duration-300">
        
        {/* ── HEADER ── */}
        <div className="p-4 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white ring-2 ring-[#080d1a]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Live Alerts & Feed</h2>
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Live Polling Connected" />
              </div>
              <p className="text-[11px] text-slate-400">Real-time NEPSE Signals & Corporate News</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={loadNotifications}
              disabled={loading}
              title="Refresh alerts"
              className="p-2 rounded-lg text-slate-400 hover:text-cyan-400 hover:bg-slate-800/70 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/70 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ── TELEGRAM STATUS BAR BANNER (Zero-failure closed-app alerts) ── */}
        <div className="mx-3 mt-3 p-3 rounded-xl bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-indigo-950/40 border border-cyan-500/30 flex items-center justify-between gap-2.5 shadow-lg">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-400 shrink-0">
              <Send className="w-4 h-4 -rotate-12 translate-x-0.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-white truncate">Closed-App Phone Alerts</span>
                <span className="text-[9px] font-black uppercase px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40">Telegram Bot</span>
              </div>
              <p className="text-[11px] text-slate-300 truncate">
                Get lockscreen buzz even when app is killed!
              </p>
            </div>
          </div>
          <a
            href="https://t.me/drabya_trade_alert_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 px-2.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-[#080d1a] font-bold text-xs flex items-center gap-1 transition-all shadow-md shadow-sky-500/20"
          >
            Open Bot
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* ── TAB SELECTOR ── */}
        <div className="px-3 pt-3 flex items-center gap-1 border-b border-slate-800/80 bg-[#080d1a]/50">
          {[
            { id: 'all', label: 'All', count: notifications.length },
            { id: 'pro', label: 'PRO Signals', icon: Zap, count: notifications.filter(n => n.category === 'pro' || n.tier === 'pro').length },
            { id: 'general', label: 'IPO & News', icon: Newspaper, count: notifications.filter(n => n.category === 'general' || n.type === 'IPO_ALERT' || n.type === 'NEWS_ALERT').length },
            { id: 'portfolio', label: 'My Stocks', count: userTrackedSet.size > 0 ? notifications.filter(n => n.symbol && userTrackedSet.has(String(n.symbol).toUpperCase())).length : 0 }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2 px-1.5 text-xs font-semibold rounded-t-lg flex items-center justify-center gap-1.5 transition-all border-b-2 ${
                  isActive
                    ? 'border-cyan-400 text-cyan-300 bg-slate-800/50'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'bg-slate-800 text-slate-400'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── ACTION BAR (Mark Read & Clear) ── */}
        <div className="px-3 py-2 flex items-center justify-between text-xs text-slate-400 bg-slate-950/40 border-b border-slate-800/40">
          <span className="text-[11px]">
            Showing {filteredNotifications.length} of {notifications.length} alerts
          </span>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 font-medium"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-rose-400 font-medium ml-2"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* ── NOTIFICATION LIST ── */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 divide-y divide-slate-800/0">
          {filteredNotifications.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center text-slate-500">
                <Bell className="w-6 h-6 stroke-1" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">No alerts in this category</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live institutional scans, breakout filters, IPOs and news poll automatically.
                </p>
              </div>
              <button
                onClick={handleSendTestAlert}
                disabled={isTesting}
                className="mt-2 px-3 py-1.5 rounded-lg bg-cyan-600/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-600/30 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {isTesting ? 'Simulating setup...' : 'Simulate Live Setup (GHL)'}
              </button>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const isPro = item.category === 'pro' || item.tier === 'pro';
              const isExit = item.type?.includes('STOP_LOSS') || item.type?.includes('PROFIT');
              const isIpo = item.type === 'IPO_ALERT';
              const isNews = item.type === 'NEWS_ALERT';

              return (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className={`group relative p-3 rounded-xl border transition-all cursor-pointer ${
                    !item.read
                      ? 'bg-slate-900/90 border-slate-700 shadow-md shadow-black/40 hover:border-cyan-500/60'
                      : 'bg-slate-950/60 border-slate-800/60 hover:bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  {/* Unread Glow Dot */}
                  {!item.read && (
                    <span className="absolute top-3 right-3 flex h-2 w-2 rounded-full bg-cyan-400 ring-2 ring-cyan-400/30" />
                  )}

                  {/* Top Meta Line: Badge + Symbol + Time */}
                  <div className="flex items-center gap-2 mb-1.5 pr-4">
                    {/* Badge */}
                    {isExit ? (
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3" />
                        Exit Signal
                      </span>
                    ) : isPro ? (
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Zap className="w-3 h-3 text-amber-400" />
                        PRO Signal
                      </span>
                    ) : isIpo ? (
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                        <Award className="w-3 h-3 text-blue-400" />
                        IPO Alert
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30 flex items-center gap-1">
                        <Newspaper className="w-3 h-3 text-teal-400" />
                        News
                      </span>
                    )}

                    {item.symbol && (
                      <span className="text-xs font-black text-white tracking-wide bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                        {item.symbol}
                      </span>
                    )}

                    {item.ltp > 0 && (
                      <span className="text-xs font-mono font-bold text-emerald-400">
                        Rs. {item.ltp.toFixed(2)}
                      </span>
                    )}

                    <span className="text-[10px] text-slate-500 font-mono ml-auto">
                      {formatTime(item.timestamp)}
                    </span>
                  </div>

                  {/* Title & Body */}
                  <h4 className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition-colors line-clamp-1">
                    {item.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {item.body}
                  </p>

                  {/* PRO Metrics Pill Bar (If present) */}
                  {(item.target1 > 0 || item.stopLoss > 0 || item.concentrationPct > 0) && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                      {item.buyZone?.low > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-500/30">
                          Zone: {item.buyZone.low} - {item.buyZone.high}
                        </span>
                      )}
                      {item.target1 > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-cyan-950/40 text-cyan-300 border border-cyan-500/30">
                          T1: Rs. {item.target1}
                        </span>
                      )}
                      {item.stopLoss > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-950/40 text-rose-300 border border-rose-500/30">
                          SL: Rs. {item.stopLoss}
                        </span>
                      )}
                      {item.concentrationPct > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-500/30">
                          Whale: {item.concentrationPct}%
                        </span>
                      )}
                    </div>
                  )}

                  {/* Action Link Footer */}
                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500 font-semibold group-hover:text-cyan-400 transition-colors pt-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-500">
                      {isExit ? 'Review Exit Plan' : isPro ? 'View Wyckoff Ticket' : isIpo ? 'View IPO Schedule' : 'Open Details'}
                    </span>
                    <div className="flex items-center gap-1 text-cyan-400">
                      <span>Action</span>
                      <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── FOOTER: SYSTEM STATUS ── */}
        <div className="p-3 bg-slate-950 border-t border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>FCM + Telegram Multi-Channel Dispatch</span>
          </div>
          <button
            onClick={handleSendTestAlert}
            disabled={isTesting}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3" />
            {isTesting ? 'Sending...' : 'Test Buzz'}
          </button>
        </div>

      </div>
    </div>
  );
}

export default NotificationCenterDrawer;
