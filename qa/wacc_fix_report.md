# QA & Root Cause Report: MeroShare WACC Details Integration

**Date:** 2026-11-10  
**Status:** Completed & Ready for User DevTools Capture  
**Target:** CDSC MeroShare WACC Details & Demat Portfolio Synchronization  

---

## 1. Executive Summary & Problem Statement

The user reported that upon syncing WACC from MeroShare in the Portfolio tab, the application displayed a popup claiming:  
> *"CDSC Has No Unsold Purchase Records: CDSC MeroShare stores WACC records only after an EDIS transfer..."*

**Ground Truth from User's Active CDSC MeroShare Account:**
MeroShare's web application contains an explicit navigation page under My Purchase Source: **"View your WACC details"** displaying verified per-scrip WACC records:
- **Scrip 1:** WACC `345.5381`, Calculated Quantity `100`, Total Cost of Capital `34553.813`, Last Modified `2026-10-28`
- **AKPL:** WACC `264.5392`, Calculated Quantity `10`, Total Cost of Capital `2645.392`, Last Modified `2026-11-04`

Therefore, CDSC MeroShare **does store persistent WACC records** for unsold holdings prior to EDIS transfers, and the application's fallback popup was incorrect and misleading.

---

## 2. Root Cause Analysis (Requirement 1)

### 2.1 The Code That Produced the False Popup
The popup was hardcoded in `src/components/Portfolio.jsx` at two locations:
1. **Sync Completion Handler (`handleSyncWaccFromMeroShare`)** (lines ~1328–1336):
   ```javascript
   if (result.count === 0) {
     toast.info(
       'CDSC Has No Unsold Purchase Records: CDSC MeroShare stores WACC records only after an EDIS transfer or when an EDIS request is pending. Your holdings remain active with current estimates.',
       { duration: 8000 }
     );
   }
   ```
2. **Help Info Modal / Legend Tooltip** (lines ~3331–3341):
   Rendered the same static explanation whenever a user clicked for info on why WACC showed "Not Available".

### 2.2 Trigger Condition
The condition triggering this popup was simply `result.count === 0` (or `Object.keys(waccMap).length === 0`).  
Because the app called an endpoint that returned an empty array or failed to parse the WACC view, `count === 0` was met, and the UI presented the false assumption as fact instead of indicating the real reason (such as an unmapped endpoint, expired session, or genuinely empty holding).

### 2.3 CDSC / MeroShare Endpoints Currently Called by the App

Prior to this fix, the application queried two endpoints in `src/services/meroShareService.js`:

1. **Primary Endpoint: My Holding View**
   - **Path:** `POST /api/meroShareView/myHolding/` (fallback to `POST /api/meroShare/myHolding/`)
   - **Host:** Routed through local proxy to `https://webbackend.cdsc.com.np`
   - **Headers:** `Authorization: <token>`, `Content-Type: application/json`
   - **Request Payload Shape:**
     ```json
     {
       "sortBy": "script",
       "demat": ["<16-digit demat / boid>"],
       "clientCode": "<client_code>",
       "page": 1,
       "size": 500,
       "sortAsc": true
     }
     ```
   - **Response Fields Read:**
     The code searched for properties: `item.scrip || item.script || item.symbol`, `item.wacc || item.userPrice || item.rate || item.purchasePrice || item.costPrice`, `item.holdingDays`, `item.holdingType`.
   - **Why this failed:** `/myHolding/` provides portfolio balance and transaction lot status, but does NOT serve the aggregated "View your WACC details" table that MeroShare renders in the web interface.

2. **Secondary Fallback Endpoint: Purchase Source Search**
   - **Path:** `POST /api/meroShare/purchaseSource/search/`
   - **Request Payload Shape:**
     ```json
     {
       "scrip": "<symbol>",
       "demat": "<demat_id>",
       "clientCode": "<client_code>"
     }
     ```
   - **Response Fields Read:** `transactions` array with `item.quantity`, `item.userPrice`, `item.purchaseType`.
   - **Why this failed:** This endpoint is designed for the individual lot selection wizard ("Purchase Source") before WACC is finalized, not the completed "View your WACC details" registry.

