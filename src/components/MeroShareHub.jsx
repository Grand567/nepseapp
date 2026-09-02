import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, CheckCircle2, ShieldCheck, ShieldAlert, HelpCircle, Loader2, Sparkles, 
  Copy, Check, ExternalLink, ArrowRight, Search, RefreshCw, TrendingUp, 
  TrendingDown, User, Wallet, Lock, Edit3, AlertCircle
} from 'lucide-react';
import { 
  MEROSHARE_DP_LIST, 
  pullMeroShareLivePortfolio, 
  authenticateMeroShare, 
  parseMeroShareCsv, 
  checkBulkIpoResults,
  fetchIpoCompanyList,
  checkSingleBoidAllotment,
  fetchOpenIpos,
  checkBoidAlreadyApplied,
  applyIpoDirect
} from '../services/meroShareService';
import { checkIpoAllotmentMock, generateMockDematPortfolio } from '../utils/mockData';
import { getProxyBase } from '../utils/liveData';
import { sanitizeMeroShareHoldings, guessScripBasePrice } from '../utils/calculations';
import { syncUserDataToCloud } from '../utils/firebase';
import { Capacitor } from '@capacitor/core';

// Mock function to simulate IPO application
export function applyIpoMock(companyShareId, boid) {
  const isAllotted = Math.random() < 0.6;
  return new Promise(resolve => {
    setTimeout(() => {
      if (isAllotted) {
        resolve({
          success: true,
          status: 'Allotted',
          units: 10,
          message: `BOID ${boid} successfully applied for IPO ${companyShareId}`
        });
      } else {
        resolve({
          success: true,
          status: 'Not Allotted',
          units: 0,
          message: `BOID ${boid} applied for IPO ${companyShareId} but was not allotted`
        });
      }
    }, 500);
  });
}

const formatRs = (value) => {
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return 'Rs. 0.0';
  try {
    return 'Rs. ' + num.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  } catch {
    return 'Rs. ' + num.toFixed(1);
  }
};

// Robust helper to safely fetch and parse JSON, handling WAF HTML blocks and timeout errors
// Always tries to parse JSON first regardless of content-type header to avoid false negatives
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
  // 1. Direct BOID extraction strategy (100% offline-safe, WAF-immune, fast)
  // The 4th, 5th, and 6th digits (index 3 to 6) of a standard 16-digit BOID represent the actual CDSC client DP ID (e.g., 13010600 -> 106).
  const boidStr = String(boid || '').trim();
  if (boidStr.length === 16) {
    // Try 3-digit extraction from positions 3-6
    const extractedIdStr = boidStr.substring(3, 6);
    const resolvedId = parseInt(extractedIdStr, 10);
    if (!isNaN(resolvedId) && resolvedId >= 100 && resolvedId <= 400) {
      console.log(`[getRealClientId] Resolved DP ID ${resolvedId} directly from BOID prefix.`);
      return resolvedId;
    }
    // Also try 4-digit extraction from positions 3-7 for newer BOIDs
    const extractedId4Str = boidStr.substring(3, 7);
    const resolvedId4 = parseInt(extractedId4Str, 10);
    if (!isNaN(resolvedId4) && resolvedId4 >= 1000 && resolvedId4 <= 9999) {
      console.log(`[getRealClientId] Resolved DP ID ${resolvedId4} from 4-digit BOID prefix.`);
      return resolvedId4;
    }
  }

  // 2. Network Fallback: Load real list from backend
  try {
    const baseUrl = getProxyBase();
    const apiPath = '/api/meroshare/dp-list';

    let dpData;
    const json = await safeFetchJson(`${baseUrl}${apiPath}`);
    dpData = json.success ? json.data : [];

    if (dpData && dpData.length > 0) {
      // DP Matching Strategy
      const fullBoidPrefix = boidStr.substring(0, 8); // e.g. "12010600"
      const shortBoidPrefix = boidStr.substring(3, 8); // e.g. "10600"

      // A. Match by full 8-digit DP code in CDSC list
      const matchedByFullCode = dpData.find(dp => dp.code === fullBoidPrefix);
      if (matchedByFullCode) return matchedByFullCode.id;

      // B. Fallback: match by short 5-digit prefix (e.g. "10600")
      const matchedByShortCode = dpData.find(dp => 
        dp.code === shortBoidPrefix || 
        (dp.code && dp.code.includes(shortBoidPrefix))
      );
      if (matchedByShortCode) return matchedByShortCode.id;

      // C. Fallback: match by dpCode passed to function
      if (dpCode) {
        const matchedByDpCode = dpData.find(dp => 
          dp.code === dpCode || 
          (dp.code && dp.code.includes(dpCode))
        );
        if (matchedByDpCode) return matchedByDpCode.id;
      }

      // D. Fallback: match using name extraction from mock data
      const mockDp = MOCK_DP_LIST.find(dp => dp.code === dpCode);
      if (mockDp) {
        const idMatch = mockDp.name.match(/\((\d+)\)/);
        const extractedId = idMatch ? idMatch[1] : null;
        if (extractedId) {
          const matchedById = dpData.find(dp => String(dp.id) === String(extractedId));
          if (matchedById) return matchedById.id;
        }

        const cleanName = mockDp.name.split('(')[0].trim().toLowerCase();
        const matchedByName = dpData.find(dp => 
          dp.name.toLowerCase().includes(cleanName) || 
          cleanName.includes(dp.name.toLowerCase())
        );
        if (matchedByName) return matchedByName.id;
      }
    }
  } catch (err) {
    console.error("Failed to map DP list:", err);
  }

  // 3. Mock Fallback
  const mockDp = MOCK_DP_LIST.find(dp => dp.code === dpCode);
  if (mockDp) {
    const idMatch = mockDp.name.match(/\((\d+)\)/);
    if (idMatch) return parseInt(idMatch[1]);
  }
  return 101;
};

