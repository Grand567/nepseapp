import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, ArrowUpRight, ArrowDownRight, Briefcase, PlusCircle, MinusCircle, 
  ShieldCheck, Layers, BookOpen, Sparkles, X, Loader2, RefreshCw, Key, Lock, 
  HelpCircle, ExternalLink, ArrowRight, ShieldAlert, CheckCircle2, Edit3, Check 
} from 'lucide-react';
import { calculateBuyDetails, calculateSellDetails, sanitizeMeroShareHoldings, guessScripBasePrice, getCustomWaccMap, setScripCustomWacc, saveCustomWaccMap } from '../utils/calculations';
import { getProxyBase } from '../utils/liveData';
import { syncUserDataToCloud } from '../utils/firebase';
import { pullMeroShareLivePortfolio, authenticateMeroShare, MEROSHARE_DP_LIST } from '../services/meroShareService';
import { generateMockDematPortfolio } from '../utils/mockData';
import { Capacitor } from '@capacitor/core';
import { DEFAULT_AI_KEY, callGlmAi, generateNepseAiContent } from '../services/aiService';

/**
 * Safe markdown renderer — only handles **bold** and newlines.
 * Avoids dangerouslySetInnerHTML to prevent XSS from AI output.
 */
function SafeMarkdown({ text }) {
  if (!text) return null;
  const lines = text.split('\n');
  return (
    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
      {lines.map((line, li) => {
        // Split on **bold** markers
        const parts = line.split(/\*\*(.*?)\*\*/g);
        return (
          <React.Fragment key={li}>
            {parts.map((part, pi) =>
              pi % 2 === 1
                ? <strong key={pi} style={{ color: 'var(--text-primary)' }}>{part}</strong>
                : <span key={pi}>{part}</span>
            )}
            {li < lines.length - 1 && <br />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Robust helper to safely fetch and parse JSON, handling WAF HTML blocks and timeout errors
const safeFetchJson = async (url, options = {}) => {
  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    throw new Error('Network error: Could not reach the server. Check your internet connection.');
  }

  // Always read as text first, then try to parse as JSON
  let text;
  try {
    text = await res.text();
  } catch (_) {
    throw new Error(`Could not read server response (status ${res.status}).`);
  }

  // Try JSON parse regardless of content-type
  let json;
  try {
    json = JSON.parse(text);
  } catch (_) {
    // Not valid JSON — detect WAF/HTML blocks
    const lower = text.toLowerCase();
    if (lower.includes('request rejected') || lower.includes('<html') || lower.includes('access denied') || lower.includes('forbidden')) {
      throw new Error('MeroShare security firewall or proxy returned an HTML error page. Please try again in a moment.');
    }
    if (!res.ok) {
      throw new Error(`Proxy server returned status ${res.status}. The server may be temporarily down or overloaded.`);
    }
    throw new Error(`Server returned non-JSON response (status ${res.status}). The proxy may be down.`);
  }

  // If HTTP error, throw with the message from the JSON body
  if (!res.ok) {
    throw new Error(json.message || `Request failed with status ${res.status}`);
  }
  return json;
};

// Automatically resolve MeroShare clientId (DP ID)
const getRealClientId = async (boid, dpCode) => {
  try {
    const isNative = Capacitor.isNativePlatform();
    const baseUrl = isNative ? 'https://backend.cdsc.com.np/api/meroShare' : getProxyBase();
    const apiPath = isNative ? '/capital/' : '/api/meroshare/dp-list';

    let dpData;
    if (isNative) {
      const res = await fetch(`${baseUrl}${apiPath}`);
      const json = await res.json();
      dpData = json || [];
    } else {
      const json = await safeFetchJson(`${baseUrl}${apiPath}`);
      dpData = json.success ? json.data : [];
    }

    if (dpData && dpData.length > 0) {
      // DP Matching Strategy
      const fullBoidPrefix = boid.substring(0, 8); // e.g. "12010600"
      const shortBoidPrefix = boid.substring(3, 8); // e.g. "10600"

      // 1. Match by full 8-digit DP code in CDSC list
      const matchedByFullCode = dpData.find(dp => dp.code === fullBoidPrefix);
      if (matchedByFullCode) return matchedByFullCode.id;

      // 2. Fallback: match by short 5-digit prefix (e.g. "10600")
      const matchedByShortCode = dpData.find(dp => 
        dp.code === shortBoidPrefix || 
        (dp.code && dp.code.includes(shortBoidPrefix))
      );
      if (matchedByShortCode) return matchedByShortCode.id;
    }
  } catch (err) {
    console.error("Failed to map DP list:", err);
  }
  const mockDp = MOCK_DP_LIST.find(dp => dp.code === dpCode);
  if (mockDp) {
    const idMatch = mockDp.name.match(/\((\d+)\)/);
    if (idMatch) return parseInt(idMatch[1]);
  }
  return 101;
};

export default function Portfolio({ marketStocks, userId = 'local' }) {

  const [transactions, setTransactions] = useState([]);
  const [meroshareProfiles, setMeroshareProfiles] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeView, setActiveView] = useState('consolidated'); // 'consolidated', 'meroshare', 'manual'
  const [valuationMode, setValuationMode] = useState('prevClose'); // 'prevClose' (MeroShare Official default), 'ltp', 'live'
  const [allocationView, setAllocationView] = useState('stock'); // 'stock', 'sector'
  
  // Form fields
  const [type, setType] = useState('buy'); // 'buy' or 'sell'
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState(10);
  const [price, setPrice] = useState(100);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // AI Analyst state
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState('');
  const [selectedAiStock, setSelectedAiStock] = useState(null);
  const [glmKey, setGlmKey] = useState(() => localStorage.getItem('nepse_hub_glm_api_key') || import.meta.env.VITE_GLM_API_KEY || DEFAULT_AI_KEY);
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('nepse_hub_gemini_api_key') || import.meta.env.VITE_GEMINI_API_KEY || '');
  const [groqKey, setGroqKey] = useState(() => localStorage.getItem('nepse_hub_groq_api_key') || import.meta.env.VITE_GROQ_API_KEY || '');
  const [preferredEngine, setPreferredEngine] = useState(() => localStorage.getItem('nepse_hub_preferred_ai_engine') || 'auto');
  const [showKeyInput, setShowKeyInput] = useState(false);

  // WACC Management state
  const [showWaccModal, setShowWaccModal] = useState(false);
  const [waccEditValues, setWaccEditValues] = useState({});
  const [editingScrip, setEditingScrip] = useState(null);
  const [quickWaccInput, setQuickWaccInput] = useState('');
  const [waccSaveSuccess, setWaccSaveSuccess] = useState('');

  // MeroShare Holdings Sync state
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncProfileId, setSyncProfileId] = useState('');
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [retrievalStep, setRetrievalStep] = useState(0);
  const [sessionToken, setSessionToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncSuccess, setSyncSuccess] = useState('');

  // User-scoped localStorage keys
  const txKey      = `nepse_hub_${userId}_transactions`;
  const profileKey = `nepse_hub_${userId}_profiles`;

  // Load transactions and meroshare profiles from localStorage (scoped to user)
  useEffect(() => {
    const loadData = () => {
      const savedTxs = localStorage.getItem(txKey);
      if (savedTxs) {
        try { setTransactions(JSON.parse(savedTxs)); }
        catch (e) { setTransactions([]); }
      } else {
        setTransactions([]);
      }

      const savedProfiles = localStorage.getItem(profileKey);
      if (savedProfiles) {
        try {
          const parsed = JSON.parse(savedProfiles);
          const sanitized = (Array.isArray(parsed) ? parsed : []).map(p => ({
            ...p,
            holdings: sanitizeMeroShareHoldings(p.holdings)
          }));
          setMeroshareProfiles(sanitized);
        }
        catch (e) { setMeroshareProfiles([]); }
      } else {
        setMeroshareProfiles([]);
      }
    };

    // Also merge any accounts registered in Bulk Account Manager that haven't synced yet
    const mergeBulkAccounts = () => {
      try {
        const bulkRaw = localStorage.getItem('nepse_hub_bulk_ipo_accounts');
        if (!bulkRaw) return;
        const bulkAccounts = JSON.parse(bulkRaw);
        if (!Array.isArray(bulkAccounts) || bulkAccounts.length === 0) return;

        const savedProfiles = localStorage.getItem(profileKey);
        const existingProfiles = savedProfiles ? JSON.parse(savedProfiles) : [];
        let changed = false;
        const merged = [...existingProfiles];
        bulkAccounts.forEach(acc => {
          const existing = merged.find(p => p.boid === acc.boid);
          if (!existing) {
            merged.push({
              id: acc.id,
              name: acc.name,
              boid: acc.boid,
              username: acc.username,
              dpCode: acc.dpCode,
              dpId: acc.dpId,
              dpName: acc.dpName || 'Capital DP',
              password: acc.password,
              crn: acc.crn,
              pin: String(acc.pin || ''),
              holdings: sanitizeMeroShareHoldings(acc.holdings),
              lastSyncedAt: acc.lastSyncedAt || null
            });
            changed = true;
          } else if (acc.holdings?.length > 0) {
            if (!existing.holdings || existing.holdings.length === 0 || (acc.lastSyncedAt && (!existing.lastSyncedAt || acc.lastSyncedAt >= existing.lastSyncedAt))) {
              existing.holdings = sanitizeMeroShareHoldings(acc.holdings);
              existing.lastSyncedAt = acc.lastSyncedAt || Date.now();
              if (acc.name && acc.name !== 'Unknown') existing.name = acc.name;
              changed = true;
            }
          }
        });
        if (changed) {
          localStorage.setItem(profileKey, JSON.stringify(merged));
          setMeroshareProfiles(merged);
        }
      } catch (_) {}
    };

    loadData();
    mergeBulkAccounts();

    // Listen for live updates from MeroShareHub and AccountManager (same-tab storage events)
    const handleStorageChange = (e) => {
      if (e.key === profileKey) {
        try {
          const updated = JSON.parse(e.newValue || '[]');
          setMeroshareProfiles(Array.isArray(updated) ? updated : []);
        } catch (_) {}
      }
      if (e.key === txKey) {
        try {
          const updated = JSON.parse(e.newValue || '[]');
          setTransactions(Array.isArray(updated) ? updated : []);
        } catch (_) {}
      }
    };

    // Listen for CustomEvent from AccountManager (same-tab, reliable)
    const handleBulkAccountsChanged = (e) => {
      try {
        if (e.detail && e.detail.key === profileKey && Array.isArray(e.detail.profiles)) {
          setMeroshareProfiles(e.detail.profiles);
        }
      } catch (_) {}
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('bulkAccountsChanged', handleBulkAccountsChanged);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('bulkAccountsChanged', handleBulkAccountsChanged);
    };
  }, [userId]);  // Re-load whenever the logged-in user changes

  // Ensure default symbol is set
  useEffect(() => {
    if (marketStocks.length > 0 && !symbol) {
      setSymbol(marketStocks[0].symbol);
    }
  }, [marketStocks, symbol]);

  const saveProfilesToStorage = (newProfiles) => {
    setMeroshareProfiles(newProfiles);
    localStorage.setItem(profileKey, JSON.stringify(newProfiles));
    window.dispatchEvent(new StorageEvent('storage', { key: profileKey, newValue: JSON.stringify(newProfiles) }));
    // Cloud Sync
    try {
      syncUserDataToCloud(userId, newProfiles, null);
    } catch (_) {}
  };

  const handleRetrievePortfolio = async (profileId) => {
    if (!profileId) return;
    const profile = meroshareProfiles.find(p => p.id === profileId);
    if (!profile) return;

    setIsRetrieving(true);
    setRetrievalStep(1);
    setSyncError('');
    setSyncSuccess('');

    try {
      setRetrievalStep(2);
      const result = await pullMeroShareLivePortfolio(profile);

      if (!result.success) {
        throw new Error(result.messageEn || result.messageNe || 'Failed to fetch MeroShare portfolio.');
      }

      setRetrievalStep(3);
      const parsedHoldings = sanitizeMeroShareHoldings(result.holdings || []);

      setRetrievalStep(4);
      await new Promise(r => setTimeout(r, 400));

      const updatedProfiles = meroshareProfiles.map(p => {
        if (p.id === profileId) {
          return {
            ...p,
            name: (result.name && result.name !== 'Unknown') ? result.name : p.name,
            holdings: parsedHoldings,
            lastSyncedAt: Date.now()
          };
        }
        return p;
      });

      saveProfilesToStorage(updatedProfiles);

      // Also update bulk accounts list so it stays in sync
      try {
        const bulkRaw = localStorage.getItem('nepse_hub_bulk_ipo_accounts');
        if (bulkRaw) {
          const bulkAccounts = JSON.parse(bulkRaw);
          const updatedBulk = bulkAccounts.map(a => (a.boid === profile.boid || a.id === profile.id) ? {
            ...a,
            name: (result.name && result.name !== 'Unknown') ? result.name : a.name,
            holdings: parsedHoldings,
            lastSyncedAt: Date.now()
          } : a);
          localStorage.setItem('nepse_hub_bulk_ipo_accounts', JSON.stringify(updatedBulk));
        }
      } catch (_) {}

      setIsRetrieving(false);
      setRetrievalStep(0);
      setSyncSuccess(`Demat portfolio synced! Loaded ${parsedHoldings.length} scrips for ${(result.name && result.name !== 'Unknown') ? result.name : profile.name}.`);
    } catch (err) {
      console.error("Demat fetch error:", err);
      setSyncError(`Failed to fetch holdings: ${err.message}.`);
      setIsRetrieving(false);
      setRetrievalStep(0);
    }
  };

  const handleRetrieveWithToken = async (profileId, token) => {
    if (!profileId || !token) {
      setSyncError("Please provide a valid active session token.");
      return;
    }
    const profile = meroshareProfiles.find(p => p.id === profileId);
    if (!profile) return;

    setIsRetrieving(true);
    setRetrievalStep(3);
    setSyncError('');
    setSyncSuccess('');

    try {
      const detailData = await safeFetchJson(`${getProxyBase()}/api/meroshare/own-detail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const exactClientCode = detailData.data?.clientCode || profile.clientCode || '';
      const exactDemat = detailData.data?.demat || detailData.data?.boid || profile.boid;

      const portfolioData = await safeFetchJson(`${getProxyBase()}/api/meroshare/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, demat: exactDemat, clientCode: exactClientCode })
      });

      if (!portfolioData.success || !portfolioData.data) {
        throw new Error(portfolioData.message || 'Failed to fetch demat portfolio data.');
      }

      const msaList = portfolioData.data?.meroShareMyPortfolio || portfolioData.data?.msaList || portfolioData.data || [];
      const parsedHoldings = msaList.map(item => {
        const symbol = (item.script || item.scrip || item.symbol || '').trim().toUpperCase();
        const name = (item.scriptDesc || item.scripName || item.companyName || symbol).trim();
        const units = parseFloat(item.currentBalance || item.dematQty || item.units || item.totalBalance || 0);
        const freeBalance = parseFloat(item.freeBalance || item.currentBalance || units);
        const frozenBalance = parseFloat(item.freezeBalance || item.frozenBalance || 0);
        
        const base = guessScripBasePrice(symbol, parseFloat(item.wacc || item.purchasePrice || 0));
        const ltp = parseFloat(item.lastTransactionPrice || item.lastTradedPrice || item.ltp || item.currentPrice || 0);
        const prevClose = parseFloat(item.previousClosingPrice || item.closingPrice || item.prevClose || item.prevClosingPrice || 0);
        
        const currentLtp = ltp > 0 ? ltp : (prevClose > 0 ? prevClose : base);
        const prevCloseResolved = prevClose > 0 ? prevClose : currentLtp;

        const valLtpRaw = parseFloat(item.valueAsOfLastTransactionPrice || item.valueOfLastTransactionPrice || item.valueAsOfLTP || item.totalAmount || item.totalValue || 0);
        const valCloseRaw = parseFloat(item.valueAsOfPreviousClosingPrice || item.valueOfPreviousClosingPrice || item.valueAsOfPrevClose || 0);

        const valueAsOfLTP = valLtpRaw > 0 ? valLtpRaw : parseFloat((units * currentLtp).toFixed(2));
        const valueAsOfPrevClose = valCloseRaw > 0 ? valCloseRaw : parseFloat((units * prevCloseResolved).toFixed(2));

        let wacc = parseFloat(item.wacc || item.purchasePrice || item.costPrice || base);
        if (isNaN(wacc) || wacc <= 0) wacc = base;

        return {
          symbol,
          name,
          units,
          totalUnits: units,
          freeBalance,
          frozenBalance,
          currentLtp,
          prevClose: prevCloseResolved,
          valueAsOfLTP,
          valueAsOfPrevClose,
          currentMarketValue: valueAsOfLTP > 0 ? valueAsOfLTP : parseFloat((units * currentLtp).toFixed(2)),
          wacc: Number(Number(wacc || 0).toFixed(2))
        };
      }).filter(h => h.symbol && h.units > 0);

      setRetrievalStep(4);
      await new Promise(r => setTimeout(r, 450));

      const rootPrevCloseVal = parseFloat(portfolioData.data?.totalValueOfPreviousClosingPrice || 0);
      const rootLtpVal = parseFloat(portfolioData.data?.totalValueOfLastTransactionPrice || portfolioData.data?.totalAmount || 0);

      const updatedProfiles = meroshareProfiles.map(p => {
        if (p.id === profileId) {
          return { 
            ...p, 
            holdings: parsedHoldings, 
            totalValueOfPreviousClosingPrice: rootPrevCloseVal > 0 ? rootPrevCloseVal : undefined,
            totalValueOfLastTransactionPrice: rootLtpVal > 0 ? rootLtpVal : undefined,
            lastSyncedAt: Date.now() 
          };
        }
        return p;
      });
      saveProfilesToStorage(updatedProfiles);

      setSyncSuccess(`Demat portfolio successfully fetched using session token! Retrieved ${parsedHoldings.length} holdings for ${profile.name}.`);
      setSessionToken('');
      setShowTokenInput(false);
      setIsRetrieving(false);
      setRetrievalStep(0);

    } catch (err) {
      console.error("Token fetch error:", err);
      setSyncError(`Failed to fetch holdings using session token. Error: ${err.message}`);
      setIsRetrieving(false);
      setRetrievalStep(0);
    }
  };

  const handleCsvImport = (e, profileId) => {
    const file = e.target.files[0];
    if (!file) return;

    setSyncError('');
    setSyncSuccess('');

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const lines = text.split('\n');
        if (lines.length < 2) {
          setSyncError("Invalid CSV file structure.");
          return;
        }

        const parsedHoldings = [];
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          const parts = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          if (parts.length >= 3) {
            const symbol = parts[1].replace(/"/g, '').trim().toUpperCase();
            const units = parseInt(parts[2].replace(/"/g, '').trim());
            let wacc = parseFloat(parts[3] ? parts[3].replace(/"/g, '').trim() : '100') || 100;
            
            if (symbol && !isNaN(units) && units > 0) {
              parsedHoldings.push({
                symbol,
                name: symbol,
                units,
                wacc: Number(wacc.toFixed(2))
              });
            }
          }
        }

        if (parsedHoldings.length === 0) {
          setSyncError("Could not extract any valid holdings from the CSV file.");
          return;
        }

        const updatedProfiles = meroshareProfiles.map(p => {
          if (p.id === profileId) {
            return { ...p, holdings: parsedHoldings, lastSyncedAt: Date.now() };
          }
          return p;
        });
        saveProfilesToStorage(updatedProfiles);
        setSyncSuccess(`Imported ${parsedHoldings.length} holdings successfully from CSV!`);

      } catch (err) {
        setSyncError(`Failed to parse CSV: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const saveTransactions = (newTxs) => {
    setTransactions(newTxs);
    localStorage.setItem(txKey, JSON.stringify(newTxs));
    // Cloud Sync
    try {
      syncUserDataToCloud(userId, null, newTxs);
    } catch (_) {}
  };

  const handleAddTransaction = (e) => {
    e.preventDefault();
    if (quantity <= 0 || price <= 0) {
      alert("Quantity and Price must be positive numbers.");
      return;
    }

    const newTx = {
      id: Date.now().toString(),
      type,
      symbol: symbol.trim().toUpperCase(),
      quantity,
      price,
      date
    };

    const updated = [newTx, ...transactions];
    saveTransactions(updated);

    // Reset fields
    setQuantity(10);
    setPrice(100);
    setShowAddForm(false);
  };

  const handleDeleteTransaction = (id) => {
    if (window.confirm("Are you sure you want to delete this transaction record?")) {
      const updated = transactions.filter(t => t.id !== id);
      saveTransactions(updated);
    }
  };

  const handleClearAllTransactions = () => {
    if (window.confirm("CRITICAL WARNING: This will permanently delete ALL logged transaction records. This cannot be undone. Are you sure you want to proceed?")) {
      saveTransactions([]);
    }
  };

  // ── WACC / Secondary Market Buy Rate Handlers ──
  const handleOpenWaccModal = () => {
    const initialMap = {};
    const customMap = getCustomWaccMap(userId);
    
    // Gather all scrips from meroshare profiles and active holdings
    meroshareProfiles.forEach(p => {
      (p.holdings || []).forEach(h => {
        const sym = (h.symbol || '').toUpperCase();
        if (sym && !initialMap[sym]) {
          initialMap[sym] = customMap[sym] || (h.wacc && h.wacc > 0 ? h.wacc : (h.currentLtp || guessScripBasePrice(sym, 100)));
        }
      });
    });
    holdings.forEach(h => {
      const sym = (h.symbol || '').toUpperCase();
      if (sym && !initialMap[sym]) {
        initialMap[sym] = customMap[sym] || (h.wacc && h.wacc > 0 ? h.wacc : (h.currentLtp || guessScripBasePrice(sym, 100)));
      }
    });

    setWaccEditValues(initialMap);
    setShowWaccModal(true);
    setWaccSaveSuccess('');
  };

  const handleAutoSetAllLtp = () => {
    const updated = { ...waccEditValues };
    Object.keys(updated).forEach(sym => {
      const mStock = marketStocks.find(s => (s.symbol || '').toUpperCase() === sym);
      if (mStock?.ltp > 0) {
        updated[sym] = mStock.ltp;
      }
    });
    setWaccEditValues(updated);
    setWaccSaveSuccess('All secondary stock buy rates populated from live market LTPs. Click "Save All" to confirm.');
  };

  const handleAutoSetAllPrevClose = () => {
    const updated = { ...waccEditValues };
    Object.keys(updated).forEach(sym => {
      const mStock = marketStocks.find(s => (s.symbol || '').toUpperCase() === sym);
      const prev = mStock?.prevClose || mStock?.previousClose;
      if (prev > 0) {
        updated[sym] = prev;
      }
    });
    setWaccEditValues(updated);
    setWaccSaveSuccess('All secondary stock buy rates populated from Previous Closing prices. Click "Save All" to confirm.');
  };

  const handleSaveAllWacc = () => {
    const customMap = getCustomWaccMap(userId);
    Object.entries(waccEditValues).forEach(([sym, val]) => {
      const num = parseFloat(val);
      if (!isNaN(num) && num > 0) {
        customMap[sym.toUpperCase()] = Number(num.toFixed(2));
      }
    });
    saveCustomWaccMap(customMap, userId);

    const updatedProfiles = meroshareProfiles.map(p => ({
      ...p,
      holdings: (p.holdings || []).map(h => {
        const sym = (h.symbol || '').toUpperCase();
        const customVal = customMap[sym];
        if (customVal > 0) {
          return { ...h, wacc: customVal, isCustomWacc: true };
        }
        return h;
      })
    }));

    setMeroshareProfiles(updatedProfiles);
    saveProfilesToStorage(updatedProfiles);
    setWaccSaveSuccess('WACC buy rates saved permanently! Portfolio calculations updated.');
    setTimeout(() => {
      setShowWaccModal(false);
      setWaccSaveSuccess('');
    }, 800);
  };

  const handleQuickSaveWacc = (symbol, newRate) => {
    const num = parseFloat(newRate);
    if (isNaN(num) || num <= 0) return;
    const sym = symbol.toUpperCase().trim();
    setScripCustomWacc(sym, num, userId);

    const updatedProfiles = meroshareProfiles.map(p => ({
      ...p,
      holdings: (p.holdings || []).map(h => {
        if ((h.symbol || '').toUpperCase().trim() === sym) {
          return { ...h, wacc: Number(num.toFixed(2)), isCustomWacc: true };
        }
        return h;
      })
    }));

    setMeroshareProfiles(updatedProfiles);
    saveProfilesToStorage(updatedProfiles);
    setEditingScrip(null);
  };

  // ── Unified AI Analyst Engine Integration (Gemini, Groq, Pollinations, local fallback) ──
  const callGroq = async (prompt, apiKey) => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert Nepalese Stock Market (NEPSE) analyst. Always respond in clear Markdown with headers, bullet points, and bold text. Always include an explicit BUY, HOLD, or SELL recommendation.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 1200
      })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.error?.message || `Groq error ${response.status}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  };

  const callGemini = async (prompt, apiKey) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    if (!response.ok) throw new Error(`Gemini error ${response.status}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  };

  const callPollinations = async (prompt) => {
    const response = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          { role: 'system', content: 'You are an expert Nepalese Stock Market (NEPSE) analyst.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!response.ok) throw new Error('Pollinations failed');
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  };

  const getActiveLLMName = () => {
    const activeGlm = localStorage.getItem('nepse_hub_glm_api_key') || glmKey;
    const activeGemini = localStorage.getItem('nepse_hub_gemini_api_key') || geminiKey;
    const activeGroq = localStorage.getItem('nepse_hub_groq_api_key') || groqKey;
    const activePref = localStorage.getItem('nepse_hub_preferred_ai_engine') || preferredEngine;

    if (activePref === 'glm' && activeGlm?.trim()) return 'GLM-4 AI (Active)';
    if (activePref === 'gemini' && activeGemini.trim()) return 'Google Gemini 1.5 Flash';
    if (activePref === 'groq' && activeGroq.trim()) return 'Groq LLaMA 3.3 70B';
    // auto
    if (activeGlm?.trim()) return 'GLM-4 AI (Active)';
    if (activeGemini.trim()) return 'Google Gemini 1.5 Flash';
    if (activeGroq.trim()) return 'Groq LLaMA 3.3 70B';
    return 'Pollinations AI (Free)';
  };

  const callLLM = async (prompt) => {
    const activeGlm = localStorage.getItem('nepse_hub_glm_api_key') || glmKey;
    const activeGemini = localStorage.getItem('nepse_hub_gemini_api_key') || geminiKey;
    const activeGroq = localStorage.getItem('nepse_hub_groq_api_key') || groqKey;
    const activePref = localStorage.getItem('nepse_hub_preferred_ai_engine') || preferredEngine;

    const engines = [];
    if (activePref === 'glm') {
      engines.push({ name: 'glm', call: () => callGlmAi(prompt, undefined, activeGlm?.trim()), key: activeGlm, label: 'GLM-4 AI' });
      engines.push({ name: 'gemini', call: () => callGemini(prompt, activeGemini.trim()), key: activeGemini, label: 'Google Gemini 1.5 Flash' });
      engines.push({ name: 'groq', call: () => callGroq(prompt, activeGroq.trim()), key: activeGroq, label: 'Groq LLaMA 3.3 70B' });
    } else if (activePref === 'gemini') {
      engines.push({ name: 'gemini', call: () => callGemini(prompt, activeGemini.trim()), key: activeGemini, label: 'Google Gemini 1.5 Flash' });
      engines.push({ name: 'glm', call: () => callGlmAi(prompt, undefined, activeGlm?.trim()), key: activeGlm, label: 'GLM-4 AI' });
      engines.push({ name: 'groq', call: () => callGroq(prompt, activeGroq.trim()), key: activeGroq, label: 'Groq LLaMA 3.3 70B' });
    } else if (activePref === 'groq') {
      engines.push({ name: 'groq', call: () => callGroq(prompt, activeGroq.trim()), key: activeGroq, label: 'Groq LLaMA 3.3 70B' });
      engines.push({ name: 'glm', call: () => callGlmAi(prompt, undefined, activeGlm?.trim()), key: activeGlm, label: 'GLM-4 AI' });
      engines.push({ name: 'gemini', call: () => callGemini(prompt, activeGemini.trim()), key: activeGemini, label: 'Google Gemini 1.5 Flash' });
    } else { // auto
      if (activeGlm?.trim()) {
        engines.push({ name: 'glm', call: () => callGlmAi(prompt, undefined, activeGlm.trim()), key: activeGlm, label: 'GLM-4 AI' });
      }
      if (activeGemini.trim()) {
        engines.push({ name: 'gemini', call: () => callGemini(prompt, activeGemini.trim()), key: activeGemini, label: 'Google Gemini 1.5 Flash' });
      }
      if (activeGroq.trim()) {
        engines.push({ name: 'groq', call: () => callGroq(prompt, activeGroq.trim()), key: activeGroq, label: 'Groq LLaMA 3.3 70B' });
      }
      if (!activeGlm?.trim() && !activeGemini.trim() && !activeGroq.trim()) {
        engines.push({ name: 'glm', call: () => callGlmAi(prompt, undefined, DEFAULT_AI_KEY), key: DEFAULT_AI_KEY, label: 'GLM-4 AI' });
        engines.push({ name: 'gemini', call: () => callGemini(prompt, activeGemini.trim()), key: activeGemini, label: 'Google Gemini 1.5 Flash' });
        engines.push({ name: 'groq', call: () => callGroq(prompt, activeGroq.trim()), key: activeGroq, label: 'Groq LLaMA 3.3 70B' });
      }
    }

    for (const engine of engines) {
      if (engine.key?.trim()) {
        try {
          const result = await engine.call();
          if (result) return { text: result, source: engine.label };
        } catch (e) {
          console.warn(`${engine.label} failed, trying next:`, e.message);
        }
      }
    }

    try {
      const result = await callPollinations(prompt);
      if (result) return { text: result, source: 'Pollinations AI (Free)' };
    } catch (e) {
      console.warn('Pollinations failed:', e.message);
    }

    return { text: null, source: 'Local Heuristic' };
  };

  const getLocalPortfolioHeuristics = (holdings) => {
    let text = "### 📊 NEPSE Hub Local Offline Analysis\n\n";
    text += "Your online AI APIs are currently offline or keys are not configured. Here is the local heuristic evaluation of your portfolio:\n\n";
    holdings.forEach(h => {
      const isProfit = h.profitLoss >= 0;
      text += `* **${h.symbol}**: ${h.units} shares. cost base: Rs. ${Number(h.wacc || 0).toFixed(2)}, current: Rs. ${h.currentPrice}. Return: **${isProfit ? '+' : ''}${Number(h.plPercent || 0).toFixed(2)}%**.\n`;
      if (h.plPercent < -15) {
        text += `  - *Verdict*: **ACCUMULATE / AVERAGE DOWN**. You are at a significant loss. If fundamentals are intact, buying more will lower WACC.\n`;
      } else if (h.plPercent > 20) {
        text += `  - *Verdict*: **PARTIAL TAKE PROFIT**. Sitting on a substantial gain. Consider locking in some profit to secure capital.\n`;
      } else {
        text += `  - *Verdict*: **HOLD**. Standard fluctuations. Monitor sector trends and daily volume.\n`;
      }
    });
    return text;
  };

  const getLocalStockHeuristics = (holding, mStock) => {
    let text = `### 📊 NEPSE Hub Local Analysis — ${holding.symbol}\n\n`;
    text += `* **Average Buying Price (WACC)**: Rs. ${Number(holding.wacc || 0).toFixed(2)}\n`;
    text += `* **Last Traded Price (LTP)**: Rs. ${mStock.ltp} (${mStock.pChange >= 0 ? '+' : ''}${mStock.pChange}%)\n`;
    text += `* **Technical Status**:\n`;
    if (mStock.rsi < 35) {
      text += `  - **RSI (14)**: ${Number(mStock.rsi || 0).toFixed(2)} (Oversold 🟢). Strong buying interest expected soon.\n`;
      text += `  - **Verdict**: **BUY / AVERAGE DOWN**. Highly favorable risk-to-reward ratio.\n`;
    } else if (mStock.rsi > 70) {
      text += `  - **RSI (14)**: ${Number(mStock.rsi || 0).toFixed(2)} (Overbought 🔴). Price is saturated.\n`;
      text += `  - **Verdict**: **SELL / TAKE PROFIT**. Expect short-term pullbacks.\n`;
    } else {
      text += `  - **RSI (14)**: ${Number(mStock.rsi || 0).toFixed(2)} (Neutral ⚪). Consolidation phase.\n`;
      text += `  - **Verdict**: **HOLD**. Stable trend.\n`;
    }
    return text;
  };

  const handleAnalyzePortfolio = async () => {
    if (holdings.length === 0) {
      alert("Your portfolio is empty! Add some transactions or sync MeroShare first.");
      return;
    }

    setSelectedAiStock(null);
    setAiLoading(true);
    setAiResult('');
    setShowAiModal(true);
    
    // Construct Prompt
    let prompt = "You are a professional Nepalese stock market technical analyst. Analyze my current stock portfolio and give a concise Buy, Sell, or Hold recommendation for each stock based on my WACC vs LTP. Give a short 1-sentence reasoning for each. Here is my portfolio:\n\n";
    holdings.forEach(h => {
      prompt += `- ${h.symbol}: ${h.units} units @ WACC Rs. ${Number(h.wacc || 0).toFixed(2)}, Current LTP: Rs. ${h.currentPrice}, P/L: ${Number(h.plPercent || 0).toFixed(2)}%\n`;
    });
    prompt += "\nFormat your response cleanly with markdown. Use bullet points.";

    try {
      const { text, source } = await callLLM(prompt);
      if (text) {
        setAiResult(text + `\n\n---\n*Analysis engine: ${source}*`);
      } else {
        setAiResult(getLocalPortfolioHeuristics(holdings));
      }
    } catch (err) {
      console.error('[AI Portfolio Analysis] Error:', err.message);
      setAiResult(`Analysis failed: ${err.message}. Please check your internet connection or API keys.`);
    }
    setAiLoading(false);
  };

  const handleAnalyzeSingleStock = async (holding) => {
    const mStock = marketStocks.find(s => s.symbol === holding.symbol);
    if (!mStock) {
       alert(`Live data for ${holding.symbol} is currently unavailable.`);
       return;
    }
    
    setSelectedAiStock(holding);
    setAiLoading(true);
    setAiResult('');
    setShowAiModal(true);
    
    const prompt = `You are a Tier-1 institutional quantitative analyst specializing exclusively in the Nepal Stock Exchange (NEPSE). You have deep knowledge of Nepal's macroeconomic policies, SEBON regulations, and Nepalese investor psychology.

Analyze this specific stock from my portfolio:
## Stock: ${mStock.name || mStock.symbol} (${mStock.symbol})

### My Portfolio Context:
- **Holdings**: ${holding.units} units
- **WACC (Average Buy Price)**: NPR ${Number(holding.wacc || 0).toFixed(2)}
- **Current P/L**: ${Number(holding.plPercent || 0).toFixed(2)}%

### Live Market Data:
- Sector: ${mStock.sector}
- Last Traded Price (LTP): NPR ${mStock.ltp} (${mStock.pChange > 0 ? '+' : ''}${mStock.pChange}%)
- 52W Range: NPR ${mStock.low52w} - NPR ${mStock.high52w}
- Fundamentals: EPS ${mStock.eps}, P/E ${mStock.pe}, Book Value NPR ${mStock.bookValue}
- Technicals: RSI(14) ${mStock.rsi}, MACD (${mStock.macd?.line} / Signal: ${mStock.macd?.signal})
- Moving Averages: 20EMA(NPR ${mStock.ema20}), 50EMA(NPR ${mStock.ema50})

Based on this data, provide a robust analysis using this exact markdown structure:

### 1. 🏆 Ultimate Verdict
(Must clearly state **STRONG BUY**, **BUY**, **HOLD**, **SELL**, or **STRONG SELL** based on my specific WACC of NPR ${Number(holding.wacc || 0).toFixed(2)}. Should I average down, take profit, or hold? Provide a target price and stop-loss.)

### 2. 📊 Technical & Order Flow Analysis
(Analyze RSI, MACD, and EMAs. Detect any Smart Money Concepts like Fair Value Gaps (FVG) or Liquidity Sweeps based on price action.)

### 3. 🏢 Fundamental Health
(Evaluate the EPS, P/E, and Book Value. Is it overvalued compared to the sector?)

### 4. 🇳🇵 Macro & Political Influences
(How do current Nepal Rastra Bank (NRB) policies or political shifts impact this sector?)`;

    try {
      const { text, source } = await callLLM(prompt);
      if (text) {
        setAiResult(text + `\n\n---\n*Analysis engine: ${source}*`);
      } else {
        setAiResult(getLocalStockHeuristics(holding, mStock));
      }
    } catch (err) {
      console.error('[AI Single Stock Analysis] Error:', err.message);
      setAiResult(`Analysis failed: ${err.message}. Please check your internet connection or API keys.`);
    }
    setAiLoading(false);
  };

  // --- Core Calculations ---
  
  const getManualHoldingsRaw = () => {
    const holdingsMap = {};
    const chronologicalTxs = [...transactions].reverse();

    chronologicalTxs.forEach(tx => {
      const sym = tx.symbol.trim().toUpperCase();
      if (!holdingsMap[sym]) {
        holdingsMap[sym] = { symbol: sym, units: 0, totalInvestedCost: 0, wacc: 0 };
      }
      const holding = holdingsMap[sym];

      if (tx.type === 'buy') {
        const details = calculateBuyDetails(tx.quantity, tx.price);
        holding.units += tx.quantity;
        holding.totalInvestedCost += details.totalAmount;
        holding.wacc = holding.units > 0 ? holding.totalInvestedCost / holding.units : 0;
      } else {
        const previousUnits = holding.units;
        holding.units = Math.max(0, holding.units - tx.quantity);
        if (previousUnits > 0) {
          holding.totalInvestedCost = holding.units * holding.wacc;
        } else {
          holding.totalInvestedCost = 0;
        }
      }
    });

    return Object.values(holdingsMap).filter(h => h.units > 0);
  };

  const getMeroshareHoldingsRaw = () => {
    const holdingsMap = {};
    meroshareProfiles.forEach(p => {
      (p.holdings || []).forEach(h => {
        const sym = (h.symbol || '').trim().toUpperCase();
        if (!holdingsMap[sym]) {
          holdingsMap[sym] = {
            symbol: sym,
            name: h.name || sym,
            units: 0,
            totalInvestedCost: 0,
            wacc: 0,
            currentLtp: h.currentLtp || 0,
            prevClose: h.prevClose || 0,
            valueAsOfLTP: 0,
            valueAsOfPrevClose: 0
          };
        }
        holdingsMap[sym].units += (h.units || 0);
        holdingsMap[sym].totalInvestedCost += ((h.units || 0) * (h.wacc || 100));
        if (h.currentLtp > 0) holdingsMap[sym].currentLtp = h.currentLtp;
        if (h.prevClose > 0) holdingsMap[sym].prevClose = h.prevClose;
        if (h.valueAsOfLTP > 0) holdingsMap[sym].valueAsOfLTP += h.valueAsOfLTP;
        if (h.valueAsOfPrevClose > 0) holdingsMap[sym].valueAsOfPrevClose += h.valueAsOfPrevClose;
      });
    });

    return Object.values(holdingsMap).map(h => {
      h.wacc = h.units > 0 ? h.totalInvestedCost / h.units : 100;
      return h;
    }).filter(h => h.units > 0);
  };

  const getConsolidatedHoldingsRaw = (manual, meroshare) => {
    const map = {};
    [...manual, ...meroshare].forEach(h => {
      if (!map[h.symbol]) {
        map[h.symbol] = {
          symbol: h.symbol,
          name: h.name || h.symbol,
          units: 0,
          totalInvestedCost: 0,
          wacc: 0,
          currentLtp: h.currentLtp || 0,
          prevClose: h.prevClose || 0,
          valueAsOfLTP: 0,
          valueAsOfPrevClose: 0
        };
      }
      map[h.symbol].units += h.units;
      map[h.symbol].totalInvestedCost += h.totalInvestedCost;
      if (h.currentLtp > 0) map[h.symbol].currentLtp = h.currentLtp;
      if (h.prevClose > 0) map[h.symbol].prevClose = h.prevClose;
      if (h.valueAsOfLTP > 0) map[h.symbol].valueAsOfLTP += h.valueAsOfLTP;
      if (h.valueAsOfPrevClose > 0) map[h.symbol].valueAsOfPrevClose += h.valueAsOfPrevClose;
    });
    return Object.values(map).map(h => {
      h.wacc = h.units > 0 ? h.totalInvestedCost / h.units : 100;
      return h;
    }).filter(h => h.units > 0);
  };

  const manualRaw = getManualHoldingsRaw();
  const meroshareRaw = getMeroshareHoldingsRaw();
  
  let activeRaw = [];
  if (activeView === 'manual') activeRaw = manualRaw;
  else if (activeView === 'meroshare') activeRaw = meroshareRaw;
  else activeRaw = getConsolidatedHoldingsRaw(manualRaw, meroshareRaw);

  const resolveScripValuation = (h, mode = valuationMode) => {
    const safeSym = (h.symbol || '').trim().toUpperCase();
    const marketStock = marketStocks.find(s => (s.symbol || '').trim().toUpperCase() === safeSym);
    const base = guessScripBasePrice(safeSym, h.wacc);

    const prevClosePrice = h.prevClose > 0 ? h.prevClose : (h.valueAsOfPrevClose > 0 && h.units > 0 ? (h.valueAsOfPrevClose / h.units) : (h.currentLtp || base));
    const ltpPrice = h.currentLtp > 0 ? h.currentLtp : (h.valueAsOfLTP > 0 && h.units > 0 ? (h.valueAsOfLTP / h.units) : (h.prevClose || base));
    const livePrice = (marketStock && marketStock.ltp > 0) ? marketStock.ltp : ltpPrice;

    if (mode === 'prevClose') {
      const val = h.valueAsOfPrevClose > 0 ? h.valueAsOfPrevClose : Number((h.units * prevClosePrice).toFixed(2));
      return { price: prevClosePrice, value: val };
    } else if (mode === 'ltp') {
      const val = h.valueAsOfLTP > 0 ? h.valueAsOfLTP : Number((h.units * ltpPrice).toFixed(2));
      return { price: ltpPrice, value: val };
    } else {
      const val = Number((h.units * livePrice).toFixed(2));
      return { price: livePrice, value: val };
    }
  };

  const holdings = activeRaw.map(h => {
    const safeSym = (h.symbol || '').trim().toUpperCase();
    const marketStock = marketStocks.find(s => (s.symbol || '').trim().toUpperCase() === safeSym);
    const { price: effectivePrice, value: currentValue } = resolveScripValuation(h, valuationMode);
    const profitLoss = currentValue - h.totalInvestedCost;
    const plPercent = h.totalInvestedCost > 0 ? (profitLoss / h.totalInvestedCost) * 100 : 0;

    return {
      ...h,
      currentPrice: effectivePrice,
      currentValue,
      profitLoss,
      plPercent,
      stockChange: marketStock?.change || 0,
      stockPchange: marketStock?.pChange || 0
    };
  });

  // Aggregate Portfolio totals
  const totalCost = holdings.reduce((sum, h) => sum + h.totalInvestedCost, 0);
  const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalPL = totalValue - totalCost;
  const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

  const totalMeroshareLtp = meroshareProfiles.reduce((acc, p) => {
    return acc + (p.holdings || []).reduce((sum, h) => sum + (h.valueAsOfLTP > 0 ? h.valueAsOfLTP : (h.units * (h.currentLtp || h.prevClose || guessScripBasePrice(h.symbol, h.wacc)))), 0);
  }, 0);

  const totalMerosharePrevClose = meroshareProfiles.reduce((acc, p) => {
    return acc + (p.holdings || []).reduce((sum, h) => sum + (h.valueAsOfPrevClose > 0 ? h.valueAsOfPrevClose : (h.units * (h.prevClose || h.currentLtp || guessScripBasePrice(h.symbol, h.wacc)))), 0);
  }, 0);

  const totalLiveVal = meroshareProfiles.reduce((acc, p) => {
    return acc + (p.holdings || []).reduce((sum, h) => {
      const safeSym = (h.symbol || '').trim().toUpperCase();
      const marketStock = marketStocks.find(s => (s.symbol || '').trim().toUpperCase() === safeSym);
      const lp = (marketStock && marketStock.ltp > 0) ? marketStock.ltp : (h.currentLtp || h.prevClose || guessScripBasePrice(safeSym, h.wacc));
      return sum + (h.units * lp);
    }, 0);
  }, 0);

  // Prepare allocation chart data
  const sortedHoldings = [...holdings].sort((a, b) => b.currentValue - a.currentValue);
  const stockChartHoldings = [];
  let otherSum = 0;
  sortedHoldings.forEach((h, idx) => {
    if (idx < 5) {
      stockChartHoldings.push({ symbol: h.symbol, value: h.currentValue });
    } else {
      otherSum += h.currentValue;
    }
  });
  if (otherSum > 0) {
    stockChartHoldings.push({ symbol: 'Others', value: otherSum });
  }

  const sectorHoldingsMap = {};
  holdings.forEach(h => {
    const marketStock = marketStocks.find(s => (s.symbol || '').trim().toUpperCase() === h.symbol) || {};
    let sector = marketStock.sector || 'Others';
    if (sector.length > 20) sector = sector.substring(0, 20) + '...';
    sectorHoldingsMap[sector] = (sectorHoldingsMap[sector] || 0) + h.currentValue;
  });
  const sectorChartHoldings = Object.entries(sectorHoldingsMap)
    .map(([sector, value]) => ({ symbol: sector, value }))
    .sort((a,b) => b.value - a.value);

  const chartHoldings = allocationView === 'stock' ? stockChartHoldings : sectorChartHoldings;

  const formatRs = (value) => {
    return new Intl.NumberFormat('en-NP', {
      style: 'currency',
      currency: 'NPR',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1
    }).format(value).replace('NPR', 'Rs.');
  };

  const getProcessedHoldings = (rawHoldings) => {
    return rawHoldings.map(h => {
      const safeSym = (h.symbol || '').trim().toUpperCase();
      const marketStock = marketStocks.find(s => (s.symbol || '').trim().toUpperCase() === safeSym);
      const { price: effectivePrice, value: currentValue } = resolveScripValuation(h, valuationMode);
      const totalCost = h.totalInvestedCost || (h.units * (h.wacc || 100));
      const profitLoss = currentValue - totalCost;
      const plPercent = totalCost > 0 ? (profitLoss / totalCost) * 100 : 0;
      return {
        ...h,
        currentPrice: effectivePrice,
        currentValue,
        profitLoss,
        plPercent,
        stockChange: marketStock?.change || 0,
        stockPchange: marketStock?.pChange || 0
      };
    }).filter(h => h.units > 0);
  };

  const renderHoldingRow = (h) => {
    const isProfit = h.profitLoss >= 0;
    return (
      <div key={h.symbol} className="card-sm" style={{ 
        padding: '10px 12px', 
        marginBottom: 0,
        background: isProfit ? 'var(--bull-subtle)' : 'var(--bear-subtle)',
        borderColor: isProfit ? 'rgba(16,217,138,0.18)' : 'rgba(245,69,92,0.18)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 'var(--radius-md)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)' }}>{h.symbol}</div>
            <div style={{ fontSize: 9.5, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
              <span>{h.units} Units @ {formatRs(h.currentPrice)}</span>
              <span>•</span>
              <span>WACC: <strong style={{ color: (h.isCustomWacc || h.wacc !== 100) ? 'var(--text-primary)' : '#fbbf24', fontFamily: 'var(--font-mono)' }}>{formatRs(h.wacc)}</strong></span>
              <button 
                type="button"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setEditingScrip(h.symbol); 
                  setQuickWaccInput(String(h.wacc || '')); 
                }}
                style={{ 
                  background: h.wacc === 100 ? 'rgba(234,179,8,0.15)' : 'rgba(255,255,255,0.06)', 
                  border: h.wacc === 100 ? '1px solid rgba(234,179,8,0.4)' : '1px solid rgba(255,255,255,0.1)', 
                  color: h.wacc === 100 ? '#fbbf24' : 'var(--text-secondary)', 
                  borderRadius: 4, 
                  padding: '1px 5px', 
                  fontSize: 8.5, 
                  cursor: 'pointer', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: 3, 
                  fontWeight: 700 
                }}
                title="Edit your real purchase rate / WACC"
              >
                <Edit3 style={{ width: 9, height: 9 }} /> {h.wacc === 100 ? 'Fix Secondary WACC' : 'Edit'}
              </button>
            </div>

            {/* Inline Quick WACC Edit Box */}
            {editingScrip === h.symbol && (
              <div 
                onClick={e => e.stopPropagation()} 
                style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.5)', padding: '4px 8px', borderRadius: 6, border: '1px solid var(--primary-light)' }}
              >
                <span style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>Buy Rate: Rs.</span>
                <input 
                  type="number" 
                  step="0.01" 
                  autoFocus 
                  value={quickWaccInput} 
                  onChange={e => setQuickWaccInput(e.target.value)} 
                  placeholder="e.g. 350"
                  style={{ width: 75, height: 24, fontSize: 11, padding: '0 6px', background: '#0d1117', border: '1px solid var(--border)', borderRadius: 4, color: '#fff', fontFamily: 'var(--font-mono)' }} 
                />
                <button 
                  type="button" 
                  onClick={() => handleQuickSaveWacc(h.symbol, quickWaccInput)} 
                  className="btn-primary btn-xs" 
                  style={{ padding: '2px 8px', fontSize: 9.5, height: 24 }}
                >
                  Save
                </button>
                <button 
                  type="button" 
                  onClick={() => setEditingScrip(null)} 
                  className="btn-secondary btn-xs" 
                  style={{ padding: '2px 6px', fontSize: 9.5, height: 24 }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatRs(h.currentValue)}</div>
            <div style={{ fontSize: 9.5, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, color: isProfit ? 'var(--bull)' : 'var(--bear)' }}>
              {isProfit ? '+' : ''}{Number(h.plPercent || 0).toFixed(2)}% ({formatRs(h.profitLoss)})
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); handleAnalyzeSingleStock(h); }}
              className="btn-secondary btn-xs"
              style={{ marginTop: 6, fontSize: 8.5, padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'rgba(168,85,247,0.1)', borderColor: 'rgba(168,85,247,0.3)', color: '#d8b4fe' }}
            >
              <Sparkles style={{ width: 10, height: 10 }} /> Analyze
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ padding: 16 }}>
      
      {/* Portfolio source view toggles */}
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button 
          onClick={() => setActiveView('consolidated')}
          className={`tab-btn ${activeView === 'consolidated' ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '8px 0' }}
        >
          <Layers style={{ width: 14, height: 14 }} /> Consolidated
        </button>
        <button 
          onClick={() => setActiveView('meroshare')}
          className={`tab-btn ${activeView === 'meroshare' ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '8px 0' }}
        >
          <ShieldCheck style={{ width: 14, height: 14 }} /> MeroShare
        </button>
        <button 
          onClick={() => setActiveView('manual')}
          className={`tab-btn ${activeView === 'manual' ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '8px 0' }}
        >
          <BookOpen style={{ width: 14, height: 14 }} /> Manual Ledger
        </button>
      </div>

      {/* Portfolio overview card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 0 }}>
            <Briefcase style={{ width: 16, height: 16 }} /> {activeView === 'consolidated' ? 'Total Net Worth' : activeView === 'meroshare' ? 'MeroShare Net Worth' : 'Ledger Net Worth'}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button 
              onClick={() => setShowAiModal(true)}
              className="btn-secondary btn-xs"
              style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'linear-gradient(90deg, rgba(91,94,244,0.1) 0%, rgba(168,85,247,0.1) 100%)', borderColor: 'rgba(168,85,247,0.3)', color: '#d8b4fe' }}
            >
              <Sparkles style={{ width: 14, height: 14 }} /> AI Analyst
            </button>
            {activeView !== 'meroshare' && (
              <button 
                onClick={() => setShowAddForm(!showAddForm)}
                className="btn-primary btn-xs"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <Plus style={{ width: 14, height: 14 }} /> Add Transaction
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
              {formatRs(totalValue)}
            </div>
            <div style={{ fontSize: 10, color: valuationMode === 'prevClose' ? 'var(--bull)' : valuationMode === 'ltp' ? '#38bdf8' : '#a855f7', fontWeight: 700, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: valuationMode === 'prevClose' ? 'var(--bull)' : valuationMode === 'ltp' ? '#38bdf8' : '#a855f7' }}></span>
              Current Mode: {valuationMode === 'prevClose' ? 'MeroShare Official (Previous Close)' : valuationMode === 'ltp' ? 'MeroShare Official (LTP)' : 'Live NEPSE Market'}
            </div>
          </div>
        </div>

        {/* 3-Way Valuation Mode Switcher */}
        <div style={{ display: 'flex', gap: 4, margin: '10px 0 10px', background: 'rgba(255,255,255,0.04)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setValuationMode('prevClose')}
            style={{
              flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 800, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: valuationMode === 'prevClose' ? 'var(--bull)' : 'transparent',
              color: valuationMode === 'prevClose' ? '#0a1914' : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}
          >
            MeroShare Prev Close
          </button>
          <button
            type="button"
            onClick={() => setValuationMode('ltp')}
            style={{
              flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 800, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: valuationMode === 'ltp' ? '#38bdf8' : 'transparent',
              color: valuationMode === 'ltp' ? '#0a1914' : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}
          >
            MeroShare LTP
          </button>
          <button
            type="button"
            onClick={() => setValuationMode('live')}
            style={{
              flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 800, borderRadius: 6, border: 'none', cursor: 'pointer',
              background: valuationMode === 'live' ? 'var(--primary)' : 'transparent',
              color: valuationMode === 'live' ? '#ffffff' : 'var(--text-muted)',
              transition: 'all 0.15s'
            }}
          >
            Live NEPSE
          </button>
        </div>

        {/* Side-by-side comparison of all 3 standards */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px', marginBottom: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>MeroShare Prev Close: </span>
            <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', display: 'block', marginTop: 1 }}>{formatRs(totalMerosharePrevClose)}</strong>
          </div>
          <div>
            <span style={{ color: 'var(--text-muted)' }}>MeroShare LTP: </span>
            <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', display: 'block', marginTop: 1 }}>{formatRs(totalMeroshareLtp)}</strong>
          </div>
          <div style={{ gridColumn: 'span 2', borderTop: '1px dashed rgba(255,255,255,0.06)', paddingTop: 5, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Live Market Valuation: </span>
            <strong style={{ color: 'var(--primary-light)', fontFamily: 'var(--font-mono)' }}>{formatRs(totalLiveVal)}</strong>
          </div>
        </div>

        {/* Helpful Explanation Note */}
        <div style={{ fontSize: 9.5, color: 'var(--text-muted)', background: 'rgba(56,189,248,0.05)', border: '1px solid rgba(56,189,248,0.12)', borderRadius: 6, padding: '6px 8px', marginBottom: 12, lineHeight: 1.4 }}>
          💡 <strong>Tip:</strong> Official MeroShare web portal (<em>meroshare.cdsc.com.np</em>) defaults to <strong>Previous Closing Price</strong>. If matching your web MeroShare account total, ensure <strong>MeroShare Prev Close</strong> is active.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Invested Capital</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>{formatRs(totalCost)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>Total Profit / Loss</div>
            <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 2, color: totalPL >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
              {totalPL >= 0 ? <ArrowUpRight style={{ width: 14, height: 14 }} /> : <ArrowDownRight style={{ width: 14, height: 14 }} />}
              {totalPL >= 0 ? '+' : ''}{Number(totalPLPercent || 0).toFixed(2)}% ({formatRs(Math.abs(totalPL))})
            </div>
          </div>
        </div>
      </div>

      {/* Allocation breakdown chart */}
      {holdings.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>Portfolio Allocation</h3>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '20px', padding: 2 }}>
              <button 
                onClick={() => setAllocationView('stock')}
                style={{ background: allocationView === 'stock' ? 'var(--primary-light)' : 'transparent', color: allocationView === 'stock' ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: '20px', padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: '0.2s' }}>
                Stock
              </button>
              <button 
                onClick={() => setAllocationView('sector')}
                style={{ background: allocationView === 'sector' ? 'var(--primary-light)' : 'transparent', color: allocationView === 'sector' ? '#fff' : 'var(--text-muted)', border: 'none', borderRadius: '20px', padding: '4px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: '0.2s' }}>
                Sector
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, padding: '4px 8px' }}>
            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="45" fill="transparent" stroke="rgba(255,255,255,0.03)" strokeWidth="12" />
                {(() => {
                  let cumulativeOffset = 0;
                  const radius = 45;
                  const circumference = 2 * Math.PI * radius; // ~282.74
                  const colors = ['#5b5ef4', '#06b6d4', '#a855f7', '#f59e0b', '#10d98a', '#8b92a8'];
                  
                  return chartHoldings.map((ch, idx) => {
                    const pct = ch.value / (totalValue || 1);
                    const strokeLength = pct * circumference;
                    const offset = cumulativeOffset;
                    cumulativeOffset += strokeLength;
                    return (
                      <circle
                        key={ch.symbol}
                        cx="60"
                        cy="60"
                        r={radius}
                        fill="transparent"
                        stroke={colors[idx % colors.length]}
                        strokeWidth="12"
                        strokeDasharray={`${strokeLength} ${circumference}`}
                        strokeDashoffset={-offset}
                        transform="rotate(-90 60 60)"
                        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                      />
                    );
                  });
                })()}
              </svg>
              <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase' }}>{allocationView === 'stock' ? 'Assets' : 'Sectors'}</span>
                <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{chartHoldings.length}</span>
              </div>
            </div>

            {/* Side Legend */}
            {(() => {
              const colors = ['#5b5ef4', '#06b6d4', '#a855f7', '#f59e0b', '#10d98a', '#8b92a8'];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  {chartHoldings.map((ch, idx) => {
                    const pct = (ch.value / (totalValue || 1)) * 100;
                    return (
                      <div key={ch.symbol} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: colors[idx % colors.length], display: 'inline-block' }}></span>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{ch.symbol}</span>
                        </div>
                        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{Number(pct || 0).toFixed(2)}%</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Transaction input form */}
      {showAddForm && activeView !== 'meroshare' && (
        <form onSubmit={handleAddTransaction} className="card" style={{ marginBottom: 16 }}>
          <h3 className="section-title" style={{ marginBottom: 12 }}>Log Buy/Sell Transaction</h3>

          <div className="tab-bar" style={{ marginBottom: 12 }}>
            <button 
              type="button" 
              onClick={() => setType('buy')}
              className={`tab-btn ${type === 'buy' ? 'active' : ''}`}
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, background: type === 'buy' ? 'var(--primary)' : '' }}
            >
              <PlusCircle style={{ width: 14, height: 14 }} /> BUY
            </button>
            <button 
              type="button" 
              onClick={() => setType('sell')}
              className={`tab-btn ${type === 'sell' ? 'active' : ''}`}
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, background: type === 'sell' ? 'var(--bear)' : '', boxShadow: type === 'sell' ? '0 2px 12px var(--bear-glow)' : '' }}
            >
              <MinusCircle style={{ width: 14, height: 14 }} /> SELL
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            <div>
              <label className="input-label">Stock Symbol</label>
              <input 
                list="portfolio-stocks-list"
                value={symbol} 
                onChange={e => setSymbol(e.target.value)} 
                className="input"
                placeholder="Search symbol or name..."
              />
              <datalist id="portfolio-stocks-list">
                {marketStocks.map(s => (
                  <option key={s.symbol} value={s.symbol}>{s.name !== s.symbol ? `${s.name} (${s.symbol})` : s.symbol}</option>
                ))}
              </datalist>
            </div>
            <div>
              <label className="input-label">Date</label>
              <input type="date" required value={date} onChange={e => setDate(e.target.value)} className="input" />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            <div>
              <label className="input-label">Quantity</label>
              <input type="number" required value={quantity} onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} className="input" />
            </div>
            <div>
              <label className="input-label">Price per Share (Rs.)</label>
              <input type="number" step="0.01" required value={price} onChange={e => setPrice(Math.max(0.1, parseFloat(e.target.value) || 0))} className="input" />
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '10px 0' }}>Add to Ledger</button>
        </form>
      )}

      {/* Holdings List — Separated by Account */}
      {(manualRaw.length > 0 || meroshareProfiles.some(p => p.holdings && p.holdings.length > 0)) && (
        <div style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="section-title" style={{ marginBottom: 0 }}>Active Demat Accounts & Ledgers</h3>
            <button
              type="button"
              onClick={handleOpenWaccModal}
              className="btn-secondary btn-xs"
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(234,179,8,0.12)', borderColor: 'rgba(234,179,8,0.3)', color: '#fbbf24', fontSize: 10.5, fontWeight: 800, padding: '5px 10px', borderRadius: 'var(--radius-sm)' }}
            >
              <Edit3 style={{ width: 12, height: 12 }} /> Manage All WACCs
            </button>
          </div>

          {/* 1. Manual Ledger Holdings (Shown if manual ledger selected or consolidated) */}
          {(activeView === 'manual' || activeView === 'consolidated') && manualRaw.length > 0 && (
            <div className="card" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
                <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                  <BookOpen style={{ width: 14, height: 14 }} /> Manual Ledger Portfolio
                </h3>
                {(() => {
                  const processed = getProcessedHoldings(manualRaw);
                  const subCost = processed.reduce((sum, h) => sum + h.units * h.wacc, 0);
                  const subValue = processed.reduce((sum, h) => sum + h.currentValue, 0);
                  const subPL = subValue - subCost;
                  const subPLPct = subCost > 0 ? (subPL / subCost) * 100 : 0;
                  return (
                    <span style={{ fontSize: 10, fontWeight: 'bold', color: subPL >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                      {formatRs(subValue)} ({subPL >= 0 ? '+' : ''}{Number(subPLPct || 0).toFixed(2)}%)
                    </span>
                  );
                })()}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {getProcessedHoldings(manualRaw).map(h => renderHoldingRow(h))}
              </div>
            </div>
          )}

          {/* 2. MeroShare Holdings — Separated by Account */}
          {(activeView === 'meroshare' || activeView === 'consolidated') && meroshareProfiles.map(p => {
            const rawHoldings = p.holdings || [];
            if (rawHoldings.length === 0) return null;
            const processed = getProcessedHoldings(rawHoldings);
            const subCost = processed.reduce((sum, h) => sum + (h.units * (h.wacc || 100)), 0);
            const subCloseValue = rawHoldings.reduce((sum, h) => sum + (h.valueAsOfPrevClose > 0 ? h.valueAsOfPrevClose : (h.units * (h.prevClose || h.currentLtp || guessScripBasePrice(h.symbol, h.wacc)))), 0);
            const subLtpValue = rawHoldings.reduce((sum, h) => sum + (h.valueAsOfLTP > 0 ? h.valueAsOfLTP : (h.units * (h.currentLtp || h.prevClose || guessScripBasePrice(h.symbol, h.wacc)))), 0);
            const subValue = processed.reduce((sum, h) => sum + h.currentValue, 0);
            const subPL = subValue - subCost;
            const subPLPct = subCost > 0 ? (subPL / subCost) * 100 : 0;

            return (
              <div key={p.id} className="card" style={{ background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border)', padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>
                  <div style={{ textAlign: 'left' }}>
                    <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                      <ShieldCheck style={{ width: 14, height: 14, color: 'var(--bull)' }} /> {p.name}
                    </h3>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>BOID: {p.boid}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 12, fontWeight: 900, display: 'block', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatRs(subValue)}</span>
                      <span style={{ fontSize: 8.5, color: 'var(--text-muted)', display: 'block' }}>
                        Prev Close: {formatRs(subCloseValue)} • LTP: {formatRs(subLtpValue)}
                      </span>
                      <span style={{ fontSize: 9.5, fontWeight: 'bold', color: subPL >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                        {subPL >= 0 ? '+' : ''}{Number(subPLPct || 0).toFixed(2)}% ({formatRs(subPL)})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRetrievePortfolio(p.id)}
                      disabled={isRetrieving}
                      title="Pull Live MeroShare Holdings"
                      className="btn-secondary btn-xs"
                      style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, borderRadius: 'var(--radius-sm)' }}
                    >
                      <RefreshCw style={{ width: 11, height: 11 }} className={isRetrieving ? 'animate-spin' : ''} />
                      Sync
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {processed.map(h => renderHoldingRow(h))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Ledger list (Only show if in Manual or Consolidated view) */}
      {(activeView === 'manual' || activeView === 'consolidated') && (
        transactions.length > 0 ? (
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 className="section-title" style={{ marginBottom: 0 }}>Transaction Log Ledger</h3>
              <button
                type="button"
                onClick={handleClearAllTransactions}
                className="btn btn-bear btn-xs"
                style={{ padding: '4px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, height: 'auto', background: 'linear-gradient(135deg, #be123c, var(--bear))' }}
              >
                <Trash2 style={{ width: 11, height: 11 }} /> Clear All
              </button>
            </div>
            <div style={{ maxHeight: 180, overflowY: 'auto', paddingRight: 4 }}>
              {transactions.map((tx, i) => (
                <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i === transactions.length - 1 ? 'none' : '1px solid var(--border)', paddingTop: i === 0 ? 0 : 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className={`badge ${tx.type === 'buy' ? 'badge-bull' : 'badge-bear'}`} style={{ marginRight: 10 }}>
                      {tx.type.toUpperCase()}
                    </span>
                    <div>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-primary)', fontSize: 13 }}>{tx.symbol}</span>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{tx.quantity} units @ {formatRs(tx.price)} • {tx.date}</div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteTransaction(tx.id)} className="icon-btn" style={{ width: 28, height: 28 }}>
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          holdings.length === 0 && !showAddForm && (
            <div style={{ textAlign: 'center', padding: '32px 0', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
              <Briefcase style={{ width: 32, height: 32, color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Your manual transaction ledger is empty.</p>
              <button onClick={() => setShowAddForm(true)} className="btn-secondary btn-sm">Add First Trade</button>
            </div>
          )
        )
      )}

      {/* Empty State for MeroShare */}
      {activeView === 'meroshare' && meroshareProfiles.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
          <ShieldCheck style={{ width: 32, height: 32, color: 'var(--text-muted)', margin: '0 auto 8px' }} />
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>No MeroShare accounts linked.</p>
          <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Go to the MeroShare tab to link an account and sync your portfolio.</p>
        </div>
      )}

      {/* AI Analyst Modal */}
      {showAiModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(5,5,15,0.8)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 500, margin: 0, position: 'relative', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setShowAiModal(false)} className="icon-btn" style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}>
              <X style={{ width: 18, height: 18 }} />
            </button>
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, color: '#d8b4fe' }}>
              <Sparkles style={{ width: 16, height: 16 }} /> {selectedAiStock ? `Free AI Stock Analyst (${selectedAiStock.symbol})` : 'Free AI Portfolio Analyst'}
            </h3>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                Get instant fundamental and technical analysis for your {selectedAiStock ? 'stock' : 'portfolio'} using AI models (Gemini / Groq) or the offline heuristic engine.
              </p>

              {/* API Configuration Block */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                
                {/* Engine Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 'bold', color: 'var(--text-muted)' }}>🤖 Preferred AI Engine</label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      { id: 'auto', label: '⚡ Auto' },
                      { id: 'glm', label: '🟣 GLM-4' },
                      { id: 'gemini', label: '🟡 Gemini' },
                      { id: 'groq', label: '🟢 Groq' }
                    ].map(engine => (
                      <button
                        key={engine.id}
                        type="button"
                        onClick={() => {
                          setPreferredEngine(engine.id);
                          localStorage.setItem('nepse_hub_preferred_ai_engine', engine.id);
                        }}
                        style={{
                          flex: 1, padding: '5px 4px', fontSize: 10, fontWeight: 'bold',
                          borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                          background: preferredEngine === engine.id ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                          color: preferredEngine === engine.id ? '#fff' : 'var(--text-muted)',
                          cursor: 'pointer', transition: 'var(--transition)'
                        }}
                      >
                        {engine.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--primary-light)' }}>
                    Active: {getActiveLLMName()}
                  </span>
                  <button 
                    onClick={() => setShowKeyInput(!showKeyInput)} 
                    style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-secondary)', padding: '3px 8px', borderRadius: 4, cursor: 'pointer' }}
                  >
                    {showKeyInput ? 'Hide Keys' : 'Configure Keys'}
                  </button>
                </div>
                
                {showKeyInput && (
                  <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', marginBottom: 2 }}>🟣 GLM-4 / Zhipu API Key (Integrated)</label>
                      <input 
                        type="password" 
                        placeholder="0a3ba... (GLM-4 Key)" 
                        value={glmKey}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGlmKey(val);
                          localStorage.setItem('nepse_hub_glm_api_key', val.trim());
                        }}
                        style={{ width: '100%', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 6, color: '#fff', fontSize: 11 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', marginBottom: 2 }}>🟡 Gemini API Key (AIza... or AQ...)</label>
                      <input 
                        type="password" 
                        placeholder="Paste your Gemini Key..." 
                        value={geminiKey}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGeminiKey(val);
                          localStorage.setItem('nepse_hub_gemini_api_key', val.trim());
                        }}
                        style={{ width: '100%', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 6, color: '#fff', fontSize: 11 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 'bold', display: 'block', marginBottom: 2 }}>🟢 Groq API Key (gsk_...)</label>
                      <input 
                        type="password" 
                        placeholder="Paste your Groq Key..." 
                        value={groqKey}
                        onChange={(e) => {
                          const val = e.target.value;
                          setGroqKey(val);
                          localStorage.setItem('nepse_hub_groq_api_key', val.trim());
                        }}
                        style={{ width: '100%', padding: '6px 10px', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 6, color: '#fff', fontSize: 11 }}
                      />
                    </div>
                  </div>
                )}
              </div>
              
              <button 
                onClick={selectedAiStock ? () => handleAnalyzeSingleStock(selectedAiStock) : handleAnalyzePortfolio}
                disabled={aiLoading}
                className="btn-primary" 
                style={{ width: '100%', padding: '10px 0', marginBottom: 16, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, background: 'linear-gradient(90deg, var(--primary) 0%, #a855f7 100%)', border: 'none', opacity: aiLoading ? 0.7 : 1 }}
              >
                {aiLoading ? <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> : <Sparkles style={{ width: 16, height: 16 }} />}
                {aiLoading ? 'Analyzing...' : 'Run Technical Analysis'}
              </button>

              {aiResult && (
                <div style={{ flex: 1, overflowY: 'auto', background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <SafeMarkdown text={aiResult} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manage All WACCs Modal */}
      {showWaccModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(5,5,15,0.85)', backdropFilter: 'blur(5px)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="card" style={{ width: '100%', maxWidth: 520, margin: 0, maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Edit3 style={{ width: 16, height: 16, color: '#fbbf24' }} /> Manage Buy Prices (WACC)
                </h3>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Set your actual secondary market purchase price for accurate P/L
                </span>
              </div>
              <button onClick={() => setShowWaccModal(false)} className="icon-btn" style={{ width: 28, height: 28 }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 8, padding: '8px 10px', marginBottom: 10, lineHeight: 1.4 }}>
              💡 MeroShare DEMAT sync supplies share units and closing prices, but does not provide purchase rates for secondary market shares (which default to Rs. 100). Enter your true buying prices below or use 1-tap Auto-Fill.
            </div>

            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button
                type="button"
                onClick={handleAutoSetAllLtp}
                style={{
                  flex: 1, padding: '6px 8px', fontSize: 10.5, fontWeight: 800,
                  background: 'rgba(16,217,138,0.12)', border: '1px solid rgba(16,217,138,0.3)',
                  color: 'var(--bull)', borderRadius: 6, cursor: 'pointer'
                }}
              >
                ⚡ Auto-Fill All with LTP
              </button>
              <button
                type="button"
                onClick={handleAutoSetAllPrevClose}
                style={{
                  flex: 1, padding: '6px 8px', fontSize: 10.5, fontWeight: 800,
                  background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)',
                  color: '#818cf8', borderRadius: 6, cursor: 'pointer'
                }}
              >
                ⚡ Auto-Fill with Prev Close
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {Object.keys(waccEditValues).length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
                  No stock holdings found to edit.
                </div>
              ) : (
                Object.entries(waccEditValues).map(([sym, val]) => {
                  const mStock = marketStocks.find(s => (s.symbol || '').toUpperCase() === sym);
                  const ltp = mStock?.ltp || 0;
                  return (
                    <div key={sym} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 12.5, color: 'var(--text-primary)' }}>{sym}</div>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                          LTP: Rs. {ltp > 0 ? ltp : 'N/A'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {ltp > 0 && (
                          <button
                            type="button"
                            onClick={() => setWaccEditValues(prev => ({ ...prev, [sym]: ltp }))}
                            style={{ fontSize: 9, padding: '3px 6px', background: 'rgba(91,94,244,0.15)', border: '1px solid rgba(91,94,244,0.3)', color: 'var(--primary-light)', borderRadius: 4, cursor: 'pointer' }}
                            title="Set buy price to current LTP"
                          >
                            Use LTP
                          </button>
                        )}
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Rs.</span>
                        <input
                          type="number"
                          step="0.01"
                          value={val}
                          onChange={e => setWaccEditValues(prev => ({ ...prev, [sym]: e.target.value }))}
                          placeholder="Buy price"
                          style={{ width: 85, height: 28, fontSize: 12, padding: '0 8px', background: '#0d1117', border: '1px solid var(--border)', borderRadius: 6, color: '#fff', fontFamily: 'var(--font-mono)' }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {waccSaveSuccess && (
              <div style={{ fontSize: 11, color: 'var(--bull)', background: 'rgba(16,217,138,0.1)', border: '1px solid rgba(16,217,138,0.3)', borderRadius: 6, padding: '6px 10px', marginBottom: 10, textAlign: 'center', fontWeight: 700 }}>
                ✓ {waccSaveSuccess}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowWaccModal(false)}
                className="btn-secondary"
                style={{ flex: 1, padding: '9px 0', fontSize: 12 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAllWacc}
                className="btn-primary"
                style={{ flex: 2, padding: '9px 0', fontSize: 12, fontWeight: 800, background: 'linear-gradient(90deg, #10d98a, #059669)', border: 'none', color: '#042f2e' }}
              >
                Save All WACCs Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