---

## 3. Analysis of Existing `proxy/meroshare.js` & Unverified Findings (Requirement 2)

An audit of `proxy/meroshare.js` reveals reverse-proxy route registrations for:
- `/accounts`
- `/ipos`
- `/apply`
- `/check-result`
- `/own-detail`
- `/portfolio`
- `/current-issue`
- `/my-applied-ipo`

**Finding:**  
`proxy/meroshare.js` contains **NO** route or client method specifically handling the "View your WACC details" table.

> [!WARNING]
> ### Status: UNVERIFIED
> The exact REST path, HTTP method (`GET` vs `POST`), and request payload schema for the live CDSC MeroShare endpoint that serves the **"View your WACC details"** screen cannot be determined from the existing codebase without guessing.
> In accordance with Requirement 2, this endpoint is explicitly marked **UNVERIFIED**. We will NOT guess the endpoint name.

---

## 4. Instructions for Browser DevTools Network Capture (Requirement 2)

To ensure 100% precision with the live CDSC MeroShare server, please capture the request from your browser as follows:

1. Open Google Chrome, Firefox, or Edge on your PC/laptop.
2. Log in to your CDSC MeroShare account at: `https://meroshare.cdsc.com.np`.
3. Open Developer Tools by pressing **F12** (or `Ctrl + Shift + I` / `Cmd + Option + I`).
4. Click on the **Network** tab at the top of Developer Tools.
5. In the Network tab filter bar, select **Fetch/XHR** (or ensure all requests are shown).
6. In MeroShare's left navigation menu, click **My Purchase Source**, then click **View your WACC details**.
7. When the WACC table appears on your screen (with AKPL and your other scrips), look at the newly appeared requests in the Network list.
8. Look for a request named something like `wacc`, `viewWacc`, `waccDetails`, `myWacc`, or `waccHistory`.
9. Click on that request and copy:
   - **Request URL:** (e.g., `https://webbackend.cdsc.com.np/api/meroShare/...`)
   - **Request Method:** (`GET` or `POST`)
   - **Request Payload (if POST):** (copy the JSON body from the Payload tab)
   - **Response:** (copy the JSON from the Response tab)

> [!CAUTION]
> **Privacy & Security Protection:**
> Before pasting here, **DELETE the `Authorization` header and any bearer tokens**.
> Only paste the URL, Method, Request Payload (with any sensitive ID replaced by `<demat>`), and the Response JSON structure.

---

## 5. Architectural Implementation Completed (Requirements 3 – 7)

While awaiting the live endpoint path from the user, the entire WACC processing pipeline, data validation, UI components, and test suite have been built and verified against the user's exact ground-truth specification:

### 5.1 New Dedicated WACC Module: `src/services/meroShareWaccService.js`
1. **Symbol Normalization (`normalizeScripSymbol`)**:
   - Trims whitespace and converts to uppercase.
   - Cleans share class suffixes: `.N0000`, `_PO`, `_PR`, `.P`, `.PROM`.
   - Strips non-alphanumeric punctuation to cleanly pair symbols with portfolio holdings (e.g., `AKPL` <-> `akpl`).
2. **Mathematical Verification (`verifyWaccMath`)**:
   - Computes: $\text{expectedTotal} = \text{waccRate} \times \text{waccCalculatedQuantity}$.
   - Evaluates: $\Delta = |\text{totalCostOfCapital} - \text{expectedTotal}|$.
   - Flags discrepancies exceeding tolerance (Rs. 0.05 / 5 paisa).
   - Validated against user ground-truth records:
     - AKPL: $264.5392 \times 10 = 2645.392$ (Difference: $0.000$ -> Valid)
     - Scrip 1: $345.5381 \times 100 = 34553.81$ vs $34553.813$ (Difference: $0.003$ -> Valid)
