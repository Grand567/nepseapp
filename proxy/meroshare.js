import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { CookieJar } from 'tough-cookie';
import { wrapper } from 'axios-cookiejar-support';

const router = express.Router();
const ACCOUNTS_FILE = path.resolve('proxy/meroshare_accounts.json');

// AES-256-CBC configuration for secure credential storage
const ENCRYPTION_KEY = process.env.MEROSHARE_ENCRYPTION_KEY || 'd3@bya$hr33_n3ps3_hub_s3cr3t_k3y'; // 32 chars
const IV_LENGTH = 16;

function getSHA256Key() {
  return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

function encrypt(text) {
  if (!text) return '';
  const key = getSHA256Key();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return '';
  const parts = text.split(':');
  if (parts.length !== 2) return text; // fallback if plaintext
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const key = getSHA256Key();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

// Ensure accounts file exists
if (!fs.existsSync(ACCOUNTS_FILE)) {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify([], null, 2), 'utf8');
}

function loadAccounts() {
  try {
    const data = fs.readFileSync(ACCOUNTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    console.error('[meroshare-bulk] Error loading accounts:', e.message);
    return [];
  }
}

function saveAccounts(accounts) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8');
  } catch (e) {
    console.error('[meroshare-bulk] Error saving accounts:', e.message);
  }
}

// --- MeroShare Session & WAF Bypass logic ---
const MEROSHARE_BASE = 'https://backend.cdsc.com.np/api/meroShare';
const sharedJar = new CookieJar();

const createMeroShareSession = () => {
  return wrapper(axios.create({
    jar: sharedJar,
    withCredentials: true,
    timeout: 20000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin': 'https://meroshare.cdsc.com.np',
      'Referer': 'https://meroshare.cdsc.com.np/',
    }
  }));
};

const isWafBlocked = (response) => {
  if (!response) return false;
  if (response.status === 403 || response.status === 503) return true;
  if (!response.data) return false;
  if (typeof response.data === 'string') {
    const lowData = response.data.toLowerCase();
    if (
      lowData.includes('request rejected') ||
      lowData.includes('access denied') ||
      lowData.includes('forbidden') ||
      lowData.includes('blocked') ||
      response.data.trim().startsWith('<html')
    ) {
      return true;
    }
  }
  return false;
};

// Validate that external API responses are valid JSON and not HTML error pages
const validateJsonResponse = (response, label = 'MeroShare API') => {
  if (!response) {
    throw new Error(`${label} returned no response.`);
  }
  const contentType = response.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    console.error(`[${label} Non-JSON Response Detected]:`, typeof response.data === 'string' ? response.data.substring(0, 500) : response.data);
    throw new Error(`${label} returned HTML/non-JSON content. This indicates the CDSC server is busy, offline, or your connection was flagged by their firewall.`);
  }
};

const primeSession = async (client) => {
  try {
    const cookies = sharedJar.getCookiesSync('https://backend.cdsc.com.np');
    if (cookies && cookies.length > 0) {
      return;
    }
  } catch (e) {
    console.warn('[meroshare-bulk/prime] Cookie check warning:', e.message);
  }

  try {
    await client.get('https://meroshare.cdsc.com.np/', {
      headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
      timeout: 10000,
      maxRedirects: 5,
    });
  } catch (e) {
    // Ignore initial page hit errors
  }

  const capRes = await client.get(`${MEROSHARE_BASE}/capital/`, {
    headers: { 'Content-Type': 'application/json' },
  });

  if (isWafBlocked(capRes)) {
    await new Promise(r => setTimeout(r, 1000));
    const retry = await client.get(`${MEROSHARE_BASE}/capital/`, {
      headers: { 'Content-Type': 'application/json' },
    });
    if (isWafBlocked(retry)) {
      throw new Error('MeroShare WAF firewall is currently blocking requests. Please try again later.');
    }
  }
};