export default function MeroShareHub({ apiStatus, marketStocks = [], userId = 'guest_local' }) {
  // Profiles state
  const [profiles, setProfiles] = useState([]);
  
  // Toast & Confirm state
  const [toast, setToast] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev));
    }, 4000);
  };

  const askConfirm = (message) => {
    return new Promise(resolve => {
      setConfirmDialog({
        message,
        onConfirm: () => {
          setConfirmDialog(null);
          resolve(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
          resolve(false);
        }
      });
    });
  };
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [boid, setBoid] = useState('');
  const [username, setUsername] = useState('');
  const [dpCode, setDpCode] = useState(MEROSHARE_DP_LIST[0].code);
  const [dpSearchQuery, setDpSearchQuery] = useState('');
  const [password, setPassword] = useState('');
  const [crn, setCrn] = useState('');
  const [pin, setPin] = useState('');

  // Edit Profile state
  const [editingProfileId, setEditingProfileId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editBoid, setEditBoid] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editDpCode, setEditDpCode] = useState('');
  const [editDpSearchQuery, setEditDpSearchQuery] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editCrn, setEditCrn] = useState('');
  const [editPin, setEditPin] = useState('');
  const [testingProfileId, setTestingProfileId] = useState(null);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [syncErrors, setSyncErrors] = useState({});

  // Bulk Check state
  const [ipoCompanies, setIpoCompanies] = useState([]);
  const [selectedIpo, setSelectedIpo] = useState('');
  const [isLoadingIpos, setIsLoadingIpos] = useState(false);
  const [ipoLoadError, setIpoLoadError] = useState('');
  const [manualCompanyId, setManualCompanyId] = useState('');
  const [customAppliedKitta, setCustomAppliedKitta] = useState(10);
  const [isChecking, setIsChecking] = useState(false);
  const [isCheckingApplied, setIsCheckingApplied] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResults, setApplyResults] = useState([]);
  const [appliedCheckResults, setAppliedCheckResults] = useState([]);
  const [checkResults, setCheckResults] = useState([]);
  const [queryMode, setQueryMode] = useState('cors-proxy'); // Default to cors-proxy for real CDSC queries
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);
  const [accountSearchQuery, setAccountSearchQuery] = useState('');

  // Apply Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [appliedStatus, setAppliedStatus] = useState({}); // { profileId: 'applied' / 'pending' }
  const [copiedField, setCopiedField] = useState(null);
  const [wizardMessage, setWizardMessage] = useState('');
  const [isWizardApplying, setIsWizardApplying] = useState(false);

  // Sub Tabs & Portfolio state
  const [activeSubTab, setActiveSubTab] = useState('accounts'); // 'accounts', 'ipo', 'portfolio'
  const [ipoSubTab, setIpoSubTab] = useState('apply'); // 'apply' | 'check'
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [syncedProfileIds, setSyncedProfileIds] = useState([]);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [retrievalStep, setRetrievalStep] = useState(0);
  const [sessionToken, setSessionToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [hubValuationMode, setHubValuationMode] = useState('prevClose'); // 'prevClose' (Official MeroShare default), 'ltp', 'live'

  // Portfolio Editing & Manual Add states
  const [editingStockSymbol, setEditingStockSymbol] = useState(null);
  const [editUnits, setEditUnits] = useState('');
  const [editWacc, setEditWacc] = useState('');
  const [showAddHoldingForm, setShowAddHoldingForm] = useState(false);
  const [newHoldingSymbol, setNewHoldingSymbol] = useState('');
  const [newHoldingUnits, setNewHoldingUnits] = useState('');
  const [newHoldingWacc, setNewHoldingWacc] = useState('');

  // Load saved profiles AND syncedProfileIds from localStorage on mount / userId change
  // Also merges accounts from Bulk Account Manager key so both stay in sync
  useEffect(() => {
    const profileKey = `nepse_hub_${userId}_profiles`;
    const syncKey    = `nepse_hub_${userId}_synced_ids`;

    const loadAndMerge = () => {
      const saved = localStorage.getItem(profileKey);
      let parsed = [];
      try { 
        const raw = saved ? JSON.parse(saved) : []; 
        parsed = (Array.isArray(raw) ? raw : []).map(p => ({
          ...p,
          holdings: sanitizeMeroShareHoldings(p.holdings)
        }));
      } catch (_) { parsed = []; }

      // Merge any accounts from the Bulk Account Manager key not already in profiles
      try {
        const bulkRaw = localStorage.getItem('nepse_hub_bulk_ipo_accounts');
        if (bulkRaw) {
          const bulkAccounts = JSON.parse(bulkRaw);
          if (Array.isArray(bulkAccounts) && bulkAccounts.length > 0) {
            let changed = false;
            bulkAccounts.forEach(acc => {
              const existing = parsed.find(p => p.boid === acc.boid);
              if (!existing) {
                parsed.push({
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
              } else if (acc.holdings?.length > 0 && (!existing.holdings || existing.holdings.length === 0)) {
                existing.holdings = sanitizeMeroShareHoldings(acc.holdings);
                existing.lastSyncedAt = acc.lastSyncedAt;
                changed = true;
              }
            });
            if (changed) {
              localStorage.setItem(profileKey, JSON.stringify(parsed));
            }
          }
        }
      } catch (_) {}

      setProfiles(parsed);
      const savedSyncedIds = JSON.parse(localStorage.getItem(syncKey) || '[]');
      const idsWithHoldings = parsed.filter(p => p.holdings && p.holdings.length > 0).map(p => p.id);
      const combinedSynced = [...new Set([...savedSyncedIds, ...idsWithHoldings])];
      setSyncedProfileIds(combinedSynced);
      if (parsed.length > 0) {
        setSelectedProfileId(parsed[0].id);
        setActiveSubTab('portfolio');
      } else {
        setSelectedProfileId('');
      }
    };

    loadAndMerge();

    // Listen for updates dispatched by AccountManager (same-tab CustomEvent)
    const handleBulkAccountsChanged = () => loadAndMerge();
    window.addEventListener('bulkAccountsChanged', handleBulkAccountsChanged);
    return () => window.removeEventListener('bulkAccountsChanged', handleBulkAccountsChanged);
  }, [userId]);

  // Sync selected account IDs with loaded profiles by default
  useEffect(() => {
    if (profiles.length > 0) {
      setSelectedAccountIds(profiles.map(p => p.id));
    } else {
      setSelectedAccountIds([]);
    }
  }, [profiles]);

  // Load real CDSC IPOs and Allotted results
  const loadIpoCompanies = async () => {
    setIsLoadingIpos(true);
    setIpoLoadError('');

    try {
      // 1. Fetch live public IPO allotment results from CDSC
      const liveAllottedList = await fetchIpoCompanyList();

      // 2. Fetch live currently open issues for apply
      const primaryProfile = profiles.length > 0 ? profiles[0] : null;
      const liveOpenList = await fetchOpenIpos(primaryProfile);

      const allCompanies = [...liveOpenList, ...liveAllottedList];
      setIpoCompanies(allCompanies);

      if (allCompanies.length > 0 && !selectedIpo) {
        if (ipoSubTab === 'apply') {
          const firstOpen = allCompanies.find(i => i.status === 'Open') || allCompanies[0];
          setSelectedIpo(String(firstOpen.id));
          setCustomAppliedKitta(firstOpen.minKitta || 10);
        } else {
          const firstAllotted = allCompanies.find(i => i.status !== 'Open') || allCompanies[0];
          setSelectedIpo(String(firstAllotted.id));
        }
      }
    } catch (e) {
      console.warn("Failed to load live CDSC IPOs:", e);
      setIpoLoadError('Could not load live IPO list from CDSC. You can select sample issues or enter ID manually.');
    } finally {
      setIsLoadingIpos(false);
    }
  };

  useEffect(() => {
    if (Array.isArray(ipoCompanies || []) && (ipoCompanies || []).length > 0) {
      if (ipoSubTab === 'apply') {
        const firstOpen = (ipoCompanies || []).find(i => i.status === 'Open');
        if (firstOpen && !selectedIpo) {
          setSelectedIpo(String(firstOpen.id));
          setCustomAppliedKitta(firstOpen.minKitta || 10);
        }
      } else {
        const firstAllotted = (ipoCompanies || []).find(i => i.status !== 'Open');
        if (firstAllotted && !selectedIpo) {
          setSelectedIpo(String(firstAllotted.id));
        }
      }
    }
  }, [ipoSubTab, ipoCompanies]);

  useEffect(() => {
    if (activeSubTab === 'ipo') {
      loadIpoCompanies().catch(() => {});
    }
  }, [activeSubTab]);

  // Auto-fetch portfolio when switching to portfolio tab for a profile with no holdings
  useEffect(() => {
    if (activeSubTab !== 'portfolio') return;
    if (!selectedProfileId || isRetrieving) return;
    const profile = profiles.find(p => p.id === selectedProfileId);
    if (!profile) return;
    const hasHoldings = profile.holdings && profile.holdings.length > 0;
    if (!hasHoldings) {
      // Only auto-trigger on native (web proxy often WAF-blocked)
      try {
        if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
          handleRetrievePortfolio(selectedProfileId);
        }
      } catch (_) {}
    }
  }, [activeSubTab, selectedProfileId]);

  // Set default import mode to CSV for Web on load
  useEffect(() => {
    try {
      if (typeof Capacitor !== 'undefined' && !Capacitor.isNativePlatform()) {
        setShowCsvImport(true);
      }
    } catch (_) {}
  }, []);

  // Sync selectedProfileId if profiles list changes or initialises
  // Also fall back to the last profile in the list if the current selection was deleted
  useEffect(() => {
    if (profiles.length > 0) {
      const stillExists = profiles.some(p => p.id === selectedProfileId);
      if (!selectedProfileId || !stillExists) {
        setSelectedProfileId(profiles[profiles.length - 1].id);
      }
    } else {
      setSelectedProfileId('');
    }
  }, [profiles]);



  // Save profiles and keep Portfolio tab in sync via storage event
  const saveProfilesToStorage = (newProfiles) => {
    setProfiles(newProfiles);
    const profileKey = `nepse_hub_${userId}_profiles`;
    localStorage.setItem(profileKey, JSON.stringify(newProfiles));
    // Dispatch storage event so Portfolio tab picks up the change immediately
    window.dispatchEvent(new StorageEvent('storage', { key: profileKey, newValue: JSON.stringify(newProfiles) }));
    // Cloud Sync
    try {
      syncUserDataToCloud(userId, newProfiles, null);
    } catch (_) {}
  };

  // Persist syncedProfileIds to localStorage whenever they change
  useEffect(() => {
    if (!userId) return;
    const syncKey = `nepse_hub_${userId}_synced_ids`;
    localStorage.setItem(syncKey, JSON.stringify(syncedProfileIds));
  }, [syncedProfileIds, userId]);

  const validateAccountFields = (fields) => {
    const { name, boid, username, password, crn, pin } = fields;
    if (!name || !name.trim()) {
      return { valid: false, message: "⚠️ Full Name is required. Please enter account holder name." };
    }
    const cleanBoid = String(boid || '').replace(/\D/g, '').trim();
    if (!cleanBoid) {
      return { valid: false, message: "⚠️ Demat BOID is required (16 digits)." };
    }
    if (cleanBoid.length !== 16) {
      return { valid: false, message: `⚠️ Invalid BOID: Demat BOID must be exactly 16 digits (you entered ${cleanBoid.length} digits).` };
    }
    if (!username || !username.trim()) {
      return { valid: false, message: "⚠️ MeroShare Username is required." };
    }
    if (!password || !password.trim()) {
      return { valid: false, message: "⚠️ MeroShare Password is required." };
    }
    if (!crn || !crn.trim()) {
      return { valid: false, message: "⚠️ Bank C-ASBA CRN Number is required (e.g. C-1234)." };
    }
    const cleanPin = String(pin || '').replace(/\D/g, '').trim();
    if (!cleanPin) {
      return { valid: false, message: "⚠️ ASBA Transaction PIN is required (4 digits)." };
    }
    if (cleanPin.length !== 4) {
      return { valid: false, message: `⚠️ Invalid PIN: ASBA Transaction PIN must be exactly 4 digits (you entered ${cleanPin.length} digits).` };
    }
    return { valid: true, cleanBoid, cleanPin };
  };

  const handleAddProfile = async (e) => {
    e.preventDefault();
    const val = validateAccountFields({ name, boid, username, password, crn, pin });
    if (!val.valid) {
      showToast(val.message, "error");
      return;
    }

    setIsSavingAccount(true);

    let dpObj = MEROSHARE_DP_LIST.find(dp => dp.code === dpCode || dp.id === dpCode);
    if (val.cleanBoid.length === 16) {
      const boidDp = val.cleanBoid.substring(3, 8);
      const autoMatched = MEROSHARE_DP_LIST.find(dp => dp.code === boidDp);
      if (autoMatched) dpObj = autoMatched;
    }
    if (!dpObj) dpObj = { id: dpCode, name: 'Capital DP', code: dpCode };

    const newProfile = {
      id: Date.now().toString(),
      name: name.trim(),
      boid: val.cleanBoid,
      username: username.trim(),
      dpCode: dpObj.code || dpCode,
      dpId: dpObj.id || dpCode,
      dpName: dpObj.name || 'Capital DP',
      password: password.trim(),
      crn: crn.trim(),
      pin: val.cleanPin,
      holdings: [],
      lastSyncedAt: null
    };

    // Live verify credentials with CDSC
    try {
      const auth = await authenticateMeroShare(newProfile);
      if (!auth.success) {
        let alertTitle = "CDSC Authentication Warning";
        let detailMsg = auth.messageEn || auth.messageNe;
        if (detailMsg.toLowerCase().includes('password')) {
          alertTitle = "❌ Incorrect Password";
          detailMsg = `CDSC rejected login: Incorrect password for "${username.trim()}". (${auth.messageEn || 'Invalid password'})`;
        } else if (detailMsg.toLowerCase().includes('username') || detailMsg.toLowerCase().includes('not authorized')) {
          alertTitle = "❌ Invalid Username or DP";
          detailMsg = `CDSC could not find username "${username.trim()}" under ${newProfile.dpName}.`;
        }

        const proceed = await askConfirm(`${alertTitle}\n\n${detailMsg}\n\nDo you want to save this account anyway?`);
        if (!proceed) {
          setIsSavingAccount(false);
          return;
        }
      } else {
        if (auth.name && auth.name !== 'Unknown') {
          newProfile.name = auth.name;
        }
        showToast(`🟢 CDSC Verified! Welcome ${auth.name || name.trim()}. Saved successfully!`, "success");
      }
    } catch (err) {
      console.warn("CDSC check failed during add:", err);
    } finally {
      setIsSavingAccount(false);
    }

    const updated = [...profiles, newProfile];
    saveProfilesToStorage(updated);
    
    // Always select the newly added profile so Portfolio tab is ready to fetch it
    setSelectedProfileId(newProfile.id);

    // Reset form
    setName('');
    setBoid('');
    setUsername('');
    setPassword('');
    setCrn('');
    setPin('');
    setShowAddForm(false);

    // Auto-navigate to Portfolio and begin retrieval for the new profile
    setActiveSubTab('portfolio');
    setTimeout(() => handleRetrievePortfolio(newProfile.id), 150);
  };

  const handleDeleteProfile = async (id) => {
    if (await askConfirm("Are you sure you want to remove this profile? All saved credentials will be deleted from your device.")) {
      const updated = profiles.filter(p => p.id !== id);
      saveProfilesToStorage(updated);
      setSyncedProfileIds(prev => prev.filter(pId => pId !== id));
      if (selectedProfileId === id) {
        // Fall back to the last remaining profile
        setSelectedProfileId(updated.length > 0 ? updated[updated.length - 1].id : '');
      }
      showToast("Profile removed successfully.", "success");
    }
  };

  const handleStartEditProfile = (profile) => {
    setEditingProfileId(profile.id);
    setEditName(profile.name || '');
    setEditBoid(profile.boid || '');
    setEditUsername(profile.username || '');
    setEditDpCode(profile.dpCode || MEROSHARE_DP_LIST[0].code);
    setEditPassword(profile.password || '');
    setEditCrn(profile.crn || '');
    setEditPin(profile.pin ? String(profile.pin) : '');
    setShowAddForm(false);
  };

  const handleCancelEditProfile = () => {
    setEditingProfileId(null);
    setEditName('');
    setEditBoid('');
    setEditUsername('');
    setEditDpCode('');
    setEditPassword('');
    setEditCrn('');
    setEditPin('');
  };

  const handleSaveEditProfile = async (e) => {
    e.preventDefault();
    const val = validateAccountFields({ name: editName, boid: editBoid, username: editUsername, password: editPassword, crn: editCrn, pin: editPin });
    if (!val.valid) {
      showToast(val.message, "error");
      return;
    }

    setIsSavingAccount(true);

    let dpObj = MEROSHARE_DP_LIST.find(dp => dp.code === editDpCode || dp.id === editDpCode);
    if (val.cleanBoid.length === 16) {
      const boidDp = val.cleanBoid.substring(3, 8);
      const autoMatched = MEROSHARE_DP_LIST.find(dp => dp.code === boidDp);
      if (autoMatched) dpObj = autoMatched;
    }
    if (!dpObj) dpObj = { id: editDpCode, name: 'Capital DP', code: editDpCode };

    const updatedProfileCandidate = {
      name: editName.trim(),
      boid: val.cleanBoid,
      dpCode: dpObj.code || editDpCode,
      dpId: dpObj.id || editDpCode,
      dpName: dpObj.name || 'Capital DP',
      username: editUsername.trim(),
      password: editPassword.trim(),
      crn: editCrn.trim(),
      pin: val.cleanPin
    };

    // Live verify updated credentials with CDSC
    try {
      const auth = await authenticateMeroShare(updatedProfileCandidate);
      if (!auth.success) {
        let alertTitle = "CDSC Authentication Warning";
        let detailMsg = auth.messageEn || auth.messageNe;
        if (detailMsg.toLowerCase().includes('password')) {
          alertTitle = "❌ Incorrect Password";
          detailMsg = `CDSC rejected login: Incorrect password for "${editUsername.trim()}". (${auth.messageEn || 'Invalid password'})`;
        } else if (detailMsg.toLowerCase().includes('username') || detailMsg.toLowerCase().includes('not authorized')) {
          alertTitle = "❌ Invalid Username or DP";
          detailMsg = `CDSC could not find username "${editUsername.trim()}" under ${dpObj.name}.`;
        }

        const proceed = await askConfirm(`${alertTitle}\n\n${detailMsg}\n\nDo you want to save these changes anyway?`);
        if (!proceed) {
          setIsSavingAccount(false);
          return;
        }
      } else {
        if (auth.name && auth.name !== 'Unknown') {
          updatedProfileCandidate.name = auth.name;
        }
        showToast(`🟢 CDSC Verified! Credentials updated for ${auth.name || editName}.`, "success");
      }
    } catch (err) {
      console.warn("CDSC check failed during edit:", err);
    } finally {
      setIsSavingAccount(false);
    }

    const updatedProfiles = profiles.map(p => {
      if (p.id === editingProfileId) {
        return {
          ...p,
          ...updatedProfileCandidate
        };
      }
      return p;
    });

    saveProfilesToStorage(updatedProfiles);
    handleCancelEditProfile();
  };

  const handleTestConnection = async (profile) => {
    setTestingProfileId(profile.id);
    try {
      const auth = await authenticateMeroShare(profile);
      if (auth.success) {
        showToast(`🟢 CDSC Login Verified! Ready to sync for ${auth.name || profile.name}.`, "success");
      } else {
        showToast(`🔴 CDSC Login Failed: ${auth.messageEn || auth.messageNe}`, "error");
      }
    } catch (err) {
      showToast(`Connection error: ${err.message}`, "error");
    } finally {
      setTestingProfileId(null);
    }
  };

  // Direct Bulk Allotment Check via CDSC
  const handleBulkCheck = async () => {
    const targetProfiles = profiles.filter(p => selectedAccountIds.includes(p.id));
    if (targetProfiles.length === 0) {
      showToast('Please select at least one profile to check.', 'error');
      return;
    }

    if (!selectedIpo || selectedIpo.trim() === '') {
      showToast('Please select an IPO company to check results.', 'error');
      return;
    }

    setIsChecking(true);
    setCheckResults(targetProfiles.map(p => ({
      id: p.id, name: p.name, boid: p.boid, status: 'loading', resultText: 'Querying CDSC Result Portal...'
    })));

    let checkedCount = 0;
    let allottedTotal = 0;

    for (let i = 0; i < targetProfiles.length; i++) {
      const profile = targetProfiles[i];

      setCheckResults(prev => [
        ...prev.filter(r => r.id !== profile.id),
        { id: profile.id, name: profile.name, boid: profile.boid, status: 'loading', resultText: 'Connecting to CDSC Result Portal...' }
      ]);

      if (i > 0) {
        await new Promise(r => setTimeout(r, 600));
      }

      try {
        const check = await checkSingleBoidAllotment(selectedIpo, profile.boid);
        const status = check.allotted ? 'allotted' : 'not_allotted';
        const resultText = check.message;
        const units = check.units || 0;
        if (check.allotted) allottedTotal += units;

        const uiResult = { id: profile.id, name: profile.name, boid: profile.boid, status, resultText, units };
        setCheckResults(prev => [
          ...prev.filter(r => r.id !== profile.id),
          uiResult
        ].sort((a, b) => {
          const indexA = targetProfiles.findIndex(p => p.id === a.id);
          const indexB = targetProfiles.findIndex(p => p.id === b.id);
          return indexA - indexB;
        }));
        checkedCount++;
      } catch (err) {
        console.error(`Bulk check failed for BOID ${profile.boid}:`, err);
        const uiResult = {
          id: profile.id,
          name: profile.name,
          boid: profile.boid,
          status: 'failed',
          resultText: err.message || 'CDSC did not respond. Tap Retry.',
          units: 0
        };
        setCheckResults(prev => [
          ...prev.filter(r => r.id !== profile.id),
          uiResult
        ].sort((a, b) => {
          const indexA = targetProfiles.findIndex(p => p.id === a.id);
          const indexB = targetProfiles.findIndex(p => p.id === b.id);
          return indexA - indexB;
        }));
      }
    }

    setIsChecking(false);
    showToast(
      allottedTotal > 0
        ? `🎉 Allotment Check Done! ${allottedTotal} total units allotted across your accounts!`
        : `Check completed for ${checkedCount} family accounts.`,
      allottedTotal > 0 ? 'success' : 'info'
    );
  };

  // Direct check already applied status via MeroShare
  const handleCheckAlreadyApplied = async () => {
    const targetProfiles = profiles.filter(p => selectedAccountIds.includes(p.id));
    if (targetProfiles.length === 0) {
      showToast('Please select at least one profile to verify.', 'error');
      return;
    }

    const activeIpo = getActiveIpo();
    if (!activeIpo || activeIpo.name === 'Loading...') return;

    setIsCheckingApplied(true);
    setAppliedCheckResults(targetProfiles.map(p => ({
      id: p.id, name: p.name, boid: p.boid, status: 'loading', resultText: 'Querying MeroShare...'
    })));

    let successCount = 0;

    for (let i = 0; i < targetProfiles.length; i++) {
      const profile = targetProfiles[i];

      if (i > 0) {
        await new Promise(r => setTimeout(r, 800));
      }

      setAppliedCheckResults(prev => [
        ...prev.filter(r => r.id !== profile.id),
        { id: profile.id, name: profile.name, boid: profile.boid, status: 'loading', resultText: 'Checking C-ASBA report...' }
      ]);

      try {
        const check = await checkBoidAlreadyApplied(profile, selectedIpo);
        if (check.applied) {
          setAppliedCheckResults(prev => [
            ...prev.filter(r => r.id !== profile.id),
            {
              id: profile.id,
              name: profile.name,
              boid: profile.boid,
              status: 'applied',
              resultText: '✅ Already Applied for this IPO',
              units: 10
            }
          ]);
        } else {
          setAppliedCheckResults(prev => [
            ...prev.filter(r => r.id !== profile.id),
            {
              id: profile.id,
              name: profile.name,
              boid: profile.boid,
              status: 'not_applied',
              resultText: '🟢 Ready to Apply',
              units: 0
            }
          ]);
        }
        successCount++;
      } catch (err) {
        console.error('Check already applied error:', err);
        setAppliedCheckResults(prev => [
          ...prev.filter(r => r.id !== profile.id),
          {
            id: profile.id,
            name: profile.name,
            boid: profile.boid,
            status: 'failed',
            resultText: `⚠️ ${err.message || 'Verification error'}`
          }
        ]);
      }
    }

    setIsCheckingApplied(false);
    showToast(`Verification completed for ${successCount}/${targetProfiles.length} accounts.`, "success");
  };

  // Direct Live Bulk Apply via MeroShare C-ASBA
  const handleBulkApply = async () => {
    const targetProfiles = profiles.filter(p => selectedAccountIds.includes(p.id));
    if (targetProfiles.length === 0) {
      showToast('Please select at least one profile to apply.', 'error');
      return;
    }

    const activeIpo = getActiveIpo();
    if (!activeIpo || activeIpo.name === 'Loading...' || activeIpo.status !== 'Open') {
      showToast('Please select an open IPO issue to apply.', 'error');
      return;
    }

    const totalKitta = Number(customAppliedKitta || 10);
    const costPerAccount = totalKitta * (activeIpo.amountPerShare || 100);
    const confirmApply = await askConfirm(
      `⚡ CDSC LIVE IPO BULK APPLICATION\n\n` +
      `Apply for: ${activeIpo.name}\n` +
      `Quantity: ${totalKitta} Kitta (Rs. ${costPerAccount.toLocaleString()}) per account\n` +
      `Total Accounts: ${targetProfiles.length}\n\n` +
      `Do you want to proceed with live C-ASBA submission?`
    );

    if (!confirmApply) return;

    setIsApplying(true);
    setApplyResults([]);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < targetProfiles.length; i++) {
      const profile = targetProfiles[i];

      if (i > 0) {
        await new Promise(r => setTimeout(r, 1200));
      }

      setApplyResults(prev => [
        ...prev.filter(r => r.id !== profile.id),
        { id: profile.id, name: profile.name, boid: profile.boid, status: 'loading', resultText: 'Authenticating & Submitting C-ASBA...' }
      ]);

      const res = await applyIpoDirect(profile, selectedIpo, totalKitta);
      if (res.success) successCount++;
      else failCount++;

      setApplyResults(prev => [
        ...prev.filter(r => r.id !== profile.id),
        {
          id: profile.id,
          name: profile.name,
          boid: profile.boid,
          status: res.success ? 'applied' : 'failed',
          resultText: res.success ? `✅ ${res.message}` : `❌ ${res.message}`,
          units: res.success ? totalKitta : 0
        }
      ]);
    }

    setIsApplying(false);
    showToast(
      `Bulk Apply Finished: ✅ ${successCount} Successful, ❌ ${failCount} Failed.`,
      failCount > 0 ? 'warning' : 'success'
    );
  };

  // Helper copy to clipboard
  const handleCopy = (text, fieldName) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 1500);
      showToast(`${fieldName ? fieldName.toUpperCase() : 'Credential'} copied to clipboard!`, "success");
    } catch (err) {
      console.error("Clipboard copy error: ", err);
      showToast("Failed to copy. Please copy manually.", "error");
    }
  };

  const startApplyWizard = () => {
    if (profiles.length === 0) {
      showToast("Please add MeroShare profiles first.", "error");
      return;
    }
    setActiveSubTab('accounts');
    setShowWizard(true);
    setWizardStep(0);
  };

  const filterProfileBySearch = (p) => {
    if (!p) return false;
    if (!accountSearchQuery || !accountSearchQuery.trim()) return true;
    const q = accountSearchQuery.toLowerCase().trim();
    const pName = String(p.name || p.accountName || '').toLowerCase();
    const pUser = String(p.username || '').toLowerCase();
    const pBoid = String(p.boid || '');
    return pName.includes(q) || pUser.includes(q) || pBoid.includes(q);
  };

  const getActiveIpo = () => {
    if (!Array.isArray(ipoCompanies) || ipoCompanies.length === 0) {
      if (selectedIpo && String(selectedIpo).trim() !== '') {
        const isCheckTab = ipoSubTab === 'check';
        return {
          id: String(selectedIpo),
          name: `Manual Company (ID: ${selectedIpo})`,
          scrip: 'MANUAL',
          status: isCheckTab ? 'Alloted' : 'Open',
          minKitta: 10,
          maxKitta: 10000,
          amountPerShare: 100,
          shareId: String(selectedIpo)
        };
      }
      return { name: 'Select IPO Issue', scrip: '...', status: '', amountPerShare: 100, minKitta: 10, maxKitta: 10000 };
    }
    const found = (ipoCompanies || []).find(i => i && i.id != null && String(i.id) === String(selectedIpo || ''));
    if (found) return found;

    if (selectedIpo && String(selectedIpo).trim() !== '') {
      const isCheckTab = ipoSubTab === 'check';
      return {
        id: String(selectedIpo),
        name: `Manual Company (ID: ${selectedIpo})`,
        scrip: 'MANUAL',
        status: isCheckTab ? 'Alloted' : 'Open',
        minKitta: 10,
        maxKitta: 10000,
        amountPerShare: 100,
        shareId: String(selectedIpo)
      };
    }

    const defaultIpo = ipoSubTab === 'apply'
      ? ((ipoCompanies || []).find(i => i && i.status === 'Open') || (ipoCompanies || [])[0])
      : ((ipoCompanies || []).find(i => i && i.status !== 'Open') || (ipoCompanies || [])[0]);

    if (defaultIpo) return defaultIpo;

    return { name: 'Select IPO Issue', scrip: '...', status: '', amountPerShare: 100, minKitta: 10, maxKitta: 10000 };
  };

  const handleWizardApplyLive = async () => {
    const profile = profiles[wizardStep];
    const activeIpo = getActiveIpo();
    
    setIsWizardApplying(true);
    setWizardMessage('Authenticating MeroShare session...');

    try {
      const clientId = await getRealClientId(profile.boid, profile.dpCode);
      let resMsg = '';

      setWizardMessage('Submitting secure ASBA flow via proxy...');
      const response = await fetch(`${getProxyBase()}/api/meroshare/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          username: profile.username,
          password: profile.password,
          companyShareId: Number(selectedIpo),
          appliedKitta: Number(customAppliedKitta),
          crnNumber: profile.crn,
          transactionPin: profile.pin,
          boid: profile.boid
        })
      });

      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.message || 'Failed to submit IPO application via proxy.');
      }

      resMsg = json.data?.message || 'Share applied successfully.';

      setAppliedStatus(prev => ({ ...prev, [profile.id]: 'applied' }));
      showToast(`Success: ${resMsg}`, "success");
      
      // Auto advance to next step after a tiny delay
      setTimeout(() => {
        setIsWizardApplying(false);
        setWizardMessage('');
        if (wizardStep < profiles.length - 1) {
          setWizardStep(prev => prev + 1);
        } else {
          setShowWizard(false);
          showToast("Awesome! You completed applying IPO across all your registered family profiles.", "success");
        }
      }, 1000);

    } catch (err) {
      console.error("Wizard apply error:", err);
      setIsWizardApplying(false);
      setWizardMessage('');
      showToast(`ASBA Application Failed: ${err.message}`, "error");
    }
  };

  // Trigger direct live retrieval of Demat portfolio from CDSC MeroShare
  const handleRetrievePortfolio = async (profileId) => {
    if (!profileId) return;
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    setIsRetrieving(true);
    setRetrievalStep(1); // Gateway
    setSyncErrors(prev => {
      const next = { ...prev };
      delete next[profileId];
      return next;
    });

    try {
      setRetrievalStep(2);
      const result = await pullMeroShareLivePortfolio(profile);

      if (!result.success) {
        throw new Error(result.messageEn || result.messageNe || 'Failed to fetch MeroShare portfolio.');
      }

      setRetrievalStep(3);
      const parsedHoldings = (result.holdings || []).map(h => ({
        symbol: h.symbol,
        name: h.name || h.companyName || h.symbol,
        units: Number(h.units || h.totalUnits || h.currentBalance || 0),
        totalUnits: Number(h.totalUnits || h.units || 0),
        freeBalance: Number(h.freeBalance ?? h.units ?? 0),
        frozenBalance: Number(h.frozenBalance || 0),
        currentLtp: Number(h.currentLtp || h.ltp || 0),
        prevClose: Number(h.prevClose || 0),
        valueAsOfLTP: Number(h.valueAsOfLTP || h.currentMarketValue || 0),
        valueAsOfPrevClose: Number(h.valueAsOfPrevClose || 0),
        currentMarketValue: Number(h.currentMarketValue || h.valueAsOfLTP || 0),
        wacc: Number((h.wacc || 100).toFixed(2))
      }));

      // Sync and enrich with market data step
      setRetrievalStep(4);
      await new Promise(r => setTimeout(r, 400));

      // Update profiles with holdings and last-synced timestamp, then save
      const updatedProfiles = profiles.map(p => {
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

      // Also sync to bulk accounts
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

      // Add to synced lists
      setSyncedProfileIds(prev => [...new Set([...prev, profileId])]);
      
      setIsRetrieving(false);
      setRetrievalStep(0);
      if (parsedHoldings.length === 0) {
        showToast(`ℹ️ CDSC connected! 0 active shares detected for ${(result.name && result.name !== 'Unknown') ? result.name : profile.name}. Try Re-Sync or Import CSV.`, "info");
      } else {
        showToast(`🟢 Demat portfolio synced! Loaded ${parsedHoldings.length} scrips for ${(result.name && result.name !== 'Unknown') ? result.name : profile.name}.`, "success");
      }

    } catch (err) {
      console.error("Demat fetch error:", err);
      setSyncErrors(prev => ({ ...prev, [profileId]: err.message }));
      showToast(`Failed to fetch holdings: ${err.message}. Try CSV import or verify credentials.`, "error");
      setIsRetrieving(false);
      setRetrievalStep(0);
    }
  };

  const handleRetrieveWithToken = async (profileId, token) => {
    if (!profileId || !token) {
      showToast("Please provide a valid active session token.", "error");
      return;
    }
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    setIsRetrieving(true);
    setRetrievalStep(3); // Fetching portfolio directly

    try {
      // Fetch own-detail first to get exact clientCode and demat
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

      const updatedProfiles = profiles.map(p => {
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
      setSyncedProfileIds(prev => [...new Set([...prev, profileId])]);
      
      setIsRetrieving(false);
      setRetrievalStep(0);
      setSessionToken('');
      setShowTokenInput(false);
      showToast(`Demat portfolio successfully fetched using session token! Retrieved ${parsedHoldings.length} holdings for ${profile.name}.`, "success");

    } catch (err) {
      console.error("Token fetch error:", err);
      showToast(`Failed to fetch holdings using session token. Error: ${err.message}`, "error");
      setIsRetrieving(false);
      setRetrievalStep(0);
    }
  };

  const handleCsvImport = (e, profileId) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsedHoldings = parseMeroShareCsv(text);

      if (parsedHoldings.length === 0) {
        showToast("No valid holdings parsed from this CSV. Please export from MeroShare 'My Portfolio'.", "error");
        return;
      }

      const updatedProfiles = profiles.map(p => {
        if (p.id === profileId) {
          return { ...p, holdings: parsedHoldings, lastSyncedAt: Date.now() };
        }
        return p;
      });
      saveProfilesToStorage(updatedProfiles);
      setSyncedProfileIds(prev => [...new Set([...prev, profileId])]);
      setShowCsvImport(false);
      showToast(`Successfully imported ${parsedHoldings.length} stock holdings from CSV!`, "success");
    };
    reader.readAsText(file);
  };

  const handleAddCustomHolding = () => {
    if (!newHoldingSymbol || !newHoldingUnits || !newHoldingWacc) {
      showToast("Please fill in all fields.", "error");
      return;
    }
    const units = parseInt(newHoldingUnits);
    const wacc = parseFloat(newHoldingWacc);
    if (isNaN(units) || units <= 0 || isNaN(wacc) || wacc <= 0) {
      showToast("Units and WACC must be positive numbers.", "error");
      return;
    }

    const updatedProfiles = profiles.map(p => {
      if (p.id === selectedProfileId) {
        const existingHoldings = p.holdings || [];
        const exists = existingHoldings.some(h => h.symbol === newHoldingSymbol);
        let newHoldings;
        if (exists) {
          newHoldings = existingHoldings.map(h => {
            if (h.symbol === newHoldingSymbol) {
              const newUnits = h.units + units;
              const newWacc = ((h.units * h.wacc) + (units * wacc)) / newUnits;
              return { ...h, units: newUnits, wacc: Number(Number(newWacc || 0).toFixed(2)) };
            }
            return h;
          });
        } else {
          const stk = marketStocks.find(s => s.symbol === newHoldingSymbol);
          newHoldings = [...existingHoldings, {
            symbol: newHoldingSymbol,
            name: stk ? stk.name : newHoldingSymbol,
            units,
            wacc
          }];
        }
        return { ...p, holdings: newHoldings };
      }
      return p;
    });

    saveProfilesToStorage(updatedProfiles);
    setShowAddHoldingForm(false);
    setNewHoldingUnits('');
    setNewHoldingWacc('');
  };

  const handleSaveEditHolding = (symbol) => {
    const units = parseInt(editUnits);
    const wacc = parseFloat(editWacc);
    if (isNaN(units) || units <= 0 || isNaN(wacc) || wacc <= 0) {
      showToast("Units and WACC must be positive numbers.", "error");
      return;
    }

    const updatedProfiles = profiles.map(p => {
      if (p.id === selectedProfileId) {
        const newHoldings = (p.holdings || []).map(h => {
          if (h.symbol === symbol) {
            return { ...h, units, wacc };
          }
          return h;
        });
        return { ...p, holdings: newHoldings };
      }
      return p;
    });

    saveProfilesToStorage(updatedProfiles);
    setEditingStockSymbol(null);
  };

  const handleDeleteCustomHolding = async (symbol) => {
    if (await askConfirm(`Are you sure you want to delete ${symbol} from this portfolio?`)) {
      const updatedProfiles = profiles.map(p => {
        if (p.id === selectedProfileId) {
          const newHoldings = (p.holdings || []).filter(h => h.symbol !== symbol);
          return { ...p, holdings: newHoldings };
        }
        return p;
      });

      saveProfilesToStorage(updatedProfiles);
      setEditingStockSymbol(null);
    }
  };

  const handleResetHoldings = async () => {
    if (await askConfirm("Are you sure you want to clear cached holdings for this profile and re-fetch real holdings from CDSC?")) {
      const updatedProfiles = profiles.map(p => {
        if (p.id === selectedProfileId) {
          return { ...p, holdings: [], lastSyncedAt: null };
        }
        return p;
      });
      saveProfilesToStorage(updatedProfiles);
      setEditingStockSymbol(null);
      setShowAddHoldingForm(false);
      handleRetrievePortfolio(selectedProfileId);
    }
  };

  return (
    <div style={{ padding: 16 }}>
      {/* Tab Switch header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck style={{ width: 20, height: 20 }} /> MeroShare Hub
        </h2>
        {activeSubTab === 'accounts' && !showWizard && (
          <button 
            onClick={() => setShowAddForm(!showAddForm)} 
            className="btn-secondary"
            style={{ padding: '6px 12px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, borderColor: 'rgba(91,94,244,0.25)', color: 'var(--primary-light)' }}
          >
            <Plus style={{ width: 14, height: 14 }} /> {showAddForm ? 'Cancel' : 'Add Profile'}
          </button>
        )}
      </div>

      {/* Sub Tab Navigation */}
      {!showWizard && (
        <div className="tab-bar" style={{ marginBottom: 16 }}>
          <button 
            onClick={() => setActiveSubTab('accounts')} 
            className={`tab-btn ${activeSubTab === 'accounts' ? 'active' : ''}`}
            style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '8px 0' }}
          >
            <User style={{ width: 13, height: 13 }} /> Accounts
          </button>
          <button 
            onClick={() => setActiveSubTab('ipo')} 
            className={`tab-btn ${activeSubTab === 'ipo' ? 'active' : ''}`}
            style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '8px 0' }}
          >
            <Sparkles style={{ width: 13, height: 13 }} /> Bulk IPO
          </button>
          <button 
            onClick={() => setActiveSubTab('portfolio')} 
            className={`tab-btn ${activeSubTab === 'portfolio' ? 'active' : ''}`}
            style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '8px 0' }}
          >
            <Wallet style={{ width: 13, height: 13 }} /> Demat Portfolio
          </button>
        </div>
      )}

      {/* ── Sub Tab: ACCOUNTS ── */}
      {activeSubTab === 'accounts' && (
        <>
          {/* Add profile form modal */}
          {showAddForm && (
            <form onSubmit={handleAddProfile} className="card fade-in" style={{ marginBottom: 16 }}>
              <h3 className="section-title" style={{ marginBottom: 12, color: 'var(--primary-light)' }}>Add MeroShare Account</h3>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label className="input-label">Full Name</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} className="input" placeholder="e.g. John Doe" />
                </div>
                <div>
                  <label className="input-label">Demat BOID (16 Digits)</label>
                  <input type="text" maxLength="16" required value={boid} onChange={e => setBoid(e.target.value.replace(/\D/g, ''))} className="input" placeholder="120106000..." />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="input-label">Search & Select DP Capital/Bank</label>
                <input 
                  type="text" 
                  value={dpSearchQuery} 
                  onChange={e => setDpSearchQuery(e.target.value)} 
                  placeholder="Type bank or DP code (e.g. Kumari, 15200)..." 
                  className="input" 
                  style={{ marginBottom: 6, fontSize: 12, padding: '8px 12px' }} 
                />
                <select 
                  value={dpCode} 
                  onChange={e => setDpCode(e.target.value)} 
                  className="select-input"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {MEROSHARE_DP_LIST
                    .filter(dp => !dpSearchQuery || dp.name.toLowerCase().includes(dpSearchQuery.toLowerCase()) || dp.code.includes(dpSearchQuery))
                    .map(dp => (
                      <option key={dp.id || dp.code} value={dp.code}>{dp.name}</option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label className="input-label">Username</label>
                  <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="input" placeholder="MeroShare Username" />
                </div>
                <div>
                  <label className="input-label">Password</label>
                  <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="••••" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div>
                  <label className="input-label">CRN Number</label>
                  <input type="text" required value={crn} onChange={e => setCrn(e.target.value)} className="input" placeholder="C-1234" />
                </div>
                <div>
                  <label className="input-label">4-Digit PIN</label>
                  <input type="password" maxLength="4" required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} className="input" placeholder="0000" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setShowAddForm(false)} className="btn-secondary" style={{ flex: 1, padding: '10px 0', fontSize: 13 }}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSavingAccount}
                  className="btn-primary" 
                  style={{ flex: 2, padding: '10px 0', fontSize: 13, background: 'linear-gradient(135deg, #4f46e5, #0ea5e9)', border: 'none', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {isSavingAccount && <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />}
                  {isSavingAccount ? 'Verifying with CDSC...' : 'Save & Verify Profile ✓'}
                </button>
              </div>
            </form>
          )}

          {/* Edit profile form modal */}
          {editingProfileId && (
            <form onSubmit={handleSaveEditProfile} className="card fade-in" style={{ marginBottom: 16, border: '1.5px solid #4f46e5', background: 'rgba(79,70,229,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 className="section-title" style={{ marginBottom: 0, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Edit3 style={{ width: 16, height: 16 }} /> Edit MeroShare Account
                </h3>
                <button type="button" onClick={handleCancelEditProfile} className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>
                  Cancel
                </button>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label className="input-label">Full Name</label>
                  <input type="text" required value={editName} onChange={e => setEditName(e.target.value)} className="input" placeholder="e.g. John Doe" />
                </div>
                <div>
                  <label className="input-label">Demat BOID (16 Digits)</label>
                  <input type="text" maxLength="16" required value={editBoid} onChange={e => setEditBoid(e.target.value.replace(/\D/g, ''))} className="input" placeholder="120106000..." />
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label className="input-label">Search & Select DP Capital/Bank</label>
                <input 
                  type="text" 
                  value={editDpSearchQuery} 
                  onChange={e => setEditDpSearchQuery(e.target.value)} 
                  placeholder="Type bank or DP code (e.g. Kumari, 15200)..." 
                  className="input" 
                  style={{ marginBottom: 6, fontSize: 12, padding: '8px 12px' }} 
                />
                <select 
                  value={editDpCode} 
                  onChange={e => setEditDpCode(e.target.value)} 
                  className="select-input"
                  style={{ fontSize: 13, fontWeight: 600 }}
                >
                  {MEROSHARE_DP_LIST
                    .filter(dp => !editDpSearchQuery || dp.name.toLowerCase().includes(editDpSearchQuery.toLowerCase()) || dp.code.includes(editDpSearchQuery))
                    .map(dp => (
                      <option key={dp.id || dp.code} value={dp.code}>{dp.name}</option>
                    ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label className="input-label">Username</label>
                  <input type="text" required value={editUsername} onChange={e => setEditUsername(e.target.value)} className="input" placeholder="MeroShare Username" />
                </div>
                <div>
                  <label className="input-label">Password</label>
                  <input type="password" required value={editPassword} onChange={e => setEditPassword(e.target.value)} className="input" placeholder="••••" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div>
                  <label className="input-label">CRN Number</label>
                  <input type="text" required value={editCrn} onChange={e => setEditCrn(e.target.value)} className="input" placeholder="C-1234" />
                </div>
                <div>
                  <label className="input-label">4-Digit PIN</label>
                  <input type="password" maxLength="4" required value={editPin} onChange={e => setEditPin(e.target.value.replace(/\D/g, ''))} className="input" placeholder="0000" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={handleCancelEditProfile} className="btn-secondary" style={{ flex: 1, padding: '10px 0', fontSize: 13 }}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isSavingAccount}
                  className="btn-primary" 
                  style={{ flex: 2, padding: '10px 0', fontSize: 13, background: 'linear-gradient(135deg, #4f46e5, #0ea5e9)', border: 'none', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  {isSavingAccount && <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />}
                  {isSavingAccount ? 'Verifying with CDSC...' : 'Save Account Changes ✓'}
                </button>
              </div>
            </form>
          )}

          {/* Profile Management Cards */}
          {profiles.length > 0 && !showAddForm && !editingProfileId && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 className="section-title" style={{ marginBottom: 0 }}>Registered Accounts ({profiles.length})</h3>
                <span style={{ fontSize: 10, color: 'var(--bull)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ShieldCheck style={{ width: 14, height: 14 }} /> Local Secure Storage
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
                {profiles.map(p => (
                  <div key={p.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', marginBottom: 0 }}>
                    <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                      <div style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text-primary)' }}>{p.name || 'Account'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.dpName || 'Capital DP'} • BOID: ...{p.boid ? String(p.boid).slice(-4) : '****'}</div>
                      <div style={{ fontSize: 10.5, color: '#38bdf8', marginTop: 2, fontFamily: 'var(--font-mono)' }}>@{p.username || ''}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button 
                        onClick={() => handleTestConnection(p)}
                        disabled={testingProfileId === p.id}
                        className="btn-secondary" 
                        style={{ padding: '6px 10px', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4, borderColor: 'rgba(56,189,248,0.3)', color: '#38bdf8', background: 'rgba(56,189,248,0.08)' }}
                        title="Test CDSC login credentials"
                      >
                        {testingProfileId === p.id ? (
                          <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />
                        ) : (
                          <RefreshCw style={{ width: 12, height: 12 }} />
                        )}
                        Test
                      </button>
                      <button 
                        onClick={() => handleStartEditProfile(p)} 
                        className="icon-btn" 
                        style={{ border: '1px solid rgba(79,70,229,0.3)', background: 'rgba(79,70,229,0.1)', padding: 7, borderRadius: 'var(--radius-sm)' }}
                        title="Edit MeroShare Profile"
                      >
                        <Edit3 style={{ width: 15, height: 15, color: 'var(--primary-light)' }} />
                      </button>
                      <button 
                        onClick={() => handleDeleteProfile(p.id)} 
                        className="icon-btn" 
                        style={{ border: '1px solid rgba(245,69,92,0.25)', background: 'rgba(245,69,92,0.08)', padding: 7, borderRadius: 'var(--radius-sm)' }}
                        title="Delete Profile"
                      >
                        <Trash2 style={{ width: 15, height: 15, color: 'var(--bear)' }} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {profiles.length === 0 && !showAddForm && (
            <div style={{ textAlign: 'center', padding: '32px 0', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
              <HelpCircle style={{ width: 32, height: 32, color: 'var(--text-muted)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>No profiles added yet.</p>
              <button onClick={() => setShowAddForm(true)} className="btn-primary" style={{ padding: '8px 16px', fontSize: 12 }}>Add First Account</button>
            </div>
          )}

          {/* Bulk Apply Wizard Section */}
          {showWizard && profiles.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span className="badge badge-primary">Apply Wizard</span>
                <button onClick={() => setShowWizard(false)} style={{ fontSize: 12, color: 'var(--bear)', fontWeight: 600, cursor: 'pointer', background: 'transparent', border: 'none' }}>Exit Wizard</button>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Apply IPO for issue <b style={{ color: 'var(--text-primary)' }}>{getActiveIpo().name}</b> across all accounts. Secure helper copies credentials in one click.
              </p>

              {/* Current Profile details */}
              <div className="card" style={{ background: 'rgba(255,255,255,0.03)', padding: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Account {wizardStep + 1} of {profiles.length}</span>
                  <span style={{ fontWeight: 'bold', fontSize: 14, color: 'var(--primary-light)' }}>{profiles[wizardStep].name}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                  <div style={{ padding: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>DP / BANK ID</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{profiles[wizardStep].dpCode}</div>
                    </div>
                    <button 
                      onClick={() => handleCopy(profiles[wizardStep].dpCode, 'dp')}
                      style={{ color: 'var(--primary-light)', cursor: 'pointer', background: 'transparent', border: 'none' }}
                    >
                      {copiedField === 'dp' ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                    </button>
                  </div>

                  <div style={{ padding: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>USERNAME</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{profiles[wizardStep].username}</div>
                    </div>
                    <button 
                      onClick={() => handleCopy(profiles[wizardStep].username, 'username')}
                      style={{ color: 'var(--primary-light)', cursor: 'pointer', background: 'transparent', border: 'none' }}
                    >
                      {copiedField === 'username' ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                  <div style={{ padding: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>PASSWORD</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>••••••••</div>
                    </div>
                    <button 
                      onClick={() => handleCopy(profiles[wizardStep].password, 'pass')}
                      style={{ color: 'var(--primary-light)', cursor: 'pointer', background: 'transparent', border: 'none' }}
                    >
                      {copiedField === 'pass' ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                    </button>
                  </div>

                  <div style={{ padding: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>CRN NUMBER</div>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{profiles[wizardStep].crn}</div>
                    </div>
                    <button 
                      onClick={() => handleCopy(profiles[wizardStep].crn, 'crn')}
                      style={{ color: 'var(--primary-light)', cursor: 'pointer', background: 'transparent', border: 'none' }}
                    >
                      {copiedField === 'crn' ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                    </button>
                  </div>
                </div>

                <div style={{ padding: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <div>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block' }}>4-Digit ASBA PIN</span>
                    <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{profiles[wizardStep].pin}</span>
                  </div>
                  <button 
                    onClick={() => handleCopy(profiles[wizardStep].pin, 'pin')}
                    style={{ color: 'var(--primary-light)', cursor: 'pointer', background: 'transparent', border: 'none' }}
                  >
                    {copiedField === 'pin' ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                  </button>
                </div>
              </div>

              {isWizardApplying && (
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, marginBottom: 12, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Loader2 style={{ width: 18, height: 18, color: 'var(--primary-light)' }} className="animate-spin" />
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{wizardMessage}</span>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button 
                  onClick={handleWizardApplyLive}
                  disabled={isWizardApplying}
                  className="btn-success"
                  style={{ fontSize: 12, flex: 2, padding: '10px 0', minWidth: 140, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                >
                  {isWizardApplying ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : '⚡ Auto-Apply Live'}
                </button>

                <a 
                  href="https://meroshare.cdsc.com.np/" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="btn-secondary"
                  style={{ fontSize: 12, flex: 1, padding: '10px 0', textDecoration: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, minWidth: 120 }}
                >
                  Manual Open <ExternalLink style={{ width: 14, height: 14 }} />
                </a>

                {wizardStep < profiles.length - 1 ? (
                  <button 
                    onClick={() => {
                      setAppliedStatus(prev => ({ ...prev, [profiles[wizardStep].id]: 'applied' }));
                      setWizardStep(prev => prev + 1);
                    }}
                    disabled={isWizardApplying}
                    className="btn-primary"
                    style={{ fontSize: 12, flex: 1, padding: '10px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, minWidth: 120 }}
                  >
                    Skip / Next <ArrowRight style={{ width: 14, height: 14 }} />
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setAppliedStatus(prev => ({ ...prev, [profiles[wizardStep].id]: 'applied' }));
                      setShowWizard(false);
                      showToast("Awesome! You completed applying IPO across all your registered family profiles.", "success");
                    }}
                    disabled={isWizardApplying}
                    className="btn-bull"
                    style={{ fontSize: 12, flex: 1, padding: '10px 0', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, minWidth: 120 }}
                  >
                    Finish 🎉
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Custom Proxy Server Settings (Only when not showing Wizard) */}
          {!showWizard && (
            <div className="card" style={{ marginTop: 16, padding: '14px 16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
              <h4 style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--primary-light)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                ⚙️ Proxy Server Configuration
              </h4>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginBottom: 12 }}>
                The mobile app connects to a secure proxy backend to query CDSC/MeroShare. If the default Vercel server is blocked or offline, you can configure a custom proxy server IP/domain here.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input 
                  type="text" 
                  defaultValue={typeof localStorage !== 'undefined' ? (localStorage.getItem('custom_proxy_base') || '') : ''} 
                  onChange={e => {
                    const val = e.target.value.trim();
                    if (typeof localStorage !== 'undefined') {
                      if (val) {
                        localStorage.setItem('custom_proxy_base', val);
                      } else {
                        localStorage.removeItem('custom_proxy_base');
                      }
                    }
                  }}
                  placeholder="e.g. http://192.168.1.100:5000"
                  className="text-input"
                  style={{ padding: '8px 12px', fontSize: 12, flex: 1, background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}
                />
                <button 
                  onClick={() => {
                    if (typeof localStorage !== 'undefined') {
                      localStorage.removeItem('custom_proxy_base');
                    }
                    window.location.reload();
                  }}
                  className="btn-secondary"
                  style={{ padding: '8px 14px', fontSize: 12, borderColor: 'rgba(255,255,255,0.1)', cursor: 'pointer' }}
                >
                  Reset
                </button>
                <button 
                  onClick={() => {
                    window.location.reload();
                  }}
                  className="btn-primary"
                  style={{ padding: '8px 14px', fontSize: 12, cursor: 'pointer' }}
                >
                  Save & Apply
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Sub Tab: IPO ALLOTMENT ── */}
      {activeSubTab === 'ipo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {Array.isArray(profiles) && profiles.length > 0 ? (
            <>
              {/* Bulk checking & Actions Hub */}
              <div className="card">
                <h3 className="section-title" style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Bulk Tools</h3>

                {/* Secondary Sub-Sub-Tabs Navigation */}
                <div className="tab-bar" style={{ marginBottom: 20, background: 'rgba(255,255,255,0.03)', padding: 4, borderRadius: 'var(--radius-md)' }}>
                  <button 
                    onClick={() => {
                      setIpoSubTab('apply');
                      const openIpos = Array.isArray(ipoCompanies) ? ipoCompanies.filter(ipo => ipo && ipo.status === 'Open') : [];
                      if (openIpos.length > 0) {
                        setSelectedIpo(String(openIpos[0].id || ''));
                        setCustomAppliedKitta(openIpos[0].minKitta || 10);
                      }
                    }} 
                    className={`tab-btn ${ipoSubTab === 'apply' ? 'active' : ''}`}
                    style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, padding: '12px 0' }}
                  >
                    🚀 Bulk Apply
                  </button>
                  <button 
                    onClick={() => {
                      setIpoSubTab('check');
                      const allottedIpos = Array.isArray(ipoCompanies) ? ipoCompanies.filter(ipo => ipo && ipo.status !== 'Open') : [];
                      if (allottedIpos.length > 0) {
                        setSelectedIpo(String(allottedIpos[0].id || ''));
                      } else if (Array.isArray(ipoCompanies) && ipoCompanies.length > 0) {
                        setSelectedIpo(String(ipoCompanies[0].id || ''));
                      }
                    }} 
                    className={`tab-btn ${ipoSubTab === 'check' ? 'active' : ''}`}
                    style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, padding: '12px 0' }}
                  >
                    🗳️ Bulk Allotment Check
                  </button>
                </div>

                {isLoadingIpos && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, background: 'rgba(59,130,246,0.1)', borderRadius: 'var(--radius-md)', marginBottom: 16, fontSize: 14, fontWeight: 600, color: 'var(--primary-light)', border: '1px solid rgba(59,130,246,0.3)' }}>
                    <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" />
                    <span>Connecting directly to CDSC IPO servers...</span>
                  </div>
                )}

                {ipoLoadError && !isLoadingIpos && (
                  <div style={{ padding: '12px 16px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-md)', color: '#fca5a5', fontSize: 13.5, fontWeight: 600, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 16 }}>⚠️</span>
                    <span>{ipoLoadError}</span>
                  </div>
                )}

                {ipoSubTab === 'apply' ? (
                  <>
                    {/* Bulk Apply Sub-tab UI */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label className="input-label" style={{ marginBottom: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                          Select Open IPO Issue
                        </label>
                        <button 
                          onClick={() => loadIpoCompanies()} 
                          style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <RefreshCw style={{ width: 14, height: 14 }} /> Refresh List
                        </button>
                      </div>
                      
                      {isLoadingIpos ? (
                        <div style={{ padding: '18px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px dashed rgba(255,255,255,0.2)', textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
                          Fetching open IPO issues...
                        </div>
                      ) : (Array.isArray(ipoCompanies) && ipoCompanies.filter(ipo => ipo && ipo.status === 'Open').length > 0) ? (
                        <select 
                          value={selectedIpo} 
                          onChange={e => {
                            const val = e.target.value;
                            setSelectedIpo(val);
                            setManualCompanyId(val);
                            const selectedObj = (ipoCompanies || []).find(ipo => ipo && String(ipo.id) === String(val));
                            if (selectedObj) {
                              setCustomAppliedKitta(selectedObj.minKitta || 10);
                            }
                          }} 
                          className="select-input"
                          style={{ fontSize: 15, fontWeight: 700, padding: '12px 14px', color: '#ffffff', background: '#0b1120', border: '1.5px solid #334155' }}
                        >
                          {(ipoCompanies || []).filter(ipo => ipo && ipo.status === 'Open').map(ipo => (
                            <option key={ipo.id || ipo.name} value={ipo.id}>
                              {ipo.name || 'Unknown Company'} ({ipo.type || 'IPO'}) — Closes {ipo.closeDate ? (typeof ipo.closeDate === 'string' ? ipo.closeDate.split('T')[0] : 'Soon') : 'Soon'}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ padding: '20px 16px', background: 'rgba(245,158,11,0.08)', borderRadius: 'var(--radius-md)', border: '1px dashed rgba(245,158,11,0.3)', textAlign: 'center', fontSize: 14 }}>
                          <div style={{ fontSize: 24, marginBottom: 8 }}>📭</div>
                          <div style={{ color: 'var(--accent-amber)', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>No Live IPO Issues Currently Open</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>There are no public issues accepting applications right now. Check back when a new IPO opens.</div>
                        </div>
                      )}
                    </div>

                    {/* Quantity & Lock details */}
                    {(() => {
                      const activeIpo = getActiveIpo();
                      if (!activeIpo || activeIpo.name === 'Loading...' || activeIpo.status !== 'Open') return null;

                      return (
                        <div style={{ marginBottom: 16 }}>
                          <label className="input-label" style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                            Quantity to Apply per Account (Kitta)
                          </label>
                          <input 
                            type="number" 
                            value={customAppliedKitta}
                            onChange={e => {
                              const val = parseInt(e.target.value);
                              setCustomAppliedKitta(isNaN(val) ? '' : val);
                            }}
                            onBlur={() => {
                              const min = activeIpo.minKitta || 10;
                              const max = activeIpo.maxKitta || 10000;
                              let val = Math.max(min, Math.min(max, customAppliedKitta || min));
                              val = Math.round(val / 10) * 10;
                              setCustomAppliedKitta(Math.max(min, Math.min(max, val)));
                            }}
                            min={activeIpo.minKitta || 10}
                            max={activeIpo.maxKitta || 10000}
                            step={10}
                            className="text-input"
                            style={{ width: '100%', padding: '12px 14px', fontSize: 16, fontWeight: 800, color: '#ffffff', background: '#0b1120', border: '1.5px solid #334155' }}
                          />
                          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-secondary)', marginTop: 6, marginBottom: 14 }}>
                            Allowed Limits: {activeIpo.minKitta || 10} - {activeIpo.maxKitta || 10000} kitta (Multiples of 10 kitta)
                          </div>

                          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1.5px solid rgba(255,255,255,0.1)', padding: 14, marginBottom: 16, borderRadius: 'var(--radius-md)' }}>
                            <h4 style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--primary-light)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                              <Wallet style={{ width: 16, height: 16 }} /> Cost & C-ASBA Lock Estimate
                            </h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, marginTop: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Price per share:</span>
                                <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{formatRs(activeIpo.amountPerShare || 100)}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>Required per Profile ({customAppliedKitta || 10} Kitta):</span>
                                <span style={{ fontWeight: 800, color: 'var(--bull)', fontSize: 15 }}>{formatRs((customAppliedKitta || 10) * (activeIpo.amountPerShare || 100))}</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 8, marginTop: 4 }}>
                                <span style={{ color: 'var(--text-primary)', fontWeight: 800 }}>Total for {profiles.filter(p => selectedAccountIds.includes(p.id)).length} selected profiles:</span>
                                <span style={{ fontWeight: 900, color: 'var(--primary-light)', fontSize: 16 }}>{formatRs(profiles.filter(p => selectedAccountIds.includes(p.id)).length * (customAppliedKitta || 10) * (activeIpo.amountPerShare || 100))}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* MeroShare accounts checklist (Apply) */}
                    {profiles.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <label className="input-label" style={{ marginBottom: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                            Select MeroShare Accounts ({selectedAccountIds.length}/{profiles.length})
                          </label>
                          <button 
                            onClick={() => {
                              const targetProfiles = profiles.filter(filterProfileBySearch);
                              const allSelected = targetProfiles.length > 0 && targetProfiles.every(p => selectedAccountIds.includes(p.id));
                              if (allSelected) {
                                setSelectedAccountIds(prev => prev.filter(id => !targetProfiles.some(p => p.id === id)));
                              } else {
                                setSelectedAccountIds(prev => [...new Set([...prev, ...targetProfiles.map(p => p.id)])]);
                              }
                            }} 
                            style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                          >
                            {profiles.filter(filterProfileBySearch).length > 0 && profiles.filter(filterProfileBySearch).every(p => selectedAccountIds.includes(p.id)) ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          <input 
                            type="text"
                            value={accountSearchQuery}
                            onChange={e => setAccountSearchQuery(e.target.value)}
                            placeholder="Search registered accounts..."
                            className="input"
                            style={{ padding: '10px 14px', fontSize: 14, fontWeight: 600, borderRadius: 'var(--radius-md)', background: '#0b1120', border: '1.5px solid #334155' }}
                          />
                        </div>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr', 
                          gap: 10, 
                          maxHeight: 220, 
                          overflowY: 'auto', 
                          padding: '4px 4px 4px 0',
                          marginBottom: 16
                        }}>
                          {profiles.filter(filterProfileBySearch).map(p => {
                            const isChecked = selectedAccountIds.includes(p.id);
                            return (
                              <div 
                                key={p.id}
                                onClick={() => {
                                  setSelectedAccountIds(prev => 
                                    isChecked ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                  );
                                }}
                                style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '12px 16px', 
                                  borderRadius: 'var(--radius-md)',
                                  background: isChecked ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.02)',
                                  border: isChecked ? '2px solid #3b82f6' : '1.5px solid var(--border)',
                                  cursor: 'pointer',
                                  transition: 'var(--transition)'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ 
                                    width: 22, 
                                    height: 22, 
                                    borderRadius: 6, 
                                    border: isChecked ? '2px solid #60a5fa' : '2px solid #64748b',
                                    background: isChecked ? '#2563eb' : 'transparent',
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    transition: 'var(--transition)'
                                  }}>
                                    {isChecked && <Check style={{ width: 15, height: 15, color: '#ffffff', strokeWidth: 3 }} />}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: '#ffffff' }}>{p.name || 'Account'}</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#93c5fd', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                                      BOID: {p.boid || ''}
                                    </div>
                                  </div>
                                </div>
                                <span style={{ fontSize: 12.5, color: '#38bdf8', background: 'rgba(56,189,248,0.12)', padding: '4px 10px', borderRadius: 50, fontWeight: 800, border: '1px solid rgba(56,189,248,0.3)' }}>
                                  {p.username || ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Action buttons (Apply) */}
                    {profiles.length > 0 && (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button 
                          onClick={handleCheckAlreadyApplied} 
                          disabled={isCheckingApplied || isApplying} 
                          className="btn-secondary"
                          style={{ padding: '14px 0', fontSize: 14.5, fontWeight: 800, flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 'var(--radius-md)' }}
                        >
                          {isCheckingApplied ? <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" /> : 'Verify Already Applied 🔍'}
                        </button>
                        <button 
                          onClick={handleBulkApply}
                          disabled={isApplying || isCheckingApplied}
                          className="btn-primary"
                          style={{ padding: '14px 0', fontSize: 15, fontWeight: 900, flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none' }}
                        >
                          {isApplying ? <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" /> : 'Run Bulk Apply 🚀'}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Bulk Check Sub-tab UI */}
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <label className="input-label" style={{ marginBottom: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                          Select Allotted Company (CDSC Result Portal)
                        </label>
                        <button 
                          onClick={() => loadIpoCompanies()} 
                          style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <RefreshCw style={{ width: 14, height: 14 }} /> Refresh List
                        </button>
                      </div>
                      {isLoadingIpos ? (
                        <div style={{ padding: '18px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px dashed rgba(255,255,255,0.2)', textAlign: 'center', fontSize: 14, color: 'var(--text-secondary)' }}>
                          Connecting to CDSC iporesult.cdsc.com.np...
                        </div>
                      ) : (ipoCompanies || []).filter(ipo => ipo && ipo.status !== 'Open').length > 0 ? (
                        <select 
                          value={selectedIpo} 
                          onChange={e => {
                            setSelectedIpo(e.target.value);
                            setManualCompanyId(e.target.value);
                          }} 
                          className="select-input"
                          style={{ fontSize: 15, fontWeight: 700, padding: '12px 14px', color: '#ffffff', background: '#0b1120', border: '1.5px solid #334155' }}
                        >
                          {(ipoCompanies || []).filter(ipo => ipo && ipo.status !== 'Open').map(ipo => (
                            <option key={ipo.id || ipo.name} value={ipo.id}>
                              {ipo.name} {ipo.scrip ? `(${ipo.scrip})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ padding: '20px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)', textAlign: 'center', fontSize: 14 }}>
                          <div style={{ fontSize: 24, marginBottom: 8 }}>🗳️</div>
                          <div style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Loading CDSC Allotment Results...</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>Please tap Refresh to reload the official CDSC result list.</div>
                        </div>
                      )}
                    </div>

                    {/* MeroShare accounts checklist (Check) */}
                    {profiles.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <label className="input-label" style={{ marginBottom: 0, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>
                            Select Family Accounts to Check ({selectedAccountIds.length}/{profiles.length})
                          </label>
                          <button 
                            onClick={() => {
                              const targetProfiles = profiles.filter(filterProfileBySearch);
                              const allSelected = targetProfiles.length > 0 && targetProfiles.every(p => selectedAccountIds.includes(p.id));
                              if (allSelected) {
                                setSelectedAccountIds(prev => prev.filter(id => !targetProfiles.some(p => p.id === id)));
                              } else {
                                setSelectedAccountIds(prev => [...new Set([...prev, ...targetProfiles.map(p => p.id)])]);
                              }
                            }} 
                            style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}
                          >
                            {profiles.filter(filterProfileBySearch).length > 0 && profiles.filter(filterProfileBySearch).every(p => selectedAccountIds.includes(p.id)) ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                          <input 
                            type="text"
                            value={accountSearchQuery}
                            onChange={e => setAccountSearchQuery(e.target.value)}
                            placeholder="Search registered accounts..."
                            className="input"
                            style={{ padding: '10px 14px', fontSize: 14, fontWeight: 600, borderRadius: 'var(--radius-md)', background: '#0b1120', border: '1.5px solid #334155' }}
                          />
                        </div>
                        <div style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1fr', 
                          gap: 10, 
                          maxHeight: 220, 
                          overflowY: 'auto', 
                          padding: '4px 4px 4px 0',
                          marginBottom: 16
                        }}>
                          {profiles.filter(filterProfileBySearch).map(p => {
                            const isChecked = selectedAccountIds.includes(p.id);
                            return (
                              <div 
                                key={p.id}
                                onClick={() => {
                                  setSelectedAccountIds(prev => 
                                    isChecked ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                  );
                                }}
                                style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center', 
                                  padding: '12px 16px', 
                                  borderRadius: 'var(--radius-md)',
                                  background: isChecked ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.02)',
                                  border: isChecked ? '2px solid #3b82f6' : '1.5px solid var(--border)',
                                  cursor: 'pointer',
                                  transition: 'var(--transition)'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                  <div style={{ 
                                    width: 22, 
                                    height: 22, 
                                    borderRadius: 6, 
                                    border: isChecked ? '2px solid #60a5fa' : '2px solid #64748b',
                                    background: isChecked ? '#2563eb' : 'transparent',
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    transition: 'var(--transition)'
                                  }}>
                                    {isChecked && <Check style={{ width: 15, height: 15, color: '#ffffff', strokeWidth: 3 }} />}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: 15, fontWeight: 800, color: '#ffffff' }}>{p.name || 'Account'}</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: '#93c5fd', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                                      BOID: {p.boid || ''}
                                    </div>
                                  </div>
                                </div>
                                <span style={{ fontSize: 12.5, color: '#38bdf8', background: 'rgba(56,189,248,0.12)', padding: '4px 10px', borderRadius: 50, fontWeight: 800, border: '1px solid rgba(56,189,248,0.3)' }}>
                                  {p.username || ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Action buttons (Check) */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button 
                        onClick={handleBulkCheck} 
                        disabled={isChecking} 
                        className="btn-primary"
                        style={{ padding: '14px 0', fontSize: 16, fontWeight: 900, flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, #4f46e5, #0ea5e9)', border: 'none' }}
                      >
                        {isChecking ? <Loader2 style={{ width: 18, height: 18 }} className="animate-spin" /> : '🎯 Check All Selected Accounts in 1-Click'}
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Already Applied Check Results display */}
              {ipoSubTab === 'apply' && appliedCheckResults.length > 0 && (
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 className="section-title" style={{ marginBottom: 0, color: 'var(--text-primary)', fontSize: 16 }}>C-ASBA Application Status</h3>
                    <button 
                      onClick={() => setAppliedCheckResults([])}
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Clear
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {appliedCheckResults.map(res => (
                      <div 
                        key={res.id} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          padding: '14px 16px', 
                          background: res.status === 'applied' ? 'rgba(16,217,138,0.1)' : 'rgba(255,255,255,0.03)', 
                          border: res.status === 'applied' ? '1.5px solid rgba(16,217,138,0.4)' : '1px solid rgba(255,255,255,0.08)', 
                          borderRadius: 'var(--radius-md)' 
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 800, fontSize: 15, color: '#ffffff' }}>{res.name}</div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: res.status === 'applied' ? 'var(--bull)' : res.status === 'failed' ? '#f87171' : 'var(--text-secondary)', marginTop: 3 }}>
                            {res.resultText}
                          </div>
                        </div>
                        <div>
                          {res.status === 'loading' && <Loader2 style={{ width: 18, height: 18, color: 'var(--primary-light)' }} className="animate-spin" />}
                          {res.status === 'applied' && <CheckCircle2 style={{ width: 22, height: 22, color: 'var(--bull)' }} />}
                          {res.status === 'not_applied' && <HelpCircle style={{ width: 20, height: 20, color: 'var(--text-secondary)' }} />}
                          {res.status === 'failed' && <ShieldAlert style={{ width: 20, height: 20, color: '#f87171' }} />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bulk Check Results display */}
              {ipoSubTab === 'check' && checkResults.length > 0 && (
                <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 className="section-title" style={{ marginBottom: 0, color: '#ffffff', fontSize: 17, fontWeight: 800 }}>CDSC Lottery Results</h3>
                    <button 
                      onClick={() => setCheckResults([])}
                      style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Clear Report
                    </button>
                  </div>

                  {/* Summary Stats Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ 
                      background: 'rgba(16,217,138,0.1)', 
                      border: '1.5px solid rgba(16,217,138,0.3)', 
                      borderRadius: 'var(--radius-md)', 
                      padding: '14px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Allotted Shares</span>
                      <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--bull)', fontFamily: 'var(--font-mono)' }}>
                        {checkResults.reduce((acc, curr) => acc + (curr.units || 0), 0)} Units
                      </span>
                    </div>
                    <div style={{ 
                      background: 'rgba(59,130,246,0.1)', 
                      border: '1.5px solid rgba(59,130,246,0.3)', 
                      borderRadius: 'var(--radius-md)', 
                      padding: '14px 12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4
                    }}>
                      <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Successful Accounts</span>
                      <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary-light)' }}>
                        {checkResults.filter(r => r.status === 'allotted').length} / {checkResults.length}
                      </span>
                    </div>
                  </div>

                  {/* Winning Summary Celebratory card */}
                  {checkResults.some(r => r.status === 'allotted') && (
                    <div style={{ 
                      background: 'rgba(16,217,138,0.15)', 
                      border: '2px solid rgba(16,217,138,0.4)', 
                      padding: 16, 
                      borderRadius: 'var(--radius-md)',
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: 12
                    }}>
                      <Sparkles style={{ width: 24, height: 24, color: 'var(--bull)', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--bull)' }}>🎉 CONGRATULATIONS! ALLOTMENT SUCCESSFUL</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#ffffff' }}>
                          Shares were successfully allotted to your family accounts!
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Detailed Result Cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {checkResults.map((r, i) => (
                      <div 
                        key={i} 
                        style={{ 
                          padding: '14px 16px', 
                          borderRadius: 'var(--radius-md)', 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          background: r.status === 'allotted' ? 'rgba(16,217,138,0.12)' : 'rgba(255,255,255,0.02)',
                          border: r.status === 'allotted' ? '2px solid rgba(16,217,138,0.4)' : '1px solid var(--border)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          {r.status === 'allotted' ? (
                            <CheckCircle2 style={{ width: 24, height: 24, color: 'var(--bull)', flexShrink: 0 }} />
                          ) : r.status === 'loading' ? (
                            <Loader2 style={{ width: 22, height: 22, color: 'var(--primary-light)', flexShrink: 0 }} className="animate-spin" />
                          ) : (
                            <HelpCircle style={{ width: 22, height: 22, color: 'var(--text-secondary)', flexShrink: 0 }} />
                          )}
                          <div>
                            <div style={{ fontSize: 15.5, fontWeight: 800, color: '#ffffff' }}>{r.name || 'Account'}</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#93c5fd', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                              BOID: {r.boid || profiles.find(p => p && p.id === r.id)?.boid || ''}
                            </div>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: r.status === 'allotted' ? 'var(--bull)' : '#f87171', marginTop: 3 }}>
                              {r.resultText}
                            </div>
                          </div>
                        </div>

                        {r.status === 'allotted' && r.units > 0 && (
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--bull)', fontFamily: 'var(--font-mono)' }}>
                              +{r.units} Kitta
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bulk Apply Results */}
              {ipoSubTab === 'apply' && applyResults.length > 0 && (
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 className="section-title" style={{ marginBottom: 0, color: '#ffffff', fontSize: 16 }}>Bulk Apply Results</h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 250, overflowY: 'auto', paddingRight: 4 }}>
                    {applyResults.map(res => (
                      <div key={res.id}
                        style={{
                          padding: '14px 16px', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          ...(res.status === 'applied' ? { background: 'rgba(16,217,138,0.12)', border: '2px solid rgba(16,217,138,0.4)' } :
                            res.status === 'loading' ? { background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)' } :
                            { background: 'rgba(239,68,68,0.1)', border: '1.5px solid rgba(239,68,68,0.3)' })
                        }}>
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ fontWeight: 800, fontSize: 15.5, color: '#ffffff' }}>
                            {res.name}
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 700, color: res.status === 'applied' ? 'var(--bull)' : '#f87171', marginTop: 3 }}>
                            {res.resultText}
                          </div>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {res.status === 'applied' && (
                            <span className="badge badge-bull" style={{ padding: '6px 12px', borderRadius: 50, fontSize: 12, fontWeight: 900 }}>Applied</span>
                          )}
                          {res.status === 'loading' && (
                            <Loader2 style={{ width: 20, height: 20, color: 'var(--primary-light)' }} className="animate-spin" />
                          )}
                          {res.status === 'failed' && (
                            <span className="badge badge-bear" style={{ padding: '6px 12px', borderRadius: 50, fontSize: 12, fontWeight: 900 }}>Failed</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '32px 16px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <Sparkles style={{ width: 32, height: 32, color: 'var(--text-muted)' }} />
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: 4 }}>No Registered Accounts</h4>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Add a MeroShare account profile in the Accounts tab to verify IPO allotments.
                </p>
              </div>
              <button 
                onClick={() => setActiveSubTab('accounts')} 
                className="btn-primary" 
                style={{ padding: '8px 16px', fontSize: 12 }}
              >
                Go to Accounts Tab
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Sub Tab: DEMAT PORTFOLIO ── */}
      {activeSubTab === 'portfolio' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* WAF warning banner for web clients */}
          {!Capacitor.isNativePlatform() && (
            <div className="fade-in" style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px dashed rgba(239, 68, 68, 0.4)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4
            }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#f87171' }}>⚠️ Cloud Firewall (WAF) Limit</span>
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>
                CDSC's security firewall blocks direct connections from cloud hosts (Vercel/Render). 
                If <b>Auto</b> sync fails, please use the <b>CSV</b> method (recommended) or paste a <b>Token</b> to sync your holdings.
              </p>
            </div>
          )}

          {profiles.length > 0 ? (
            <>
              {/* Profile selector and Sync action */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 className="section-title" style={{ marginBottom: 0, color: 'var(--text-primary)' }}>Secure Demat Fetch</h3>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button 
                      onClick={() => { setShowTokenInput(false); setShowCsvImport(false); }}
                      className={`badge ${!showTokenInput && !showCsvImport ? 'badge-primary' : 'badge-gray'}`}
                      style={{ border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 10 }}
                    >
                      Auto
                    </button>
                    <button 
                      onClick={() => { setShowTokenInput(true); setShowCsvImport(false); }}
                      className={`badge ${showTokenInput ? 'badge-primary' : 'badge-gray'}`}
                      style={{ border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 10 }}
                    >
                      Token
                    </button>
                    <button 
                      onClick={() => { setShowCsvImport(true); setShowTokenInput(false); }}
                      className={`badge ${showCsvImport ? 'badge-primary' : 'badge-gray'}`}
                      style={{ border: 'none', cursor: 'pointer', padding: '4px 8px', fontSize: 10 }}
                    >
                      CSV
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <select 
                      value={selectedProfileId} 
                      onChange={e => {
                        setSelectedProfileId(e.target.value);
                        setSearchQuery('');
                      }} 
                      className="select-input"
                    >
                      {profiles.map(p => (
                        <option key={p.id} value={p.id}>{p.name || 'Account'} (BOID: ...{p.boid ? String(p.boid).slice(-4) : '****'})</option>
                      ))}
                    </select>
                  </div>
                  
                  {!showTokenInput && !showCsvImport && (
                    <button 
                      onClick={() => handleRetrievePortfolio(selectedProfileId)} 
                      disabled={isRetrieving}
                      className="btn-primary" 
                      style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, borderRadius: 'var(--radius-md)' }}
                    >
                      <RefreshCw style={{ width: 14, height: 14 }} className={isRetrieving ? 'animate-spin' : ''} /> 
                      {syncedProfileIds.includes(selectedProfileId) ? 'Re-Sync' : 'Fetch'}
                    </button>
                  )}
                </div>

                {/* Last synced timestamp / error indicator */}
                {(() => {
                  const selProfile = profiles.find(p => p.id === selectedProfileId);
                  const currentError = syncErrors[selectedProfileId];
                  if (currentError) {
                    return (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--bear)', marginTop: -4 }}>
                        <AlertCircle style={{ width: 11, height: 11 }} />
                        <span>Sync Interrupted — Retry available</span>
                      </div>
                    );
                  }
                  const lastSync = selProfile?.lastSyncedAt;
                  if (!lastSync) return null;
                  const diff = Date.now() - lastSync;
                  const mins = Math.floor(diff / 60000);
                  const hrs  = Math.floor(mins / 60);
                  const label = hrs > 0 ? `${hrs}h ${mins % 60}m ago` : mins > 0 ? `${mins}m ago` : 'just now';
                  const holdingCount = selProfile?.holdings?.length || 0;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--bull)', marginTop: -4 }}>
                      <CheckCircle2 style={{ width: 11, height: 11 }} />
                      Synced {label} · {holdingCount} holdings loaded
                    </div>
                  );
                })()}

                {/* Token Sync UI */}
                {showTokenInput && (
                  <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--primary-light)' }}>Session Token Sync (Immune to WAF blocks)</span>
                      <a 
                        href="javascript:(function(){const t=sessionStorage.getItem('active-user-token')||localStorage.getItem('active-user-token')||JSON.parse(localStorage.getItem('user'))?.token;if(t){navigator.clipboard.writeText(t);alert('MeroShare Token Copied to Clipboard!');}else{alert('Please log into MeroShare first!');}})();"
                        className="badge badge-bull"
                        style={{ fontSize: 9, padding: '2px 6px', textDecoration: 'none', cursor: 'help' }}
                        title="Drag this button to your bookmarks bar. Log into MeroShare, click it to copy your token, and paste it here!"
                      >
                        🌟 Get Bookmarklet
                      </a>
                    </div>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Log into the official MeroShare in another tab, open DevTools (F12) &rarr; Application &rarr; Session Storage &rarr; <code>active-user-token</code> (or use the Bookmarklet), copy the token, and paste it below:
                    </p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input 
                        type="text" 
                        className="input" 
                        placeholder="Bearer eyJhbGciOiJIUzI1NiIsInR..." 
                        style={{ fontSize: 11, height: 32 }}
                        value={sessionToken}
                        onChange={e => setSessionToken(e.target.value)}
                      />
                      <button 
                        onClick={() => handleRetrieveWithToken(selectedProfileId, sessionToken)}
                        disabled={isRetrieving || !sessionToken}
                        className="btn-primary"
                        style={{ fontSize: 11, height: 32, padding: '0 12px' }}
                      >
                        Sync
                      </button>
                    </div>
                  </div>
                )}

                {/* CSV Import UI */}
                {showCsvImport && (
                  <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', marginTop: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--primary-light)' }}>Import MeroShare holdings CSV</span>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Go to MeroShare &rarr; <b>My Portfolio</b>, click <b>Export</b> / <b>Download CSV</b>, and upload it here to load your holdings instantly:
                    </p>
                    <input 
                      type="file" 
                      accept=".csv" 
                      onChange={(e) => handleCsvImport(e, selectedProfileId)}
                      className="input"
                      style={{ fontSize: 11, padding: '6px 8px' }}
                    />
                  </div>
                )}
              </div>

              {/* Retrieval Progress Overlay */}
              {isRetrieving && (
                <div className="card fade-in" style={{ textAlign: 'center', padding: '28px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <div style={{ position: 'relative', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <RefreshCw className="animate-spin" style={{ width: 36, height: 36, color: 'var(--primary-light)' }} />
                    <ShieldCheck style={{ width: 16, height: 16, color: 'var(--primary)', position: 'absolute' }} />
                  </div>
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>
                      Connecting to CDSC MeroShare...
                    </h4>
                    <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {retrievalStep === 1 && "Connecting to CDSC secure gateway..."}
                      {retrievalStep === 2 && "Authenticating encrypted credentials..."}
                      {retrievalStep === 3 && "Decrypting and fetching stock asset balances..."}
                      {retrievalStep === 4 && "Synchronizing balances with live NEPSE market feed..."}
                    </p>
                  </div>
                  <span className="badge badge-primary" style={{ fontSize: 9 }}>CDSC SECURE HANDSHAKE</span>
                </div>
              )}

              {/* Portfolio Dashboard when Synced */}
              {!isRetrieving && (() => {
                const profile = profiles.find(p => p.id === selectedProfileId);
                const hasHoldings = profile && profile.holdings && profile.holdings.length > 0;
                const currentError = syncErrors[selectedProfileId];

                // Case 1: Fetch/Sync failed with error
                if (currentError && !hasHoldings) {
                  return (
                    <div className="card fade-in" style={{ textAlign: 'center', padding: '28px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, border: '1px solid rgba(239, 68, 68, 0.35)', background: 'rgba(239, 68, 68, 0.04)' }}>
                      <div style={{ fontSize: 36 }}>⚠️</div>
                      <div>
                        <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--bear)', marginBottom: 6 }}>
                          CDSC Demat Sync Interrupted
                        </h4>
                        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
                          {currentError.includes('busy') || currentError.includes('rejected')
                            ? 'CDSC server is congested or rejected the connection during peak trading hours. Tap below to retry with backoff or import CSV.'
                            : currentError}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleRetrievePortfolio(selectedProfileId)}
                          disabled={isRetrieving}
                          className="btn-primary"
                          style={{ padding: '10px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 'var(--radius-md)' }}
                        >
                          <RefreshCw style={{ width: 15, height: 15 }} /> Retry Live CDSC Sync
                        </button>
                        <button
                          onClick={() => { setShowCsvImport(true); setShowTokenInput(false); }}
                          className="btn-secondary"
                          style={{ padding: '10px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 'var(--radius-md)' }}
                        >
                          📁 Import CSV / Excel
                        </button>
                      </div>
                    </div>
                  );
                }

                // Case 2: No holdings loaded yet or verified 0 holdings
                if (!hasHoldings) {
                  const wasSynced = profile && profile.lastSyncedAt && !currentError;
                  return (
                    <div className="card fade-in" style={{ textAlign: 'center', padding: '28px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                      <div style={{ fontSize: 36 }}>{wasSynced ? '✅' : '📊'}</div>
                      <div>
                        <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
                          {wasSynced ? 'CDSC Demat Connected (0 Active Scrips)' : 'No Holdings Synced Yet'}
                        </h4>
                        <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 360, margin: '0 auto' }}>
                          {wasSynced
                            ? 'MeroShare credentials authenticated successfully, and CDSC confirmed 0 settled shares for this DEMAT account. If you hold shares in this account, tap "Re-Sync CDSC" or import your MeroShare CSV portfolio below.'
                            : 'Click Fetch above to pull live share holdings directly from CDSC MeroShare, or import your exported CSV file.'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <button
                          onClick={() => handleRetrievePortfolio(selectedProfileId)}
                          disabled={isRetrieving}
                          className="btn-primary"
                          style={{ padding: '10px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 'var(--radius-md)' }}
                        >
                          <RefreshCw style={{ width: 15, height: 15 }} /> {wasSynced ? 'Re-Sync CDSC Live' : 'Fetch Holdings Now'}
                        </button>
                        <button
                          onClick={() => { setShowCsvImport(true); setShowTokenInput(false); }}
                          className="btn-secondary"
                          style={{ padding: '10px 18px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 'var(--radius-md)' }}
                        >
                          📁 Import CSV / Excel
                        </button>
                      </div>
                    </div>
                  );
                }

                const rawHoldings = Array.isArray(profile.holdings) ? profile.holdings : [];
                
                const enrichedHoldings = rawHoldings.map(h => {
                  const safeSymbol = (h.symbol || '').trim().toUpperCase();
                  const marketStock = marketStocks.find(s => (s.symbol || '').trim().toUpperCase() === safeSymbol);
                  const base = guessScripBasePrice(safeSymbol, h.wacc);

                  const prevClosePrice = h.prevClose > 0 ? h.prevClose : (h.valueAsOfPrevClose > 0 && h.units > 0 ? (h.valueAsOfPrevClose / h.units) : (h.currentLtp || base));
                  const ltpPrice = h.currentLtp > 0 ? h.currentLtp : (h.valueAsOfLTP > 0 && h.units > 0 ? (h.valueAsOfLTP / h.units) : (h.prevClose || base));
                  const livePrice = (marketStock && marketStock.ltp > 0) ? marketStock.ltp : ltpPrice;

                  const cdscPrevCloseValue = (h.valueAsOfPrevClose > 0)
                    ? h.valueAsOfPrevClose
                    : Number((h.units * prevClosePrice).toFixed(2));

                  const cdscValue = (h.valueAsOfLTP > 0)
                    ? h.valueAsOfLTP
                    : Number((h.units * ltpPrice).toFixed(2));

                  const liveValue = Number((h.units * livePrice).toFixed(2));

                  let effectivePrice = prevClosePrice;
                  let displayValue = cdscPrevCloseValue;
                  if (hubValuationMode === 'ltp') {
                    effectivePrice = ltpPrice;
                    displayValue = cdscValue;
                  } else if (hubValuationMode === 'live') {
                    effectivePrice = livePrice;
                    displayValue = liveValue;
                  }

                  const costValue = Number((h.units * (h.wacc || base)).toFixed(2));
                  const profitLoss = Number((displayValue - costValue).toFixed(2));
                  const plPercent = costValue > 0 ? Number(((profitLoss / costValue) * 100).toFixed(2)) : 0;
                  
                  return {
                    ...h,
                    currentPrice: effectivePrice,
                    change: marketStock?.change || 0,
                    pChange: marketStock?.pChange || 0,
                    currentValue: displayValue,
                    liveValue,
                    cdscValue,
                    cdscPrevCloseValue,
                    costValue,
                    profitLoss,
                    plPercent
                  };
                });
                
                const totalCost = enrichedHoldings.reduce((sum, h) => sum + (h.costValue || 0), 0);
                const totalCdscValue = enrichedHoldings.reduce((sum, h) => sum + (h.cdscValue || 0), 0);
                const totalLiveValue = enrichedHoldings.reduce((sum, h) => sum + (h.liveValue || 0), 0);
                const totalPrevCloseValue = enrichedHoldings.reduce((sum, h) => sum + (h.cdscPrevCloseValue || 0), 0);
                const totalValue = hubValuationMode === 'prevClose' 
                  ? totalPrevCloseValue 
                  : (hubValuationMode === 'ltp' ? totalCdscValue : totalLiveValue);
                const totalPL = totalValue - totalCost;
                const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

                const q = (searchQuery || '').toLowerCase().trim();
                const filteredHoldings = enrichedHoldings.filter(h => 
                  !q ||
                  String(h.symbol || '').toLowerCase().includes(q) || 
                  String(h.name || '').toLowerCase().includes(q)
                );

                return (
                  <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Valuation Mode Selector Bar */}
                    <div style={{ display: 'flex', gap: 4, background: 'rgba(255,255,255,0.03)', padding: 3, borderRadius: 8, border: '1px solid var(--border)' }}>
                      <button
                        type="button"
                        onClick={() => setHubValuationMode('prevClose')}
                        style={{
                          flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 800, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: hubValuationMode === 'prevClose' ? 'var(--bull)' : 'transparent',
                          color: hubValuationMode === 'prevClose' ? '#0a1914' : 'var(--text-muted)',
                          transition: 'all 0.15s'
                        }}
                      >
                        MeroShare Prev Close (Default)
                      </button>
                      <button
                        type="button"
                        onClick={() => setHubValuationMode('ltp')}
                        style={{
                          flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 800, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: hubValuationMode === 'ltp' ? '#38bdf8' : 'transparent',
                          color: hubValuationMode === 'ltp' ? '#0a1914' : 'var(--text-muted)',
                          transition: 'all 0.15s'
                        }}
                      >
                        MeroShare LTP
                      </button>
                      <button
                        type="button"
                        onClick={() => setHubValuationMode('live')}
                        style={{
                          flex: 1, padding: '6px 4px', fontSize: 10, fontWeight: 800, borderRadius: 6, border: 'none', cursor: 'pointer',
                          background: hubValuationMode === 'live' ? 'var(--primary)' : 'transparent',
                          color: hubValuationMode === 'live' ? '#ffffff' : 'var(--text-muted)',
                          transition: 'all 0.15s'
                        }}
                      >
                        Live NEPSE
                      </button>
                    </div>

                    {/* Stat Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="card" style={{ padding: 16, marginBottom: 0, background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Demat Net Worth</div>
                          <span style={{ fontSize: 8.5, padding: '1px 5px', borderRadius: 4, background: hubValuationMode === 'prevClose' ? 'rgba(16,217,138,0.15)' : 'rgba(56,189,248,0.15)', color: hubValuationMode === 'prevClose' ? 'var(--bull)' : '#38bdf8', fontWeight: 700 }}>
                            {hubValuationMode === 'prevClose' ? 'CDSC Prev Close' : hubValuationMode === 'ltp' ? 'CDSC LTP' : 'Live NEPSE'}
                          </span>
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{formatRs(totalValue)}</div>
                        <div style={{ fontSize: 9.5, color: 'var(--text-muted)', marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>MeroShare Prev Close:</span> <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatRs(totalPrevCloseValue)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>MeroShare LTP:</span> <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{formatRs(totalCdscValue)}</strong>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--primary-light)' }}>
                            <span>Live NEPSE:</span> <strong style={{ fontFamily: 'var(--font-mono)' }}>{formatRs(totalLiveValue)}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="card" style={{ padding: 16, marginBottom: 0, background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Total Profit / Loss</div>
                        <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4, color: totalPL >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                          {totalPL >= 0 ? <TrendingUp style={{ width: 16, height: 16 }} /> : <TrendingDown style={{ width: 16, height: 16 }} />}
                          {totalPL >= 0 ? '+' : ''}{Number(totalPLPercent || 0).toFixed(2)}%
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 'bold', color: totalPL >= 0 ? 'var(--bull)' : 'var(--bear)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                          {totalPL >= 0 ? '+' : ''}{formatRs(totalPL)}
                        </div>
                      </div>
                    </div>

                    {/* Stock holdings table with search bar */}
                    <div className="card" style={{ marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 className="section-title" style={{ marginBottom: 0, color: 'var(--text-primary)' }}>Demat Holdings ({enrichedHoldings.length})</h3>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button 
                            onClick={handleResetHoldings}
                            className="btn-secondary"
                            style={{ fontSize: 9, padding: '2px 6px', color: 'var(--text-muted)', borderColor: 'var(--border)', cursor: 'pointer', height: 'auto' }}
                            title="Reset portfolio to default mock holdings"
                          >
                            Reset Defaults
                          </button>
                          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>CDSC Secure Feed</span>
                        </div>
                      </div>

                      {/* Search & Add Stock Row */}
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <div className="search-wrap" style={{ flex: 1, marginBottom: 0 }}>
                          <Search className="search-icon" style={{ width: 15, height: 15 }} />
                          <input 
                            type="text" 
                            className="input" 
                            placeholder="Search stock by name or symbol..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                          />
                        </div>
                        <button 
                          onClick={() => {
                            setShowAddHoldingForm(!showAddHoldingForm);
                            setEditingStockSymbol(null);
                            if (marketStocks.length > 0) {
                              setNewHoldingSymbol(marketStocks[0].symbol);
                              setNewHoldingWacc(marketStocks[0].ltp);
                            }
                          }}
                          className="btn-secondary"
                          style={{ fontSize: 11, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 4, height: 38, borderColor: 'rgba(91,94,244,0.3)', color: 'var(--primary-light)' }}
                        >
                          <Plus style={{ width: 14, height: 14 }} /> Add Stock
                        </button>
                      </div>

                      {/* Add Holding Form */}
                      {showAddHoldingForm && (
                        <div className="card" style={{ background: 'rgba(255,255,255,0.03)', padding: 12, marginBottom: 12, border: '1px solid var(--border)' }}>
                          <h4 style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8, color: 'var(--primary-light)' }}>Add Stock Asset to Demat</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                            <div>
                              <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Symbol</label>
                              <select 
                                value={newHoldingSymbol} 
                                onChange={e => {
                                  setNewHoldingSymbol(e.target.value);
                                  const stk = marketStocks.find(s => s.symbol === e.target.value);
                                  if (stk) setNewHoldingWacc(stk.ltp);
                                }} 
                                className="select-input"
                                style={{ height: 32, fontSize: 11, padding: '0 4px', width: '100%' }}
                              >
                                {marketStocks.map(s => (
                                  <option key={s.symbol} value={s.symbol}>{s.symbol} - {s.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Units</label>
                              <input 
                                type="number" 
                                className="input" 
                                placeholder="Units" 
                                style={{ height: 32, fontSize: 11, padding: '0 8px' }}
                                value={newHoldingUnits} 
                                onChange={e => setNewHoldingUnits(e.target.value)} 
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>WACC (Rs.)</label>
                              <input 
                                type="number" 
                                step="0.01"
                                className="input" 
                                placeholder="WACC" 
                                style={{ height: 32, fontSize: 11, padding: '0 8px' }}
                                value={newHoldingWacc} 
                                onChange={e => setNewHoldingWacc(e.target.value)} 
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                            <button 
                              type="button" 
                              onClick={() => setShowAddHoldingForm(false)} 
                              className="btn-secondary" 
                              style={{ fontSize: 10, padding: '4px 8px', height: 26 }}
                            >
                              Cancel
                            </button>
                            <button 
                              type="button" 
                              onClick={handleAddCustomHolding} 
                              className="btn-primary" 
                              style={{ fontSize: 10, padding: '4px 12px', height: 26 }}
                            >
                              Save Holding
                            </button>
                          </div>
                        </div>
                      )}

                      {/* List */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
                        {filteredHoldings.map(h => {
                          const isEditing = editingStockSymbol === h.symbol;
                          
                          if (isEditing) {
                            return (
                              <div 
                                key={h.symbol} 
                                style={{ 
                                  padding: '12px', 
                                  borderRadius: 'var(--radius-md)', 
                                  background: 'rgba(255,255,255,0.04)', 
                                  border: '1px solid var(--primary)',
                                  display: 'flex', 
                                  flexDirection: 'column',
                                  gap: 8
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text-primary)' }}>Edit {h.symbol} Holding</span>
                                  <button 
                                    onClick={() => handleDeleteCustomHolding(h.symbol)} 
                                    className="btn-bear btn-xs"
                                    style={{ padding: '2px 8px', fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'rgba(245,69,92,0.15)', color: 'var(--bear)' }}
                                  >
                                    <Trash2 style={{ width: 12, height: 12 }} /> Delete
                                  </button>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                  <div>
                                    <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Units</label>
                                    <input 
                                      type="number" 
                                      className="input" 
                                      style={{ height: 30, fontSize: 11, padding: '0 8px' }}
                                      value={editUnits} 
                                      onChange={e => setEditUnits(e.target.value)} 
                                    />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: 9, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>WACC (Rs.)</label>
                                    <input 
                                      type="number" 
                                      step="0.01"
                                      className="input" 
                                      style={{ height: 30, fontSize: 11, padding: '0 8px' }}
                                      value={editWacc} 
                                      onChange={e => setEditWacc(e.target.value)} 
                                    />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                                  <button 
                                    type="button" 
                                    onClick={() => setEditingStockSymbol(null)} 
                                    className="btn-secondary" 
                                    style={{ fontSize: 10, padding: '4px 8px', height: 24 }}
                                  >
                                    Cancel
                                  </button>
                                  <button 
                                    type="button" 
                                    onClick={() => handleSaveEditHolding(h.symbol)} 
                                    className="btn-primary" 
                                    style={{ fontSize: 10, padding: '4px 12px', height: 24 }}
                                  >
                                    Save Changes
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div 
                              key={h.symbol} 
                              style={{ 
                                padding: '12px 8px', 
                                borderBottom: '1px solid var(--border)',
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center' 
                              }}
                            >
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text-primary)' }}>{h.symbol}</div>
                                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                                  {h.units} Units @ {formatRs(h.wacc)}
                                </div>
                              </div>
                              
                              <div style={{ textAlign: 'right', marginRight: 12 }}>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                                  {formatRs(h.currentValue)}
                                </div>
                                <div style={{ fontSize: 12, marginTop: 4, color: h.profitLoss >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                                  LTP: {formatRs(h.currentPrice)} ({h.profitLoss >= 0 ? '+' : ''}{Number(h.plPercent || 0).toFixed(2)}%)
                                </div>
                              </div>
                              
                              <button 
                                onClick={() => {
                                  setEditingStockSymbol(h.symbol);
                                  setEditUnits(h.units);
                                  setEditWacc(h.wacc);
                                  setShowAddHoldingForm(false);
                                }}
                                className="icon-btn"
                                style={{ width: 28, height: 28, background: 'transparent', border: 'none', cursor: 'pointer' }}
                                title="Edit Asset"
                              >
                                <Edit3 style={{ width: 14, height: 14, color: 'var(--text-muted)' }} />
                              </button>
                            </div>
                          );
                        })}
                        
                        {filteredHoldings.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: 12 }}>
                            No holdings match "{searchQuery}"
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Unsynced state */}
              {!isRetrieving && !syncedProfileIds.includes(selectedProfileId) && (
                <div className="card" style={{ textAlign: 'center', padding: '40px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  <Lock style={{ width: 32, height: 32, color: 'var(--text-muted)' }} />
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: 4 }}>Demat Balance Locked</h4>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      For security, MeroShare Demat balances must be retrieved securely from CDSC networks.
                    </p>
                  </div>
                  <button 
                    onClick={() => handleRetrievePortfolio(selectedProfileId)} 
                    className="btn-primary" 
                    style={{ padding: '8px 16px', fontSize: 12, marginTop: 8 }}
                  >
                    Retrieve Demat Holdings 🔑
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 16px', border: '1px dashed var(--border)', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--primary-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-glow)' }}>
                <Wallet style={{ width: 30, height: 30, color: 'var(--primary-light)' }} />
              </div>
              <div>
                <h4 style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: 6 }}>No MeroShare Account Connected</h4>
                <p style={{ fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 280, margin: '0 auto', lineHeight: 1.55 }}>
                  Connect your MeroShare credentials to securely fetch and analyze your Demat holdings, calculate WACC tax base, and track direct returns.
                </p>
              </div>
              <button 
                onClick={() => { setActiveSubTab('accounts'); setShowAddForm(true); }} 
                className="btn-primary btn-sm" 
                style={{ padding: '9px 18px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <Plus style={{ width: 14, height: 14 }} /> Connect MeroShare Account
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          right: 20,
          background: toast.type === 'error' ? 'var(--bear)' : toast.type === 'success' ? 'var(--bull)' : 'var(--bg-card)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '8px',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          zIndex: 9999,
          border: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          pointerEvents: 'none'
        }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{toast.message}</span>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmDialog && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 16
        }}>
          <div className="card" style={{
            maxWidth: 400,
            width: '100%',
            border: '1px solid var(--border)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
            padding: 24,
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)'
          }}>
            <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: 'var(--text-primary)' }}>Confirm Action</h4>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.5 }}>
              {confirmDialog.message}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button 
                onClick={confirmDialog.onCancel} 
                className="btn-secondary" 
                style={{ padding: '8px 16px', fontSize: 12 }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDialog.onConfirm} 
                className="btn-primary" 
                style={{ padding: '8px 16px', fontSize: 12, background: 'var(--bear)' }}
              >
                Yes, Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