3. **Flexible Envelope Parser (`parseMeroShareWaccDetailsResponse`)**:
   - Handles Spring Data Pageable envelopes (`content`, `number`, `totalPages`, `totalElements`).
   - Handles direct arrays (`[...]`).
   - Handles nested view containers (`meroShareWaccView`, `meroShareViewArray`, `data`, `object`, `waccDetails`).
   - Extracts: `scripName`, `waccRate`, `lastModifiedDate`, `waccCalculatedQuantity`, `totalCostOfCapital`.
4. **Quantity Discrepancy & Holding Matching (`matchWaccRecordsToHoldings`)**:
   - Matches CDSC WACC records against Demat holdings by normalized symbol.
   - **Requirement 4 Guarantee:** If held quantity differs from WACC quantity ($\text{heldQty} \neq \text{waccQty}$), notes difference clearly. If held > WACC, isolates uncovered shares and **never** silently extrapolates the rate to extra shares.
5. **Failure Classification (`classifyWaccSyncFailure`)**:
   - Classifies errors into structured categories:
     - `NOT_LOGGED_IN` (MeroShare credentials unlinked/missing)
     - `SESSION_EXPIRED` (HTTP 401 / Token expired)
     - `CDSC_BLOCKED_WAF` (HTTP 403 / 503 / Firewall blocked)
     - `CDSC_UNREACHABLE` (Timeout / ECONNREFUSED / Network drop)
     - `ENDPOINT_ERROR` (Generic HTTP error)
     - `GENUINELY_NO_RECORD` (Clean empty response)

### 5.2 UI Upgrades: `src/components/Portfolio.jsx`
1. Replaced misleading "CDSC Has No Unsold Purchase Records" popup with precise, context-aware messages based on `classifyWaccSyncFailure`.
2. Enhanced holding card and table views to display:
   - **WACC Rate** (Rs.)
   - **WACC Calculated Quantity**
   - **Held Quantity**
   - **Total Cost of Capital** (Rs.)
   - **Last Modified Date**
3. Added visual alert badges for quantity mismatches (`⚠️ WACC verified for X of Y held shares`).
4. Enforced cost-basis hierarchy: `CDSC_WACC` -> `BUY_ORDER` / `IMPORTED` -> `MANUAL` -> `NOT_AVAILABLE`.
5. Added required fiduciary disclaimer below portfolio summary:
   > *"ℹ️ Profit/loss and capital-gains figures are estimates, confirm with your broker."*

### 5.3 Security & Encryption Guarantees (Requirement 7)
- CDSC credentials remain encrypted with AES-256-CBC at rest.
- No tokens, passwords, or session IDs are written to console logs, error toasts, or URL queries.
- TLS certificate verification remains strictly enforced (`rejectUnauthorized: true`) for all `cdsc.com.np` endpoints.

---

## 6. Test Suite & Verification Results (Requirement 8)

### 6.1 Unit Tests (`tests/testMeroShareWaccDetails.test.mjs`)
- **46 Unit Tests Executed & Passed (100% Pass Rate):**
  - Symbol normalization & suffix stripping: 9 tests
  - Mathematical verification ($\text{rate} \times \text{qty} \approx \text{total}$): 7 tests
  - Payload parsing (Ground truth user data, AKPL, Spring Pageable, empty lists): 12 tests
  - Holdings matching & quantity discrepancy isolation: 8 tests
  - Failure cause classification: 10 tests

### 6.2 Regression & Build Verification
- Full test runner `node tests/runAll.mjs` executed across all suites.
- Production build `npm run build` executed cleanly with 0 TypeScript/JSX compiler errors.

---

## 7. Next Step / User Action Required

Please follow the instructions in **Section 4** to capture the WACC details request from your browser's DevTools Network tab. Once you provide the URL, Method, and Payload structure, we will instantly link the backend route in `proxy/meroshare.js` and `src/services/meroShareService.js`.