// Dynamically resolve client ID (DP ID)
async function getRealClientId(boid, dpCode, client) {
  try {
    const response = await client.get(`${MEROSHARE_BASE}/capital/`, {
      headers: { 'Content-Type': 'application/json' },
    });
    validateJsonResponse(response, 'DP Capital List');
    if (response.data && Array.isArray(response.data)) {
      const dpData = response.data;
      const fullBoidPrefix = boid.substring(0, 8);
      const shortBoidPrefix = boid.substring(3, 8);

      const matchedByFull = dpData.find(dp => dp.code === fullBoidPrefix);
      if (matchedByFull) return matchedByFull.id;

      const matchedByShort = dpData.find(dp => dp.code === shortBoidPrefix || (dp.code && dp.code.includes(shortBoidPrefix)));
      if (matchedByShort) return matchedByShort.id;

      if (dpCode) {
        const matchedByCode = dpData.find(dp => dp.code === dpCode || (dp.code && dp.code.includes(dpCode)));
        if (matchedByCode) return matchedByCode.id;
      }
    }
  } catch (err) {
    console.error('[meroshare-bulk] Failed to dynamically resolve DP ID, falling back:', err.message);
  }
  return 101; // Safe generic fallback
}

// --- Endpoints ---

// 1. Get Accounts (masking passwords and pins)
router.get('/accounts', (req, res) => {
  try {
    const accounts = loadAccounts();
    const safeAccounts = accounts.map(acc => ({
      id: acc.id,
      name: acc.name,
      boid: acc.boid,
      username: acc.username,
      dpCode: acc.dpCode,
      dpName: acc.dpName,
      hasPassword: !!acc.password,
      hasCrn: !!acc.crn,
      hasPin: !!acc.transactionPin,
    }));
    res.json({ success: true, accounts: safeAccounts });
  } catch (error) {
    console.error('[accounts/get] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve accounts from server.' });
  }
});

// 2. Add or Update Account
router.post('/accounts', (req, res) => {
  try {
    const { id, name, boid, username, dpCode, dpName, password, crn, pin } = req.body;
    if (!name || boid.length !== 16 || !username || !password || !crn || String(pin).length !== 4) {
      return res.status(400).json({ success: false, error: 'Invalid or missing fields. BOID must be 16 digits, PIN must be 4 digits.' });
    }

    const accounts = loadAccounts();
    const existingIndex = accounts.findIndex(acc => acc.boid === boid || (id && acc.id === id));

    const accountData = {
      id: id || Date.now().toString(),
      name,
      boid,
      username,
      dpCode,
      dpName: dpName || 'Capital DP',
      password: encrypt(password),
      crn: encrypt(crn),
      transactionPin: encrypt(String(pin)),
    };

    if (existingIndex >= 0) {
      accounts[existingIndex] = accountData;
    } else {
      accounts.push(accountData);
    }

    saveAccounts(accounts);
    res.json({ success: true, message: 'Account saved successfully on server.' });
  } catch (error) {
    console.error('[accounts/add] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to encrypt or save accounts on server.' });
  }
});

// 3. Delete Account
router.delete('/accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const accounts = loadAccounts();
    const filtered = accounts.filter(acc => acc.id !== id);
    if (filtered.length === accounts.length) {
      return res.status(404).json({ success: false, error: 'Account not found.' });
    }
    saveAccounts(filtered);
    res.json({ success: true, message: 'Account deleted from server.' });
  } catch (error) {
    console.error('[accounts/delete] Error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to delete account from server.' });
  }
});

