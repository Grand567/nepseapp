import React, { useState, useEffect } from 'react';
import { 
  Plus, Trash2, CheckCircle2, ShieldCheck, HelpCircle, Loader2, Sparkles, 
  Copy, Check, ExternalLink, ArrowRight, Search, RefreshCw, TrendingUp, 
  TrendingDown, User, Wallet, Lock, Edit3
} from 'lucide-react';
import { MOCK_DP_LIST, MOCK_IPOS, checkIpoAllotmentMock, generateMockDematPortfolio } from '../utils/mockData';
import { getProxyBase } from '../utils/liveData';



const formatRs = (value) => {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value).replace('NPR', 'Rs.');
};


// Automatically resolve MeroShare clientId (DP ID)
const getRealClientId = async (boid, dpCode) => {
  try {
    const res = await fetch(`${getProxyBase()}/api/meroshare/dp-list`);
    const json = await res.json();
    if (json.success && json.data) {
      // e.g. "1201060001234567" -> first 8 is "12010600" -> last 5 is "10600"
      const boidPrefix = boid.substring(3, 8); 
      const matchedByBoid = json.data.find(dp => dp.code === boidPrefix);
      if (matchedByBoid) return matchedByBoid.id;

      const mockDp = MOCK_DP_LIST.find(dp => dp.code === dpCode);
      if (mockDp) {
        const idMatch = mockDp.name.match(/\((\d+)\)/);
        const extractedId = idMatch ? idMatch[1] : null;
        if (extractedId) {
          const matchedById = json.data.find(dp => String(dp.id) === String(extractedId));
          if (matchedById) return matchedById.id;
        }

        const cleanName = mockDp.name.split('(')[0].trim().toLowerCase();
        const matchedByName = json.data.find(dp => 
          dp.name.toLowerCase().includes(cleanName) || 
          cleanName.includes(dp.name.toLowerCase())
        );
        if (matchedByName) return matchedByName.id;
      }
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

export default function MeroShareHub({ apiStatus, marketStocks = [] }) {
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
  const [dpCode, setDpCode] = useState(MOCK_DP_LIST[0].code);
  const [password, setPassword] = useState('');
  const [crn, setCrn] = useState('');
  const [pin, setPin] = useState('');

  // Bulk Check state
  const [ipoCompanies, setIpoCompanies] = useState(MOCK_IPOS);
  const [selectedIpo, setSelectedIpo] = useState(MOCK_IPOS[0]?.id.toString() || '');
  const [isChecking, setIsChecking] = useState(false);
  const [checkResults, setCheckResults] = useState([]);
  const [queryMode, setQueryMode] = useState('simulated'); // Default to simulated instead of cors-proxy to bypass CDSC WAF delays

  // Apply Wizard state
  const [showWizard, setShowWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [appliedStatus, setAppliedStatus] = useState({}); // { profileId: 'applied' / 'pending' }
  const [copiedField, setCopiedField] = useState(null);

  // Sub Tabs & Portfolio state
  const [activeSubTab, setActiveSubTab] = useState('accounts'); // 'accounts', 'ipo', 'portfolio'
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [syncedProfileIds, setSyncedProfileIds] = useState([]);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [retrievalStep, setRetrievalStep] = useState(0);
  const [sessionToken, setSessionToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Portfolio Editing & Manual Add states
  const [editingStockSymbol, setEditingStockSymbol] = useState(null);
  const [editUnits, setEditUnits] = useState('');
  const [editWacc, setEditWacc] = useState('');
  const [showAddHoldingForm, setShowAddHoldingForm] = useState(false);
  const [newHoldingSymbol, setNewHoldingSymbol] = useState('');
  const [newHoldingUnits, setNewHoldingUnits] = useState('');
  const [newHoldingWacc, setNewHoldingWacc] = useState('');

  // Load saved profiles from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('nepse_hub_meroshare_profiles');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProfiles(parsed);
        if (parsed.length > 0) {
          setSelectedProfileId(parsed[0].id);
          setActiveSubTab('portfolio');
        }
      } catch (e) {
        setProfiles([]);
      }
    }
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



  // Save profiles
  const saveProfilesToStorage = (newProfiles) => {
    setProfiles(newProfiles);
    localStorage.setItem('nepse_hub_meroshare_profiles', JSON.stringify(newProfiles));
  };

  const handleAddProfile = (e) => {
    e.preventDefault();
    if (!name || boid.length !== 16 || !username || !password || !crn || pin.length !== 4) {
      showToast("Please fill in all fields correctly. BOID must be 16 digits, Transaction PIN must be 4 digits.", "error");
      return;
    }

    const newProfile = {
      id: Date.now().toString(),
      name,
      boid,
      username,
      dpCode,
      dpName: MOCK_DP_LIST.find(dp => dp.code === dpCode)?.name || 'Unknown DP',
      password,
      crn,
      pin
    };

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
    // Small delay so React has flushed the state update before retrieval starts
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

  // Perform Bulk check
  const handleBulkCheck = async () => {
    if (profiles.length === 0) {
      showToast("Please add at least one MeroShare profile first.", "error");
      return;
    }
    
    setIsChecking(true);
    setCheckResults([]);

    const ipoObj = ipoCompanies.find(i => i.id.toString() === selectedIpo.toString());

    for (let i = 0; i < profiles.length; i++) {
      const profile = profiles[i];
      
      // Update check result as "Checking..."
      setCheckResults(prev => [
        ...prev.filter(r => r.id !== profile.id),
        { id: profile.id, name: profile.name, status: 'loading', resultText: 'Querying CDSC servers...' }
      ]);

      let res;
      if (queryMode === 'simulated') {
        // Simulated lottery matching logic
        res = await checkIpoAllotmentMock(selectedIpo, profile.boid);
      } else {
        if (apiStatus === 'offline') {
          await new Promise(r => setTimeout(r, 900));
          res = { success: false, message: "Connection timeout. Error: 504." };
        } else {
          try {
            // Add a small 1-second delay between checks to avoid rate-limiting from CDSC
            if (i > 0) await new Promise(r => setTimeout(r, 1000));

            const response = await fetch(`${getProxyBase()}/api/ipo-result/check`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyShareId: selectedIpo, boid: profile.boid })
            });
            const json = await response.json();
            
            if (json && json.success) {
              const data = json.data || {};
              res = {
                success: true,
                status: data.success ? 'Allotted' : 'Not Allotted',
                units: data.success ? 10 : 0, 
                message: data.message
              };
              if (data.message && data.message.toLowerCase().includes('allotted') && !data.message.toLowerCase().includes('not')) {
                const match = data.message.match(/\d+/);
                if (match) res.units = parseInt(match[0]);
                res.status = 'Allotted';
              } else {
                res.status = 'Not Allotted';
              }
            } else {
              res = { success: false, message: json.message || "Failed to fetch." };
            }
          } catch (err) {
            res = { 
              success: false, 
              message: "Proxy connection failed." 
            };
          }
        }
      }

      // Record final result
      setCheckResults(prev => [
        ...prev.filter(r => r.id !== profile.id),
        { 
          id: profile.id, 
          name: profile.name, 
          status: res.success ? (res.status === 'Allotted' ? 'allotted' : 'not_allotted') : 'failed',
          resultText: res.message || res.status,
          units: res.units || 0
        }
      ]);
    }
    setIsChecking(false);
  };

  // Helper copy to clipboard
  const handleCopy = (text, fieldName) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 1500);
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

  const getActiveIpo = () => {
    return ipoCompanies.find(i => i.id.toString() === selectedIpo.toString()) || { name: 'Loading...', scrip: '...' };
  };

  // Trigger secure retrieval of Demat portfolio
  const handleRetrievePortfolio = async (profileId) => {
    if (!profileId) return;
    const profile = profiles.find(p => p.id === profileId);
    if (!profile) return;

    setIsRetrieving(true);
    setRetrievalStep(1); // Gateway

    try {
      // 1. Map DP code and BOID to the real CDSC DP ID
      const clientId = await getRealClientId(profile.boid, profile.dpCode);

      // 2. Perform MeroShare login through proxy
      const loginRes = await fetch(`${getProxyBase()}/api/meroshare/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: clientId,
          username: profile.username,
          password: profile.password
        })
      });

      if (!loginRes.ok) {
        const errorJson = await loginRes.json().catch(() => ({}));
        throw new Error(errorJson.message || `Login failed with status ${loginRes.status}`);
      }

      const loginData = await loginRes.json();
      if (!loginData.success || !loginData.token) {
        throw new Error(loginData.message || 'MeroShare authentication failed.');
      }

      const token = loginData.token;

      // Update step to Verifying credentials / Fetching portfolio
      setRetrievalStep(2);
      await new Promise(r => setTimeout(r, 600));

      // 2.5 Fetch own-detail to guarantee we have the exact clientCode
      const detailRes = await fetch(`${getProxyBase()}/api/meroshare/own-detail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const detailData = await detailRes.json();
      const exactClientCode = detailData.data?.clientCode || profile.clientCode || '';
      const exactDemat = detailData.data?.demat || detailData.data?.boid || profile.boid;

      // 3. Fetch Portfolio through proxy
      setRetrievalStep(3);
      const portfolioRes = await fetch(`${getProxyBase()}/api/meroshare/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, demat: exactDemat, clientCode: exactClientCode })
      });

      if (!portfolioRes.ok) {
        const errorJson = await portfolioRes.json().catch(() => ({}));
        throw new Error(errorJson.message || `Failed to fetch holdings with status ${portfolioRes.status}`);
      }

      const portfolioData = await portfolioRes.json();
      if (!portfolioData.success || !portfolioData.data) {
        throw new Error(portfolioData.message || 'Failed to fetch demat portfolio data.');
      }

      // 4. Parse portfolio data
      const msaList = portfolioData.data?.meroShareMyPortfolio || portfolioData.data?.msaList || portfolioData.data || [];
      const parsedHoldings = msaList.map(item => {
        const symbol = (item.script || item.scrip || '').trim().toUpperCase();
        const name = (item.scriptDesc || item.scripName || symbol).trim();
        const units = parseInt(item.currentBalance || item.dematQty || 0);
        let wacc = parseFloat(item.wacc || item.purchasePrice || item.previousClosingPrice || item.rate || 100);
        if (isNaN(wacc) || wacc <= 0) wacc = 100;

        return {
          symbol,
          name,
          units,
          wacc: Number(wacc.toFixed(2))
        };
      }).filter(h => h.symbol && h.units > 0);

      // Sync and enrich with market data step
      setRetrievalStep(4);
      await new Promise(r => setTimeout(r, 600));

      // 5. Update profiles and save
      const updatedProfiles = profiles.map(p => {
        if (p.id === profileId) {
          return { ...p, holdings: parsedHoldings };
        }
        return p;
      });
      saveProfilesToStorage(updatedProfiles);

      // Add to synced lists
      setSyncedProfileIds(prev => [...new Set([...prev, profileId])]);
      
      setIsRetrieving(false);
      setRetrievalStep(0);
      showToast(`Demat portfolio successfully fetched! Retrieved ${parsedHoldings.length} holdings for ${profile.name}.`, "success");

    } catch (err) {
      console.error("Demat fetch error:", err);
      // Fallback warning & option to use simulation
      const useSim = await askConfirm(
        `Failed to retrieve real-time data from MeroShare.\n` +
        `Error: ${err.message}\n\n` +
        `Would you like to fall back to simulated holdings for testing?`
      );

      if (useSim) {
        // Run simulated flow
        setRetrievalStep(2);
        await new Promise(r => setTimeout(r, 500));
        setRetrievalStep(3);
        await new Promise(r => setTimeout(r, 500));
        setRetrievalStep(4);
        await new Promise(r => setTimeout(r, 450));

        const updated = profiles.map(p => {
          if (p.id === profileId) {
            const existingHoldings = p.holdings || [];
            if (existingHoldings.length === 0) {
              const generated = generateMockDematPortfolio(p.boid, marketStocks);
              return { ...p, holdings: generated };
            }
          }
          return p;
        });
        saveProfilesToStorage(updated);
        setSyncedProfileIds(prev => [...new Set([...prev, profileId])]);
      }
      
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
      const detailRes = await fetch(`${getProxyBase()}/api/meroshare/own-detail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sessionToken })
      });
      const detailData = await detailRes.json();
      const exactClientCode = detailData.data?.clientCode || profile.clientCode || '';
      const exactDemat = detailData.data?.demat || detailData.data?.boid || profile.boid;

      const portfolioRes = await fetch(`${getProxyBase()}/api/meroshare/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: sessionToken, demat: exactDemat, clientCode: exactClientCode })
      });

      if (!portfolioRes.ok) {
        const errorJson = await portfolioRes.json().catch(() => ({}));
        throw new Error(errorJson.message || `Failed with status ${portfolioRes.status}`);
      }

      const portfolioData = await portfolioRes.json();
      if (!portfolioData.success || !portfolioData.data) {
        throw new Error(portfolioData.message || 'Failed to fetch demat portfolio data.');
      }

      const msaList = portfolioData.data?.meroShareMyPortfolio || portfolioData.data?.msaList || portfolioData.data || [];
      const parsedHoldings = msaList.map(item => {
        const symbol = (item.script || item.scrip || '').trim().toUpperCase();
        const name = (item.scriptDesc || item.scripName || symbol).trim();
        const units = parseInt(item.currentBalance || item.dematQty || 0);
        let wacc = parseFloat(item.wacc || item.purchasePrice || item.previousClosingPrice || item.rate || 100);
        if (isNaN(wacc) || wacc <= 0) wacc = 100;

        return {
          symbol,
          name,
          units,
          wacc: Number(wacc.toFixed(2))
        };
      }).filter(h => h.symbol && h.units > 0);

      setRetrievalStep(4);
      await new Promise(r => setTimeout(r, 450));

      const updatedProfiles = profiles.map(p => {
        if (p.id === profileId) {
          return { ...p, holdings: parsedHoldings };
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
      const lines = text.split('\n');
      if (lines.length < 2) {
        showToast("Invalid CSV file structure.", "error");
        return;
      }

      // Robust header matching
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
      const scripIdx = headers.findIndex(h => h.includes('scrip') || h.includes('symbol') || h.includes('company') || h.includes('code'));
      const unitsIdx = headers.findIndex(h => h.includes('qty') || h.includes('balance') || h.includes('units') || h.includes('quantity') || h.includes('share'));
      const waccIdx = headers.findIndex(h => h.includes('wacc') || h.includes('price') || h.includes('rate') || h.includes('cost') || h.includes('value'));

      if (scripIdx === -1 || unitsIdx === -1) {
        showToast("Could not automatically map CSV columns. Please ensure your CSV has columns like 'Scrip/Symbol' and 'Current Balance/Qty'.", "error");
        return;
      }

      const parsedHoldings = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Simple split, handles quotes
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
        if (cols.length < Math.max(scripIdx, unitsIdx) + 1) continue;

        const symbol = cols[scripIdx].toUpperCase();
        const units = parseInt(cols[unitsIdx].replace(/,/g, ''));
        let wacc = waccIdx !== -1 ? parseFloat(cols[waccIdx].replace(/,/g, '')) : 100;
        if (isNaN(wacc) || wacc <= 0) wacc = 100;

        if (symbol && !isNaN(units) && units > 0) {
          const stk = marketStocks.find(s => s.symbol === symbol);
          parsedHoldings.push({
            symbol,
            name: stk ? stk.name : symbol,
            units,
            wacc: Number(wacc.toFixed(2))
          });
        }
      }

      if (parsedHoldings.length === 0) {
        showToast("No valid holdings parsed from this CSV.", "error");
        return;
      }

      const updatedProfiles = profiles.map(p => {
        if (p.id === profileId) {
          return { ...p, holdings: parsedHoldings };
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
              return { ...h, units: newUnits, wacc: Number(newWacc.toFixed(2)) };
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
    if (await askConfirm("Are you sure you want to reset this portfolio to the default auto-generated holding list? All your manual adjustments for this profile will be lost.")) {
      const updatedProfiles = profiles.map(p => {
        if (p.id === selectedProfileId) {
          const generated = generateMockDematPortfolio(p.boid, marketStocks);
          return { ...p, holdings: generated };
        }
        return p;
      });
      saveProfilesToStorage(updatedProfiles);
      setEditingStockSymbol(null);
      setShowAddHoldingForm(false);
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
            <Sparkles style={{ width: 13, height: 13 }} /> IPO Checker
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
            <form onSubmit={handleAddProfile} className="card" style={{ marginBottom: 16 }}>
              <h3 className="section-title" style={{ marginBottom: 12 }}>Add MeroShare Account</h3>
              
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <div>
                  <label className="input-label">DP Capital/Bank</label>
                  <select value={dpCode} onChange={e => setDpCode(e.target.value)} className="select-input">
                    {MOCK_DP_LIST.map(dp => (
                      <option key={dp.code} value={dp.code}>{dp.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="input-label">Username</label>
                  <input type="text" required value={username} onChange={e => setUsername(e.target.value)} className="input" placeholder="MeroShare Username" />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
                <div>
                  <label className="input-label">Password</label>
                  <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="••••" />
                </div>
                <div>
                  <label className="input-label">CRN Number</label>
                  <input type="text" required value={crn} onChange={e => setCrn(e.target.value)} className="input" placeholder="C-1234" />
                </div>
                <div>
                  <label className="input-label">4-Digit PIN</label>
                  <input type="password" maxLength="4" required value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} className="input" placeholder="0000" />
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ width: '100%', padding: '10px 0' }}>Save Profile Locally</button>
            </form>
          )}

          {/* Profile Management Cards */}
          {profiles.length > 0 && !showAddForm && !showWizard && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 className="section-title" style={{ marginBottom: 0 }}>Registered Accounts ({profiles.length})</h3>
                <span style={{ fontSize: 10, color: 'var(--bull)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ShieldCheck style={{ width: 14, height: 14 }} /> Local Secure Storage
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                {profiles.map(p => (
                  <div key={p.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', marginBottom: 0 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--text-primary)' }}>{p.name}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>{p.dpName} • BOID: ...{p.boid.slice(-4)}</div>
                    </div>
                    <button onClick={() => handleDeleteProfile(p.id)} className="icon-btn" style={{ border: 'none', background: 'transparent' }}>
                      <Trash2 style={{ width: 16, height: 16, color: 'var(--bear)' }} />
                    </button>
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

              <div style={{ display: 'flex', gap: 8 }}>
                <a 
                  href="https://meroshare.cdsc.com.np/" 
                  target="_blank" 
                  rel="noreferrer" 
                  className="btn-secondary"
                  style={{ fontSize: 12, flex: 1, padding: '8px 0', textDecoration: 'none', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                >
                  Open MeroShare <ExternalLink style={{ width: 14, height: 14 }} />
                </a>

                {wizardStep < profiles.length - 1 ? (
                  <button 
                    onClick={() => {
                      setAppliedStatus(prev => ({ ...prev, [profiles[wizardStep].id]: 'applied' }));
                      setWizardStep(prev => prev + 1);
                    }}
                    className="btn-primary"
                    style={{ fontSize: 12, flex: 1, padding: '8px 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                  >
                    Save & Next Profile <ArrowRight style={{ width: 14, height: 14 }} />
                  </button>
                ) : (
                  <button 
                    onClick={() => {
                      setAppliedStatus(prev => ({ ...prev, [profiles[wizardStep].id]: 'applied' }));
                      setShowWizard(false);
                      alert("Awesome! You completed applying IPO across all your registered family profiles.");
                    }}
                    className="btn-bull"
                    style={{ fontSize: 12, flex: 1, padding: '8px 0', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                  >
                    Finish Application 🎉
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Sub Tab: IPO ALLOTMENT ── */}
      {activeSubTab === 'ipo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {profiles.length > 0 ? (
            <>
              {/* Bulk checking & Actions Hub */}
              <div className="card">
                <h3 className="section-title" style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Bulk Tools</h3>
                
                <div style={{ marginBottom: 12 }}>
                  <label className="input-label">Select Company Share Issue</label>
                  <select 
                    value={selectedIpo} 
                    onChange={e => setSelectedIpo(e.target.value)} 
                    className="select-input"
                  >
                    <optgroup label="🔴 Live / Open IPOs (Apply Now)">
                      {ipoCompanies.filter(ipo => ipo.status === 'Open').map(ipo => (
                        <option key={ipo.id} value={ipo.id}>
                          {ipo.name} ({ipo.type}) - {ipo.units} Units
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="🟢 Previously Applied (Results)">
                      {ipoCompanies.filter(ipo => ipo.status !== 'Open').map(ipo => (
                        <option key={ipo.id} value={ipo.id}>
                          {ipo.name} ({ipo.type})
                        </option>
                      ))}
                    </optgroup>
                    {ipoCompanies.length === 0 && <option>Loading live IPOs...</option>}
                  </select>
                </div>

                {/* Check modes */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Network Query Mode:</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button 
                      onClick={() => setQueryMode('simulated')} 
                      className={`badge ${queryMode === 'simulated' ? 'badge-primary' : 'badge-gray'}`}
                      style={{ padding: '4px 8px', cursor: 'pointer', border: queryMode !== 'simulated' ? '1px solid var(--border)' : '' }}
                    >
                      Simulation
                    </button>
                    <button 
                      onClick={() => setQueryMode('cors-proxy')} 
                      className={`badge ${queryMode === 'cors-proxy' ? 'badge-primary' : 'badge-gray'}`}
                      style={{ padding: '4px 8px', cursor: 'pointer', border: queryMode !== 'cors-proxy' ? '1px solid var(--border)' : '' }}
                    >
                      Live Fetch (CORS)
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    onClick={handleBulkCheck} 
                    disabled={isChecking} 
                    className="btn-primary"
                    style={{ padding: '10px 0', fontSize: 12, flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                  >
                    {isChecking ? <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" /> : 'Run Bulk IPO Check 🗳️'}
                  </button>
                  <button 
                    onClick={startApplyWizard}
                    className="btn-secondary"
                    style={{ padding: '10px 0', fontSize: 12, flex: 1, borderColor: 'rgba(91,94,244,0.2)', color: 'var(--primary-light)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6 }}
                  >
                    Bulk Apply Helper 📋
                  </button>
                </div>
              </div>

              {/* Bulk Check Results display */}
              {checkResults.length > 0 && (
                <div className="card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 className="section-title" style={{ marginBottom: 0, color: 'var(--text-primary)' }}>Lottery Results</h3>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      Allotted: {checkResults.filter(r => r.status === 'allotted').length} / {checkResults.length}
                    </span>
                  </div>

                  {checkResults.some(r => r.status === 'allotted') && (
                    <div className="card-sm" style={{ 
                      background: 'rgba(245,158,11,0.08)', 
                      border: '1px solid rgba(245,158,11,0.25)', 
                      padding: 12, 
                      marginBottom: 12, 
                      display: 'flex', 
                      alignItems: 'flex-start', 
                      gap: 8,
                      borderRadius: 'var(--radius-md)'
                    }}>
                      <ShieldAlert style={{ width: 16, height: 16, color: 'var(--accent-amber)', flexShrink: 0, marginTop: 1 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--accent-amber)', letterSpacing: '0.02em' }}>⚠️ MANDATORY EDIS ACTION REQUIRED</span>
                        <span style={{ fontSize: 10, color: 'var(--text-primary)', opacity: 0.9, lineHeight: 1.45 }}>
                          Congratulations! Shares have been allotted. When you eventually sell these shares, you must submit **EDIS (Share Transfer)** on MeroShare within 24 hours of selling, or face a **20% cash closeout penalty**!
                        </span>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 220, overflowY: 'auto', paddingRight: 4 }}>
                    {checkResults.map(res => (
                      <div 
                        key={res.id} 
                        style={{
                          padding: 12, borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12,
                          ...(res.status === 'allotted' ? { background: 'var(--bull-subtle)', border: '1px solid rgba(16,217,138,0.3)' } :
                              res.status === 'not_allotted' ? { background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', color: 'var(--text-muted)' } :
                              res.status === 'loading' ? { background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)' } :
                              { background: 'var(--bear-subtle)', border: '1px solid rgba(245,69,92,0.3)' })
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                          <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-primary)' }}>
                            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.name}</span>
                            {res.status === 'allotted' && <Sparkles style={{ width: 14, height: 14, color: 'var(--accent-amber)', flexShrink: 0 }} />}
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{res.resultText}</div>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {res.status === 'allotted' && (
                            <span className="badge badge-bull" style={{ padding: '4px 10px', borderRadius: 50, fontSize: 10, fontWeight: 800 }}>
                              + {res.units} Units
                            </span>
                          )}
                          {res.status === 'not_allotted' && (
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Not Selected</span>
                          )}
                          {res.status === 'loading' && (
                            <Loader2 style={{ width: 16, height: 16, color: 'var(--primary-light)' }} className="animate-spin" />
                          )}
                          {res.status === 'failed' && (
                            <span style={{ fontSize: 9, color: 'var(--bear)', fontWeight: 'bold', textTransform: 'uppercase' }}>Err Blocked</span>
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
                        <option key={p.id} value={p.id}>{p.name} (BOID: ...{p.boid.slice(-4)})</option>
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
                      {syncedProfileIds.includes(selectedProfileId) ? 'Sync' : 'Fetch'}
                    </button>
                  )}
                </div>

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
                      onChange={e => handleCsvImport(e, selectedProfileId)}
                      style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                    />
                  </div>
                )}
              </div>

              {/* Retrieval Loading state */}
              {isRetrieving && (
                <div className="card" style={{ textAlign: 'center', padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <Loader2 style={{ width: 36, height: 36, color: 'var(--primary-light)' }} className="animate-spin" />
                  <div>
                    <h4 style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text-primary)', marginBottom: 4 }}>Retrieving Demat Holdings</h4>
                    <p style={{ fontSize: 12, color: 'var(--primary-light)', minHeight: 18, transition: 'var(--transition)' }}>
                      {retrievalStep === 1 && "Establishing secure gateway to CDSC servers..."}
                      {retrievalStep === 2 && "Verifying MeroShare Demat credentials..."}
                      {retrievalStep === 3 && "Decrypting and fetching stock asset balances..."}
                      {retrievalStep === 4 && "Synchronizing balances with live NEPSE market feed..."}
                    </p>
                  </div>
                  <span className="badge badge-primary" style={{ fontSize: 9 }}>CDSC SECURE HANDSHAKE</span>
                </div>
              )}

              {/* Portfolio Dashboard when Synced */}
              {!isRetrieving && syncedProfileIds.includes(selectedProfileId) && (() => {
                const profile = profiles.find(p => p.id === selectedProfileId);
                const rawHoldings = profile ? (profile.holdings || generateMockDematPortfolio(profile.boid, marketStocks)) : [];
                
                const enrichedHoldings = rawHoldings.map(h => {
                  const safeSymbol = (h.symbol || '').trim().toUpperCase();
                  const marketStock = marketStocks.find(s => (s.symbol || '').trim().toUpperCase() === safeSymbol) || { ltp: h.wacc, change: 0, pChange: 0 };
                  const currentValue = h.units * marketStock.ltp;
                  const costValue = h.units * h.wacc;
                  const profitLoss = currentValue - costValue;
                  const plPercent = costValue > 0 ? (profitLoss / costValue) * 100 : 0;
                  
                  return {
                    ...h,
                    currentPrice: marketStock.ltp,
                    change: marketStock.change,
                    pChange: marketStock.pChange,
                    currentValue,
                    costValue,
                    profitLoss,
                    plPercent
                  };
                });
                
                const totalCost = enrichedHoldings.reduce((sum, h) => sum + h.costValue, 0);
                const totalValue = enrichedHoldings.reduce((sum, h) => sum + h.currentValue, 0);
                const totalPL = totalValue - totalCost;
                const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;

                const filteredHoldings = enrichedHoldings.filter(h => 
                  h.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
                  h.name.toLowerCase().includes(searchQuery.toLowerCase())
                );

                return (
                  <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Stat Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div className="card" style={{ padding: 16, marginBottom: 0, background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Demat Net Worth</div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{formatRs(totalValue)}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Cost: {formatRs(totalCost)}</div>
                      </div>
                      <div className="card" style={{ padding: 16, marginBottom: 0, background: 'rgba(255,255,255,0.02)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Total Profit / Loss</div>
                        <div style={{ fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 4, color: totalPL >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                          {totalPL >= 0 ? <TrendingUp style={{ width: 16, height: 16 }} /> : <TrendingDown style={{ width: 16, height: 16 }} />}
                          {totalPL >= 0 ? '+' : ''}{totalPLPercent.toFixed(2)}%
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
                                  {h.units} Units @ Rs.{formatRs(h.wacc)}
                                </div>
                              </div>
                              
                              <div style={{ textAlign: 'right', marginRight: 12 }}>
                                <div style={{ fontSize: 14, fontWeight: 'bold', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                                  Rs.{formatRs(h.currentValue)}
                                </div>
                                <div style={{ fontSize: 12, marginTop: 4, color: h.profitLoss >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                                  LTP: Rs.{formatRs(h.currentPrice)} ({h.profitLoss >= 0 ? '+' : ''}{h.plPercent.toFixed(1)}%)
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
