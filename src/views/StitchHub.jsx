import React, { useState } from 'react';
import {
  BarChart3, Bookmark, Activity, PieChart,
  Search, Bell, ArrowLeft, LogOut
} from 'lucide-react';

import { LiveMarketDashboard } from './LiveMarketDashboard';
import { WatchlistScreener } from './WatchlistScreener';
import { StockDetails } from './StockDetails';
import { OrderExecution } from './OrderExecution';
import { FloorSheetTape } from './FloorSheetTape';
import { WaccTaxCalculator } from './WaccTaxCalculator';
import { PortfolioAnalytics } from './PortfolioAnalytics';

export function StitchHub({ onExit, stocks = [], indices = null, marketStatus = null, apiStatus = 'offline' }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [history, setHistory] = useState(['dashboard']);
  const [lang, setLang] = useState('ne'); // 'ne' or 'en'
  const [selectedSymbol, setSelectedSymbol] = useState('NABIL');
  const [orderModal, setOrderModal] = useState({ isOpen: false, symbol: 'NABIL', price: 585.00 });

  const isNe = lang === 'ne';

  const navigateTo = (view, symbol = null) => {
    if (symbol) setSelectedSymbol(symbol);
    setHistory(prev => [...prev, view]);
    setActiveTab(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    if (history.length > 1) {
      const nextHistory = [...history];
      nextHistory.pop();
      setHistory(nextHistory);
      setActiveTab(nextHistory[nextHistory.length - 1]);
    } else {
      setActiveTab('dashboard');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openOrderModal = (sym = 'NABIL', price = null) => {
    let resolvedPrice = price;
    if (!resolvedPrice) {
      const liveStock = stocks.find(s => s.symbol?.toUpperCase() === sym?.toUpperCase());
      resolvedPrice = liveStock?.ltp || liveStock?.close || 585.00;
    }
    setOrderModal({ isOpen: true, symbol: sym, price: resolvedPrice });
  };

  const closeOrderModal = () => {
    setOrderModal(prev => ({ ...prev, isOpen: false }));
  };

  const toggleLang = () => {
    setLang(prev => (prev === 'ne' ? 'en' : 'ne'));
  };

  const isSubPage = ['details', 'order', 'wacc'].includes(activeTab);

  const titles = {
    dashboard: {
      ne: "द्रव्यश्री नेप्से (Drabyashree)",
      subNe: `लाईभ बजार ड्यासबोर्ड • ${apiStatus === 'live' ? 'Live Connected' : 'Continuous Market'}`,
      en: "Drabyashree NEPSE",
      subEn: `Live Market Dashboard • ${apiStatus === 'live' ? 'Live Connected' : 'Continuous Market'}`
    },
    watchlist: {
      ne: "वाचलिस्ट र स्क्रिनर",
      subNe: `कम्पनी छनोट • ${stocks.length > 0 ? `${stocks.length} कम्पनीहरू` : 'Watchlist & Screener'}`,
      en: "Watchlist & Screener",
      subEn: `Scrip Screener • ${stocks.length > 0 ? `${stocks.length} Live Scrips` : 'Continuous Market'}`
    },
    floorsheet: {
      ne: "लाईभ फ्लोरशिट (Tape)",
      subNe: "धितोपत्र कारोबार विवरण • Live Trades",
      en: "Live Floor Sheet Tape",
      subEn: "Real-time Broker Tape & Ticker"
    },
    details: {
      ne: `${selectedSymbol} - विवरण`,
      subNe: "वित्तीय अवस्था तथा बजार गहिराई (Depth)",
      en: `${selectedSymbol} - Details`,
      subEn: "Financials & Level-II Market Depth"
    },
    portfolio: {
      ne: "मेरो पोर्टफोलियो (Portfolio)",
      subNe: "TMS Broker 58 Synced Holdings",
      en: "Portfolio & Analytics",
      subEn: "TMS Broker 58 Synced Holdings"
    },
    wacc: {
      ne: "WACC र लाभकर (Tax Engine)",
      subNe: "MeroShare EDIS & IRD Compliance",
      en: "WACC & Tax Engine",
      subEn: "MeroShare EDIS & IRD Compliance"
    },
    order: {
      ne: `सेयर किनबेच - ${selectedSymbol}`,
      subNe: "Himalayan Sec (TMS #58)",
      en: `Order Execution - ${selectedSymbol}`,
      subEn: "Himalayan Sec (TMS #58)"
    }
  };

  const currentHeader = titles[activeTab] || titles.dashboard;

  return (
    <div className="min-h-screen bg-[#070A10] text-[#F8FAFC] selection:bg-sky-500 selection:text-white flex justify-center w-full">
      <div className="w-full min-h-screen bg-[#0B0F17] flex flex-col relative shadow-2xl overflow-x-hidden">
        
        {/* Top Sticky Glass Header */}
        <header className="sticky top-0 z-40 glass-nav border-b border-white/[0.07] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isSubPage ? (
              <button
                onClick={handleBack}
                className="h-9 w-9 flex items-center justify-center rounded-xl bg-white/[0.06] text-slate-300 hover:text-white hover:bg-white/[0.1] transition-all tap-active"
              >
                <ArrowLeft size={18} />
              </button>
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 font-extrabold text-sm text-white shadow-md shadow-sky-500/20">
                DS
              </div>
            )}
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-sm font-bold tracking-tight text-white leading-tight">
                  {isNe ? currentHeader.ne : currentHeader.en}
                </h1>
                <span className="rounded bg-sky-500/20 border border-sky-500/30 px-1.5 py-0.2 font-mono text-[9px] text-sky-400 font-bold">
                  TMS 58
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400">
                {isNe ? currentHeader.subNe : currentHeader.subEn}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Language Switch */}
            <button
              onClick={toggleLang}
              className="px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-white/[0.05] border border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.1] transition-all tap-active"
              title="Toggle Nepali / English"
            >
              {isNe ? 'नेपाली | EN' : 'EN | नेपाली'}
            </button>

            {/* Search shortcut to watchlist */}
            <button
              onClick={() => navigateTo('watchlist')}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/[0.06] hover:text-white transition-all tap-active"
            >
              <Search size={16} />
            </button>

            {/* Notification Bell */}
            <button
              onClick={() => alert(isNe ? 'नेप्से सूचना: बजार ३७.१५ अंकले वृद्धि; नबिल बैंकको साधारणसभा मिति घोषणा!' : 'NEPSE Alert: Market up +37.15 pts; NABIL AGM scheduled!')}
              className="relative flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-white/[0.06] hover:text-white transition-all tap-active"
            >
              <Bell size={16} />
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            </button>

            {/* Classic App exit pill */}
            {onExit && (
              <button
                onClick={onExit}
                title="Return to Classic App"
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-mono font-bold bg-sky-500/10 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 transition-all tap-active ml-0.5"
              >
                <LogOut size={12} />
                <span>Classic</span>
              </button>
            )}
          </div>
        </header>

        {/* Main Content Body */}
        <main className="flex-1 px-4 pt-3.5 pb-28">
          {activeTab === 'dashboard' && (
            <LiveMarketDashboard
              onSelectScrip={(sym) => navigateTo('details', sym)}
              onOpenFloorSheet={() => navigateTo('floorsheet')}
              onOpenOrder={(sym, pr) => openOrderModal(sym, pr)}
              lang={lang}
              stocks={stocks}
              indices={indices}
              marketStatus={marketStatus}
              apiStatus={apiStatus}
            />
          )}

          {activeTab === 'watchlist' && (
            <WatchlistScreener
              onSelectScrip={(sym) => navigateTo('details', sym)}
              lang={lang}
              stocks={stocks}
            />
          )}

          {activeTab === 'floorsheet' && (
            <FloorSheetTape
              onSelectScrip={(sym) => navigateTo('details', sym)}
              lang={lang}
            />
          )}

          {activeTab === 'details' && (
            <StockDetails
              symbol={selectedSymbol}
              onBack={handleBack}
              onOpenOrder={(sym, pr) => openOrderModal(sym, pr)}
              lang={lang}
              stocks={stocks}
            />
          )}

          {activeTab === 'portfolio' && (
            <PortfolioAnalytics
              onOpenWacc={() => navigateTo('wacc')}
              onSelectScrip={(sym) => navigateTo('details', sym)}
              lang={lang}
              stocks={stocks}
            />
          )}

          {activeTab === 'wacc' && (
            <WaccTaxCalculator
              onBack={handleBack}
              lang={lang}
            />
          )}

          {activeTab === 'order' && (
            <OrderExecution
              symbol={selectedSymbol}
              defaultPrice={orderModal.price}
              onBack={handleBack}
              onCompleteOrder={() => navigateTo('portfolio')}
              lang={lang}
            />
          )}
        </main>

        {/* Global Modal: Order Execution Slip */}
        {orderModal.isOpen && (
          <OrderExecution
            isModal={true}
            symbol={orderModal.symbol}
            defaultPrice={orderModal.price}
            onClose={closeOrderModal}
            onCompleteOrder={() => {
              closeOrderModal();
              navigateTo('portfolio');
            }}
            lang={lang}
          />
        )}

        {/* Persistent Bottom Glass Navigation */}
        {!isSubPage && (
          <nav className="fixed bottom-0 left-0 right-0 w-full z-50 border-t border-white/[0.07] glass-nav px-3 py-2.5">
            <div className="flex items-center justify-around">
              {[
                { id: 'dashboard', labelNe: 'ड्यासबोर्ड', labelEn: 'Dashboard', icon: BarChart3 },
                { id: 'watchlist', labelNe: 'वाचलिस्ट', labelEn: 'Watchlist', icon: Bookmark },
                { id: 'floorsheet', labelNe: 'फ्लोरशिट', labelEn: 'Floor Sheet', icon: Activity },
                { id: 'portfolio', labelNe: 'पोर्टफोलियो', labelEn: 'Portfolio', icon: PieChart },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => navigateTo(tab.id)}
                    className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl transition-all tap-active ${
                      isActive
                        ? 'text-sky-400 font-bold bg-sky-500/10'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-[10px] tracking-tight">
                      {isNe ? tab.labelNe : tab.labelEn}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}

export default StitchHub;
