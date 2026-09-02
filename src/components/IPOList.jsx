import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, Loader2, Landmark, CheckCircle2, XCircle, 
  HelpCircle, ChevronRight, Play, Award, AlertCircle, RefreshCw, 
  Search, Users, Coins, Calendar, Sparkles, ShieldAlert
} from 'lucide-react';
import { getProxyBase } from '../utils/liveData';
import { Capacitor } from '@capacitor/core';
import * as servicesApi from '../utils/servicesApi';

// Same key as AccountManager
const BULK_ACCOUNTS_KEY = 'nepse_hub_bulk_ipo_accounts';

function loadLocalAccounts() {
  try {
    const raw = localStorage.getItem(BULK_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Safe fetch that handles non-JSON responses gracefully
async function safeFetch(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (netErr) {
    throw new Error('Network error: ' + netErr.message);
  }
  let text;
  try { text = await res.text(); } catch (_) { throw new Error(`Could not read response (${res.status})`); }
  let json;
  try { json = JSON.parse(text); } catch (_) {
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    throw new Error(`Non-JSON response (${res.status})`);
  }
  if (!res.ok) throw new Error(json.message || `Request failed ${res.status}`);
  return json;
}

// Direct CDSC IPO list fetch (native Android)
async function fetchIposDirectly(account) {
  if (!account) return [];

  const MEROSHARE_BASE = 'https://backend.cdsc.com.np/api/meroShare';

  // 1. Resolve DP code to clientId (using offline BOID prefix strategy first)
  let clientId = 101;
  const boidStr = String(account.boid || '').trim();
  if (boidStr.length === 16) {
    const extractedIdStr = boidStr.substring(3, 6);
    const resolvedId = parseInt(extractedIdStr, 10);
    if (!isNaN(resolvedId) && resolvedId >= 100 && resolvedId <= 300) {
      clientId = resolvedId;
    }
  }

  if (clientId === 101) {
    try {
      const dpRes = await fetch(`${MEROSHARE_BASE}/capital/`);
      if (dpRes.ok) {
        const dpData = await dpRes.json();
        if (Array.isArray(dpData)) {
          const fullPrefix = boidStr.substring(0, 8);
          const shortPrefix = boidStr.substring(3, 8);
          const match = dpData.find(dp => dp.code === fullPrefix || dp.code === shortPrefix || (dp.code && dp.code.includes(shortPrefix)));
          if (match) clientId = match.id;
        }
      }
    } catch (_) {}
  }

  // 2. Login
  const loginRes = await fetch(`${MEROSHARE_BASE}/auth/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://meroshare.cdsc.com.np',
      'Referer': 'https://meroshare.cdsc.com.np/',
    },
    body: JSON.stringify({
      clientId: Number(clientId),
      username: account.username,
      password: account.password,
    }),
  });

  if (!loginRes.ok) {
    const err = await loginRes.json().catch(() => ({}));
    throw new Error(err.message || `Login failed (${loginRes.status})`);
  }

  const loginData = await loginRes.json();
  const authKey = [...loginRes.headers.keys()].find(k => k.toLowerCase() === 'authorization');
  let token = loginData.token || loginData.accessToken || (authKey ? loginRes.headers.get(authKey) : null);
  if (token && !token.startsWith('Bearer ')) token = `Bearer ${token}`;
  if (!token) throw new Error('Authentication succeeded but no token received.');

  // 3. Fetch current issues
  const issuesRes = await fetch(`${MEROSHARE_BASE}/companyShare/currentIssue`, {
    headers: {
      'Authorization': token,
      'Origin': 'https://meroshare.cdsc.com.np',
      'Referer': 'https://meroshare.cdsc.com.np/',
    },
  });

  if (!issuesRes.ok) throw new Error(`Failed to fetch IPOs (${issuesRes.status})`);
  const issuesData = await issuesRes.json();

  return (Array.isArray(issuesData) ? issuesData : []).map(item => ({
    id: item.companyShareId,
    name: item.companyName,
    scrip: item.scrip || '',
    type: item.shareTypeName || 'IPO',
    status: 'Open',
    minKitta: item.minKitta || 10,
    maxKitta: item.maxKitta || 10000,
    amountPerShare: item.amountPerShare || 100,
    openDate: item.issueOpenDate || '',
    closeDate: item.issueCloseDate || '',
  }));
}

export default function IPOList() {
  const [activeTab, setActiveTab] = useState('apply');
  const [accounts, setAccounts] = useState([]);
  const [ipos, setIpos] = useState([]);
  const [resultCompanies, setResultCompanies] = useState([]);

  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingIpos, setIsLoadingIpos] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

  const [selectedAccounts, setSelectedAccounts] = useState([]);
  const [selectedIpo, setSelectedIpo] = useState('');
  const [selectedResultCompany, setSelectedResultCompany] = useState('');
  const [appliedKitta, setAppliedKitta] = useState(10);
  const [accountSearch, setAccountSearch] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [applyResults, setApplyResults] = useState([]);
  const [checkResults, setCheckResults] = useState([]);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isNative = Capacitor.isNativePlatform();
  const proxyBase = getProxyBase();

  useEffect(() => {
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (activeTab === 'apply') {
      fetchActiveIpos();
    } else {
      fetchResultCompanies();
    }
  }, [activeTab]);

  const fetchAccounts = () => {
    setIsLoadingAccounts(true);
    setError('');
    const local = loadLocalAccounts();
    setAccounts(local);
    setSelectedAccounts(local.map(a => a.id));
    setIsLoadingAccounts(false);
  };

  const fetchActiveIpos = async () => {
    setIsLoadingIpos(true);
    setError('');

    try {
      const publicList = await servicesApi.fetchIPOListings();
      if (publicList && Array.isArray(publicList) && publicList.length > 0) {
        setIpos(publicList);
        setSelectedIpo(String(publicList[0].id));
        setIsLoadingIpos(false);
        return;
      }
    } catch (e) {
      console.warn('Public IPO fetch failed, falling back to MeroShare', e);
    }

    const local = loadLocalAccounts();

    try {
      if (isNative) {
        // Direct CDSC fetch on Android
        if (local.length === 0) {
          setError('Please add at least one MeroShare account first.');
          setIsLoadingIpos(false);
          return;
        }
        const ipoList = await fetchIposDirectly(local[0]);
        setIpos(ipoList);
        if (ipoList.length > 0) setSelectedIpo(String(ipoList[0].id));
      } else {
        // Web: use proxy server via POST (so passwords with special chars work correctly)
        if (local.length === 0) {
          setError('Please add at least one MeroShare account first.');
          setIsLoadingIpos(false);
          return;
        }
        const firstAccount = local[0];

        // Resolve DP code to clientId (using offline BOID prefix strategy first)
        let clientId = 101;
        const boidStr = String(firstAccount.boid || '').trim();
        if (boidStr.length === 16) {
          const resolved = parseInt(boidStr.substring(3, 6), 10);
          if (!isNaN(resolved) && resolved >= 100 && resolved <= 300) {
            clientId = resolved;
          }
        }

        if (clientId === 101) {
          try {
            const dpRes = await fetch(`${proxyBase}/api/meroshare/dp-list`);
            if (dpRes.ok) {
              const dpJson = await dpRes.json();
              const dpData = dpJson.data || dpJson;
              if (Array.isArray(dpData)) {
                const fullPrefix = boidStr.substring(0, 8);
                const shortPrefix = boidStr.substring(3, 8);
                const match = dpData.find(dp => dp.code === fullPrefix || dp.code === shortPrefix || (dp.code && dp.code.includes(shortPrefix)));
                if (match) clientId = match.id;
              }
            }
          } catch (e) {
            console.warn('Failed to resolve DP list from backend:', e);
          }
        }

        // POST credentials so passwords with special chars aren't mangled by URL-encoding
        const data = await safeFetch(`${proxyBase}/api/meroshare/ipos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            username: firstAccount.username,
            password: firstAccount.password,
          }),
        });

        if (data.success && Array.isArray(data.data)) {
          setIpos(data.data);
          if (data.data.length > 0) setSelectedIpo(String(data.data[0].id));
          if (data.data.length === 0) {
            setError('No active IPO issues found. The market may have no open IPOs right now.');
          }
        } else {
          throw new Error(data.message || 'Could not retrieve IPO list.');
        }
      }
    } catch (err) {
      console.error('Failed to load IPOs:', err);
      setError(`Failed to load active IPOs: ${err.message}`);
    } finally {
      setIsLoadingIpos(false);
    }
  };

  const fetchResultCompanies = async () => {
    setIsLoadingResults(true);
    setError('');
    setCheckResults([]); // clear previous results on refresh
    try {
      const url = isNative
        ? 'https://iporesult.cdsc.com.np/api/ipo-result/companyShares/fileUploaded'
        : `${proxyBase}/api/ipo-result/companies`;

      const data = await safeFetch(url);

      // Normalize: proxy returns { success, data: [...] }, native returns { body: [...] } or [...]
      const raw = data?.data || data?.body || (Array.isArray(data) ? data : []);
      // Normalize each company so id is always set (CDSC uses companyShareId)
      const companies = raw.map(c => ({
        ...c,
        id: c.companyShareId ?? c.id,
        name: c.companyName || c.name || 'Unknown',
      }));

      setResultCompanies(companies);
      if (companies.length > 0) {
        setSelectedResultCompany(String(companies[0].id));
      }
    } catch (err) {
      console.error('Failed to load result companies:', err);
      setError(`Failed to load result companies: ${err.message}`);
    } finally {
      setIsLoadingResults(false);
    }
  };

  const handleSelectAccount = (id) => {
    if (selectedAccounts.includes(id)) {
      setSelectedAccounts(selectedAccounts.filter(aId => aId !== id));
    } else {
      setSelectedAccounts([...selectedAccounts, id]);
    }
  };

  const handleSelectAllAccounts = () => {
    if (selectedAccounts.length === accounts.length) {
      setSelectedAccounts([]);
    } else {
      setSelectedAccounts(accounts.map(a => a.id));
    }
  };

  // --- BULK APPLY ---
  const handleBulkApply = async () => {
    if (selectedAccounts.length === 0) { alert('Please select at least one account.'); return; }
    if (!selectedIpo) { alert('Please select an active IPO.'); return; }

    const confirmMsg = `CONFIRM LIVE IPO SUBMISSION\n\nApply ${appliedKitta} kitta for ${selectedAccounts.length} selected accounts in CDSC.\n\nProceed?`;
    if (!window.confirm(confirmMsg)) return;

    setError(''); setSuccess(''); setIsProcessing(true);

    const targetAccounts = accounts.filter(a => selectedAccounts.includes(a.id));

    setApplyResults(targetAccounts.map(acc => ({
      id: acc.id, name: acc.name, username: acc.username,
      status: 'loading', resultText: 'Submitting...'
    })));

    if (isNative) {
      // Direct sequential submission on Android
      const MEROSHARE_BASE = 'https://backend.cdsc.com.np/api/meroShare';
      const results = [];
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      for (let i = 0; i < targetAccounts.length; i++) {
        const acc = targetAccounts[i];
        if (i > 0) await sleep(3000);

        try {
          // Resolve clientId
          let clientId = 101;
          try {
            const dpRes = await fetch(`${MEROSHARE_BASE}/capital/`);
            if (dpRes.ok) {
              const dpData = await dpRes.json();
              if (Array.isArray(dpData)) {
                const fullPrefix = acc.boid.substring(0, 8);
                const shortPrefix = acc.boid.substring(3, 8);
                const match = dpData.find(dp => dp.code === fullPrefix || dp.code === shortPrefix);
                if (match) clientId = match.id;
              }
            }
          } catch (_) {}

          // Login
          const loginRes = await fetch(`${MEROSHARE_BASE}/auth/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': 'https://meroshare.cdsc.com.np', 'Referer': 'https://meroshare.cdsc.com.np/' },
            body: JSON.stringify({ clientId: Number(clientId), username: acc.username, password: acc.password }),
          });
          const loginData = await loginRes.json();
          if (!loginRes.ok) throw new Error(loginData.message || `Login failed (${loginRes.status})`);

          const authKey = [...loginRes.headers.keys()].find(k => k.toLowerCase() === 'authorization');
          let token = loginData.token || loginData.accessToken || (authKey ? loginRes.headers.get(authKey) : null);
          if (token && !token.startsWith('Bearer ')) token = `Bearer ${token}`;
          if (!token) throw new Error('No auth token received.');

          // Get application template
          const detailRes = await fetch(`${MEROSHARE_BASE}/applicableIssue/applicable/detail/${selectedIpo}`, {
            headers: { 'Authorization': token, 'Origin': 'https://meroshare.cdsc.com.np', 'Referer': 'https://meroshare.cdsc.com.np/' },
          });
          if (!detailRes.ok) throw new Error(`Template fetch failed (${detailRes.status})`);
          const template = await detailRes.json();
          if (!template) throw new Error('No ASBA template found for this account.');

          // Submit
          const submitRes = await fetch(`${MEROSHARE_BASE}/applicantForm/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token, 'Origin': 'https://meroshare.cdsc.com.np', 'Referer': 'https://meroshare.cdsc.com.np/' },
            body: JSON.stringify({
              ...template,
              appliedKitta: Number(appliedKitta),
              crnNumber: acc.crn?.trim(),
              transactionPin: acc.pin?.trim(),
              boid: acc.boid,
              demat: acc.boid,
            }),
          });
          const submitData = await submitRes.json();
          if (!submitRes.ok) throw new Error(submitData?.message || `Submission failed (${submitRes.status})`);
          results.push({ id: acc.id, name: acc.name, username: acc.username, status: 'success', resultText: submitData?.message || 'Application submitted!' });

        } catch (err) {
          results.push({ id: acc.id, name: acc.name, username: acc.username, status: 'failed', resultText: err.message || 'Submission failed.' });
        }
        setApplyResults([...results]);
      }

      setSuccess('Bulk IPO Apply execution completed.');
      setIsProcessing(false);
    } else {
      // Web: sequential proxy calls per account
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const results = [];

      for (let i = 0; i < targetAccounts.length; i++) {
        const acc = targetAccounts[i];
        if (i > 0) await sleep(3000);

        try {
          // Resolve clientId from DP list (using offline BOID prefix strategy first)
          let clientId = 101;
          const boidStr = String(acc.boid || '').trim();
          if (boidStr.length === 16) {
            const resolved = parseInt(boidStr.substring(3, 6), 10);
            if (!isNaN(resolved) && resolved >= 100 && resolved <= 300) {
              clientId = resolved;
            }
          }

          if (clientId === 101) {
            try {
              const dpRes = await fetch(`${proxyBase}/api/meroshare/dp-list`);
              if (dpRes.ok) {
                const dpJson = await dpRes.json();
                const dpData = dpJson.data || dpJson;
                if (Array.isArray(dpData)) {
                  const fullPrefix = boidStr.substring(0, 8);
                  const shortPrefix = boidStr.substring(3, 8);
                  const match = dpData.find(dp => dp.code === fullPrefix || dp.code === shortPrefix || (dp.code && dp.code.includes(shortPrefix)));
                  if (match) clientId = match.id;
                }
              }
            } catch (_) {}
          }

          const data = await safeFetch(`${proxyBase}/api/meroshare/apply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientId,
              username: acc.username,
              password: acc.password,
              companyShareId: Number(selectedIpo),
              appliedKitta: Number(appliedKitta),
              crnNumber: acc.crn?.trim(),
              transactionPin: String(acc.pin || '').trim(),
              boid: acc.boid,
            }),
          });

          const successMsg = (typeof data.data === 'string' ? data.data : data.data?.message) || 'Application submitted!';
          results.push({ id: acc.id, name: acc.name, username: acc.username, status: 'success', resultText: successMsg });
        } catch (err) {
          let errMsg = err.message || 'Submission failed.';
          if (errMsg.toLowerCase().includes('already applied')) errMsg = 'Already applied for this IPO.';
          else if (errMsg.toLowerCase().includes('invalid crn') || errMsg.toLowerCase().includes('crn')) errMsg = 'Invalid CRN number.';
          else if (errMsg.toLowerCase().includes('insufficient')) errMsg = 'Insufficient bank balance.';
          else if (errMsg.toLowerCase().includes('password') || errMsg.toLowerCase().includes('credentials')) errMsg = 'Wrong credentials.';
          results.push({ id: acc.id, name: acc.name, username: acc.username, status: 'failed', resultText: errMsg });
        }
        setApplyResults([...results]);
      }

      setSuccess('Bulk IPO Apply execution completed.');
      setIsProcessing(false);
    }
  };

  // --- BULK CHECK ---
  const handleBulkCheck = async () => {
    if (selectedAccounts.length === 0) { alert('Please select at least one account.'); return; }
    if (!selectedResultCompany) { alert('Please select an IPO company.'); return; }

    setError(''); setSuccess(''); setIsProcessing(true); setCheckResults([]);

    const targetAccounts = accounts.filter(a => selectedAccounts.includes(a.id));
    const IPO_RESULT_URL = 'https://iporesult.cdsc.com.np/api/ipo-result/public/share-allotment/check';
    const sleep = ms => new Promise(r => setTimeout(r, ms));

    if (isNative) {
      // Direct CDSC check on Android
      const results = [];
      for (let i = 0; i < targetAccounts.length; i++) {
        const acc = targetAccounts[i];
        if (i > 0) await sleep(1500);
        try {
          const res = await fetch(IPO_RESULT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Origin': 'https://iporesult.cdsc.com.np', 'Referer': 'https://iporesult.cdsc.com.np/' },
            body: JSON.stringify({ companyShareId: Number(selectedResultCompany), boid: acc.boid }),
          });
          const data = await res.json().catch(() => ({}));
          const msgStr = (data?.message || '').toLowerCase();
          const isAllotted = data?.success === true || (msgStr.includes('allotted') && !msgStr.includes('not'));
          const match = data.message ? data.message.match(/\d+/) : null;
          results.push({
            id: acc.id, name: acc.name, boid: acc.boid,
            status: isAllotted ? 'allotted' : (msgStr.includes('sorry') || msgStr.includes('not') ? 'not_allotted' : 'failed'),
            message: data.message || (isAllotted ? 'Congratulations! Allotted.' : 'Not allotted.'),
            units: isAllotted && match ? parseInt(match[0]) : 0,
          });
        } catch (err) {
          results.push({ id: acc.id, name: acc.name, boid: acc.boid, status: 'failed', message: err.message, units: 0 });
        }
        setCheckResults([...results]);
      }
      setSuccess('Bulk result check completed.');
      setIsProcessing(false);
    } else {
      // Web: use proxy
      try {
        const targetAccounts = accounts.filter(a => selectedAccounts.includes(a.id));
        const profilesPayload = targetAccounts.map(acc => ({ id: acc.id, boid: acc.boid }));

        const data = await safeFetch(`${proxyBase}/api/ipo-result/bulk-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyShareId: Number(selectedResultCompany), profiles: profilesPayload }),
        });
        if (data.success && Array.isArray(data.results)) {
          setCheckResults(data.results.map(r => {
            const acc = accounts.find(a => a.id === r.id);
            return { id: r.id, name: acc ? acc.name : r.boid, boid: r.boid, status: r.status, message: r.message, units: r.units || 0 };
          }));
          setSuccess('Bulk result check completed.');
        } else {
          throw new Error(data.error || 'Result check failed.');
        }
      } catch (err) {
        setError(err.message || 'Result check failed.');
      } finally {
        setIsProcessing(false);
      }
    }
  };

  const filteredAccounts = accounts.filter(a =>
    (a.name || '').toLowerCase().includes(accountSearch.toLowerCase()) ||
    (a.username || '').toLowerCase().includes(accountSearch.toLowerCase()) ||
    (a.boid || '').includes(accountSearch)
  );

  const getActiveIpoDetails = () => ipos.find(i => i.id?.toString() === selectedIpo);
  const totalAllottedShares = checkResults.reduce((acc, curr) => acc + (curr.units || 0), 0);
  const allottedCount = checkResults.filter(r => r.status === 'allotted').length;

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Sub Tabs */}
      <div className="tab-bar" style={{ marginBottom: 0 }}>
        <button onClick={() => { setActiveTab('apply'); setCheckResults([]); }}
          className={`tab-btn ${activeTab === 'apply' ? 'active' : ''}`}
          style={{ flex: 1, padding: '10px 0', fontSize: 13 }}>
          Bulk Apply
        </button>
        <button onClick={() => { setActiveTab('result'); setApplyResults([]); }}
          className={`tab-btn ${activeTab === 'result' ? 'active' : ''}`}
          style={{ flex: 1, padding: '10px 0', fontSize: 13 }}>
          Lottery Check
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="card fade-in" style={{ borderColor: 'rgba(245,69,92,0.25)', background: 'var(--bear-subtle)', color: 'var(--bear)', padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertCircle style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{error}</span>
        </div>
      )}
      {success && (
        <div className="card fade-in" style={{ borderColor: 'rgba(16,217,138,0.25)', background: 'var(--bull-subtle)', color: 'var(--bull)', padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <CheckCircle2 style={{ width: 16, height: 16, flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 12, fontWeight: 600 }}>{success}</span>
        </div>
      )}

      {/* 1. Select Issue / Company */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Landmark style={{ width: 15, height: 15, color: 'var(--primary-light)' }} /> 1. Select Issue or Company
          </h4>
          <button
            onClick={() => {
              setError('');
              setSuccess('');
              if (activeTab === 'apply') {
                setIpos([]);
                fetchActiveIpos();
              } else {
                setResultCompanies([]);
                fetchResultCompanies();
              }
            }}
            style={{ background: 'none', border: 'none', color: 'var(--primary-light)', cursor: 'pointer', padding: 4 }}
            title="Refresh list"
          >
            <RefreshCw style={{ width: 13, height: 13 }} className={(isLoadingIpos || isLoadingResults) ? 'animate-spin' : ''} />
          </button>
        </div>

        {activeTab === 'apply' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {isLoadingIpos ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', justifyContent: 'center' }}>
                <Loader2 style={{ width: 20, height: 20 }} className="animate-spin" />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Loading active IPO issues...</span>
              </div>
            ) : ipos.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
                No active IPO issues. Tap refresh to check again.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <select value={selectedIpo} onChange={e => setSelectedIpo(e.target.value)}
                  className="select-input" style={{ padding: '10px 12px', fontSize: 13.5 }}>
                  {ipos.map(ipo => (
                    <option key={ipo.id} value={ipo.id}>{ipo.name} ({ipo.scrip})</option>
                  ))}
                </select>

                {getActiveIpoDetails() && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Min Quantity:</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{getActiveIpoDetails().minKitta} Shares</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Price per share:</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>Rs. {getActiveIpoDetails().amountPerShare}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Closing Date:</span>
                      <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                        {getActiveIpoDetails().closeDate ? getActiveIpoDetails().closeDate.split('T')[0] : 'N/A'}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="input-label">Quantity to Apply (Kitta)</label>
                  <input type="number" value={appliedKitta}
                    onChange={e => setAppliedKitta(Math.max(10, Number(e.target.value)))}
                    className="input" style={{ padding: '10px 12px', fontSize: 13 }} min="10" step="10" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {isLoadingResults ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0', justifyContent: 'center' }}>
                <Loader2 style={{ width: 20, height: 20 }} className="animate-spin" />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Loading result databases...</span>
              </div>
            ) : resultCompanies.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>No result databases found. Tap refresh to reload.</p>
            ) : (
              <select
                value={selectedResultCompany}
                onChange={e => setSelectedResultCompany(e.target.value)}
                className="select-input" style={{ padding: '10px 12px', fontSize: 13.5 }}>
                {resultCompanies.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* 2. Select Accounts */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h4 style={{ fontSize: 13, fontWeight: 'bold', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users style={{ width: 15, height: 15, color: 'var(--primary-light)' }} /> 2. Choose Accounts
          </h4>
          <button onClick={handleSelectAllAccounts}
            style={{ background: 'none', border: 'none', color: 'var(--primary-light)', fontSize: 11.5, fontWeight: 'bold', cursor: 'pointer' }}>
            {selectedAccounts.length === accounts.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        <input type="text" placeholder="Filter accounts..." value={accountSearch}
          onChange={e => setAccountSearch(e.target.value)}
          className="input" style={{ padding: '8px 12px', fontSize: 12 }} />

        {isLoadingAccounts ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <Loader2 style={{ width: 24, height: 24 }} className="animate-spin" />
          </div>
        ) : accounts.length === 0 ? (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', margin: 0 }}>
            No accounts configured. Go to Accounts tab to add accounts.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 150, overflowY: 'auto', paddingRight: 4 }}>
            {filteredAccounts.map(acc => {
              const isChecked = selectedAccounts.includes(acc.id);
              return (
                <div key={acc.id}
                  onClick={() => !isProcessing && handleSelectAccount(acc.id)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', borderRadius: 'var(--radius-md)',
                    background: isChecked ? 'var(--primary-subtle)' : 'rgba(255,255,255,0.02)',
                    border: isChecked ? '1px solid rgba(91,94,244,0.3)' : '1px solid var(--border)',
                    cursor: 'pointer', transition: 'var(--transition)'
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 15, height: 15, borderRadius: 4,
                      border: isChecked ? '1px solid var(--primary-light)' : '1px solid var(--text-muted)',
                      background: isChecked ? 'var(--primary)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {isChecked && <Award style={{ width: 11, height: 11, color: '#fff' }} />}
                    </div>
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 'bold', color: 'var(--text-primary)' }}>{acc.name}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>BOID: ...{acc.boid ? acc.boid.slice(-4) : '????'}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 9.5, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '2px 8px', borderRadius: 50 }}>
                    {acc.username}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {accounts.length > 0 && (
          <button onClick={activeTab === 'apply' ? handleBulkApply : handleBulkCheck}
            disabled={isProcessing || selectedAccounts.length === 0}
            className="btn-primary"
            style={{ width: '100%', padding: '12px 0', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 }}>
            {isProcessing ? (
              <><Loader2 style={{ width: 16, height: 16 }} className="animate-spin" /> Processing sequentially...</>
            ) : (
              <><Play style={{ width: 14, height: 14 }} /> {activeTab === 'apply' ? 'Launch Bulk IPO Apply' : 'Launch Allotment Check'}</>
            )}
          </button>
        )}
      </div>

      {/* 3. Apply Results */}
      {activeTab === 'apply' && applyResults.length > 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h4 className="section-title">Submission Logs</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {applyResults.map(r => (
              <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 12.5, color: 'var(--text-primary)' }}>{r.name}</div>
                  <div style={{ fontSize: 9.5, color: r.status === 'success' ? 'var(--bull)' : r.status === 'failed' ? 'var(--bear)' : 'var(--text-muted)', marginTop: 2 }}>{r.resultText}</div>
                </div>
                <div>
                  {r.status === 'loading' && <Loader2 style={{ width: 14, height: 14, color: 'var(--primary-light)' }} className="animate-spin" />}
                  {r.status === 'success' && <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--bull)' }} />}
                  {r.status === 'failed' && <XCircle style={{ width: 16, height: 16, color: 'var(--bear)' }} />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Check Results */}
      {activeTab === 'result' && checkResults.length > 0 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 className="section-title" style={{ marginBottom: 0, color: 'var(--text-primary)' }}>Lottery Results</h3>
            <button onClick={() => setCheckResults([])}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>Clear</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block' }}>Total Allotted</span>
              <span style={{ fontSize: 15, fontWeight: 950, color: 'var(--bull)', fontFamily: 'var(--font-mono)', display: 'block', marginTop: 4 }}>{totalAllottedShares} Units</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: 12 }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block' }}>Wins</span>
              <span style={{ fontSize: 15, fontWeight: 950, color: 'var(--primary-light)', display: 'block', marginTop: 4 }}>{allottedCount} / {checkResults.length}</span>
            </div>
          </div>

          {allottedCount > 0 && (
            <div style={{ background: 'var(--bull-subtle)', border: '1px solid rgba(16,217,138,0.25)', padding: 12, borderRadius: 'var(--radius-md)', display: 'flex', gap: 8 }}>
              <Sparkles style={{ width: 15, height: 15, color: 'var(--bull)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <span style={{ fontSize: 11.5, fontWeight: 'bold', color: 'var(--bull)', display: 'block' }}>ALLOTMENT SUCCESSFUL 🎉</span>
                <span style={{ fontSize: 9.5, color: 'var(--text-primary)', opacity: 0.9 }}>Congratulations! You have been selected in the lottery.</span>
              </div>
            </div>
          )}

          {allottedCount > 0 && (
            <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', padding: 12, borderRadius: 'var(--radius-md)', display: 'flex', gap: 8 }}>
              <ShieldAlert style={{ width: 15, height: 15, color: 'var(--accent-amber)', flexShrink: 0, marginTop: 1 }} />
              <div>
                <span style={{ fontSize: 11, fontWeight: 'bold', color: 'var(--accent-amber)', display: 'block' }}>⚠️ MANDATORY EDIS STEP</span>
                <span style={{ fontSize: 9.5, color: 'var(--text-primary)', opacity: 0.85, lineHeight: 1.45 }}>Submit EDIS (Share Transfer) on MeroShare within 24 hours of selling allotted shares to avoid a 20% fine.</span>
              </div>
            </div>
          )}

          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 11 }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '8px 10px', fontWeight: 'bold' }}>Name</th>
                  <th style={{ padding: '8px 10px', fontWeight: 'bold' }}>Status</th>
                  <th style={{ padding: '8px 10px', fontWeight: 'bold', textAlign: 'right' }}>Shares</th>
                </tr>
              </thead>
              <tbody>
                {checkResults.map((r, i) => (
                  <tr key={i} style={{ borderBottom: i === checkResults.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.03)', background: r.status === 'allotted' ? 'var(--bull-subtle)' : 'transparent' }}>
                    <td style={{ padding: '10px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      <div>{r.name}</div>
                      <div style={{ fontSize: 8.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>BOID: ...{r.boid ? r.boid.slice(-4) : ''}</div>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{
                        display: 'inline-flex', padding: '2px 6px', borderRadius: 4, fontSize: 9, fontWeight: 'bold', textTransform: 'uppercase',
                        ...(r.status === 'allotted' ? { background: 'rgba(16,217,138,0.1)', color: 'var(--bull)' } :
                          r.status === 'not_allotted' ? { background: 'rgba(245,69,92,0.1)', color: 'var(--bear)' } :
                            { background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' })
                      }}>
                        {r.status === 'allotted' ? 'Allotted' : r.status === 'not_allotted' ? 'Not Allotted' : 'Failed'}
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: r.status === 'allotted' ? 800 : 500, color: r.status === 'allotted' ? 'var(--bull)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                      {r.units > 0 ? `+${r.units}` : '0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