// 4. Get Current Active IPOs
router.get('/ipos', async (req, res) => {
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    return res.status(400).json({ success: false, error: 'Please add at least one MeroShare account on the server first.' });
  }

  try {
    const acc = accounts[0];
    const client = createMeroShareSession();
    await primeSession(client);

    const clientId = await getRealClientId(acc.boid, acc.dpCode, client);
    const password = decrypt(acc.password);

    // 1. Silent login
    const loginRes = await client.post(`${MEROSHARE_BASE}/auth/`, {
      clientId: Number(clientId),
      username: acc.username,
      password
    });

    if (isWafBlocked(loginRes)) {
      return res.status(503).json({ success: false, error: 'MeroShare security firewall blocked silent authentication.' });
    }
    validateJsonResponse(loginRes, 'Authentication');

    const authHeaderKey = Object.keys(loginRes.headers).find(k => k.toLowerCase() === 'authorization');
    let token = loginRes.data?.token || loginRes.data?.Authorization || loginRes.data?.accessToken || (authHeaderKey ? loginRes.headers[authHeaderKey] : null);
    if (token && typeof token === 'string' && !token.startsWith('Bearer ')) {
      token = `Bearer ${token}`;
    }

    if (!token) {
      return res.status(401).json({ success: false, error: 'Silent MeroShare authentication failed.' });
    }

    // 2. Fetch current issues
    const issuesRes = await client.get(`${MEROSHARE_BASE}/companyShare/currentIssue`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
      },
    });

    if (isWafBlocked(issuesRes)) {
      return res.status(503).json({ success: false, error: 'CDSC firewall blocked fetching active issues.' });
    }
    validateJsonResponse(issuesRes, 'Current Issues');

    // Map response
    const openIpos = (issuesRes.data || []).map(item => ({
      id: item.companyShareId,
      name: item.companyName,
      scrip: item.scrip || '',
      type: item.shareTypeName || 'IPO',
      status: 'Open',
      units: item.minKitta || 10,
      minKitta: item.minKitta || 10,
      maxKitta: item.maxKitta || 10000,
      amountPerShare: item.amountPerShare || 100,
      openDate: item.issueOpenDate || '',
      closeDate: item.issueCloseDate || '',
    }));

    res.json({ success: true, data: openIpos });
  } catch (error) {
    if (error.response) {
      console.error(`[ipos/get] Error Response Data:`, error.response.data);
    }
    console.error('[meroshare-bulk/ipos] Error fetching active IPOs:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch current IPOs: ' + error.message });
  }
});

// 5. Bulk Apply to IPO (sequential processing with F5 BIG-IP WAF compliance)
router.post('/apply', async (req, res) => {
  const { companyShareId, appliedKitta, accountIds } = req.body;
  if (!companyShareId || !appliedKitta || !Array.isArray(accountIds) || accountIds.length === 0) {
    return res.status(400).json({ success: false, error: 'Missing parameters: companyShareId, appliedKitta, and accountIds[] are required.' });
  }

  const accounts = loadAccounts();
  const targetAccounts = accounts.filter(acc => accountIds.includes(acc.id));

  if (targetAccounts.length === 0) {
    return res.status(404).json({ success: false, error: 'No matching registered accounts found on server.' });
  }

  const results = [];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < targetAccounts.length; i++) {
    const acc = targetAccounts[i];

    if (i > 0) {
      // 3-second delay to comply with F5 CDSC WAF and rate limit safely
      await sleep(3000);
    }

    try {
      const client = createMeroShareSession();
      await primeSession(client);

      const clientId = await getRealClientId(acc.boid, acc.dpCode, client);
      const password = decrypt(acc.password);
      const crn = decrypt(acc.crn);
      const pin = decrypt(acc.transactionPin);

      // A. Login
      const loginResponse = await client.post(`${MEROSHARE_BASE}/auth/`, {
        clientId: Number(clientId),
        username: acc.username,
        password
      });

      if (isWafBlocked(loginResponse)) {
        throw new Error('CDSC login blocked by security firewall.');
      }
      validateJsonResponse(loginResponse, 'Authentication');

      const authHeaderKey = Object.keys(loginResponse.headers).find(k => k.toLowerCase() === 'authorization');
      let token = loginResponse.data?.token || loginResponse.data?.Authorization || loginResponse.data?.accessToken || (authHeaderKey ? loginResponse.headers[authHeaderKey] : null);
      if (token && typeof token === 'string' && !token.startsWith('Bearer ')) {
        token = `Bearer ${token}`;
      }

      if (!token) {
        throw new Error('Authentication succeeded but token extraction failed.');
      }

      // B. Fetch details template
      const detailResponse = await client.get(`${MEROSHARE_BASE}/applicableIssue/applicable/detail/${companyShareId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
        },
      });

      if (isWafBlocked(detailResponse)) {
        throw new Error('Firewall blocked fetching applicant template.');
      }
      validateJsonResponse(detailResponse, 'Application Template');

      const template = detailResponse.data;
      if (!template) {
        throw new Error('No applicant ASBA template found. Issue may not be applicable for this account.');
      }

      // C. Submit application
      const payload = {
        ...template,
        appliedKitta: Number(appliedKitta),
        crnNumber: crn.trim(),
        transactionPin: pin.trim(),
        boid: acc.boid,
        demat: acc.boid,
      };

      const submitResponse = await client.post(`${MEROSHARE_BASE}/applicantForm/`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
        },
      });

      if (isWafBlocked(submitResponse)) {
        throw new Error('Submission blocked by CDSC firewall.');
      }
      validateJsonResponse(submitResponse, 'Submission Result');

      results.push({
        id: acc.id,
        name: acc.name,
        username: acc.username,
        success: true,
        message: submitResponse.data?.message || 'ASBA application submitted successfully!'
      });

    } catch (err) {
      if (err.response) {
        console.error(`[apply/single] Error Response for ${acc.name}:`, err.response.data);
      }
      console.error(`[meroshare-bulk/apply] Failed for ${acc.name}:`, err.message);
      results.push({
        id: acc.id,
        name: acc.name,
        username: acc.username,
        success: false,
        message: err.response?.data?.message || err.message || 'Unknown CDSC failure.'
      });
    }
  }

  res.json({ success: true, results });
});

// 6. Bulk Check Allotment Result (delegates rate limited requests safely)
router.post('/check-result', async (req, res) => {
  const { companyShareId, accountIds } = req.body;
  if (!companyShareId || !Array.isArray(accountIds) || accountIds.length === 0) {
    return res.status(400).json({ success: false, error: 'companyShareId and accountIds[] are required.' });
  }

  const accounts = loadAccounts();
  const targetAccounts = accounts.filter(acc => accountIds.includes(acc.id));

  if (targetAccounts.length === 0) {
    return res.status(404).json({ success: false, error: 'No matching registered accounts found on server.' });
  }

  const IPO_RESULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/plain, */*',
    'Origin': 'https://iporesult.cdsc.com.np',
    'Referer': 'https://iporesult.cdsc.com.np/',
  };

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const checkSingleBoid = async (boid) => {
    const attempt = async () => {
      const response = await axios.post(
        'https://iporesult.cdsc.com.np/api/ipo-result/public/share-allotment/check',
        { companyShareId: Number(companyShareId), boid },
        { headers: IPO_RESULT_HEADERS, timeout: 15000 }
      );
      validateJsonResponse(response, 'Allotment Checker');
      return response.data;
    };

    try {
      return await attempt();
    } catch (firstErr) {
      if (firstErr.response && firstErr.response.data) {
        return firstErr.response.data;
      }
      console.warn(`[bulk-check/meroshare] BOID ${boid} first attempt failed. Retrying in 3s...`);
      await sleep(3000);
      try {
        return await attempt();
      } catch (retryErr) {
        if (retryErr.response && retryErr.response.data) {
          return retryErr.response.data;
        }
        throw new Error(retryErr.message || 'CDSC server returned HTML/error during allotment check.');
      }
    }
  };

  const results = [];

  for (let i = 0; i < targetAccounts.length; i++) {
    const acc = targetAccounts[i];
    if (i > 0) await sleep(1500); // Respect CDSC lottery endpoint rate limits

    try {
      const data = await checkSingleBoid(acc.boid);
      const msgStr = (data?.message || '').toLowerCase();
      const isCdscResponse = msgStr.includes('allotted') || msgStr.includes('sorry') ||
        msgStr.includes('congratulations') || data?.success === true;

      let status, message, units;
      if (isCdscResponse) {
        const isAllotted = data?.success === true || (msgStr.includes('allotted') && !msgStr.includes('not'));
        if (isAllotted) {
          const match = data.message ? data.message.match(/\d+/) : null;
          units = match ? parseInt(match[0]) : 10;
          status = 'allotted';
          message = data.message || `Congratulations! Allotted ${units} Units.`;
        } else {
          status = 'not_allotted';
          units = 0;
          message = data.message || 'Sorry, not allotted.';
        }
      } else {
        status = 'failed';
        units = 0;
        message = data?.message || 'Invalid response from CDSC.';
      }

      results.push({ id: acc.id, boid: acc.boid, status, message, units });
    } catch (err) {
      console.error(`[check-result] Failed for BOID ${acc.boid}:`, err.message);
      results.push({
        id: acc.id,
        boid: acc.boid,
        status: 'failed',
        message: err.message || 'Connection to CDSC failed. Please retry.',
        units: 0
      });
    }
  }

  res.json({ success: true, results });
});

export default router;
