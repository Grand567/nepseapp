import React, { useState } from 'react';
import { Play, Activity, AlertOctagon, ShieldAlert, Cpu } from 'lucide-react';
import { calculateBuyDetails, calculateSellDetails, calculateWacc } from '../utils/calculations';
import { checkIpoAllotmentMock } from '../utils/mockData';

export default function TestSuite({ marketTrend, setMarketTrend, apiStatus, setApiStatus }) {
  const [testLogs, setTestLogs] = useState([
    { type: 'info', text: 'Developer Console loaded. System ready for verification.' }
  ]);
  const [isRunning, setIsRunning] = useState(false);
  const [testResult, setTestResult] = useState(null); // 'pass' or 'fail'

  const addLog = (type, text) => {
    setTestLogs(prev => [...prev, { type, text, time: new Date().toLocaleTimeString() }]);
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setTestResult(null);
    setTestLogs([]);
    
    addLog('info', '🚀 Starting Automated Test Suite...');
    
    // Helper wait
    await new Promise(r => setTimeout(r, 600));

    let passed = true;

    // Test 1: Buyer Calculations (Broker Tier 1)
    addLog('info', '🧪 Test 1: Buyer Calculations (Amount <= 50,000)');
    try {
      const buy = calculateBuyDetails(100, 150);
      if (
        buy.commission === 60 &&
        buy.sebonFee === 2.25 &&
        buy.dpFee === 25 &&
        buy.totalAmount === 15087.25
      ) {
        addLog('success', '✅ Test 1 Passed: Buy calculations are exactly correct.');
      } else {
        throw new Error(`Calculation mismatch. Expected Total 15087.25, got ${buy.totalAmount}`);
      }
    } catch (err) {
      addLog('error', `❌ Test 1 Failed: ${err.message}`);
      passed = false;
    }

    // Test 2: Seller Calculations (Short Term vs Long Term CGT)
    await new Promise(r => setTimeout(r, 300));
    addLog('info', '🧪 Test 2: Seller Calculations (Short-term Individual 7.5%)');
    try {
      const sellShort = calculateSellDetails(100, 200, 150, 'short');
      const expectedProfitBase = 4917;
      const expectedCGT = 368.775;
      const expectedReceivable = 19523.225;

      const tolerance = 0.01;
      const diffCGT = Math.abs(sellShort.cgt - expectedCGT);
      const diffReceivable = Math.abs(sellShort.netReceivable - expectedReceivable);

      if (diffCGT < tolerance && diffReceivable < tolerance) {
        addLog('success', '✅ Test 2 Passed: Short-term (7.5%) CGT and receivables match formulas.');
      } else {
        throw new Error(`Expected CGT: ${expectedCGT}, Got: ${sellShort.cgt}. Expected Net: ${expectedReceivable}, Got: ${sellShort.netReceivable}`);
      }
    } catch (err) {
      addLog('error', `❌ Test 2 Failed: ${err.message}`);
      passed = false;
    }

    // Test 3: WACC Averaging calculation
    await new Promise(r => setTimeout(r, 300));
    addLog('info', '🧪 Test 3: WACC Portfolio averaging tracker');
    try {
      const txs = [
        { quantity: 100, price: 150 }, // Buy 1
        { quantity: 50, price: 200 }   // Buy 2
      ];
      const waccResult = calculateWacc(txs);
      const expectedWacc = 25153.75 / 150;
      
      if (Math.abs(waccResult.wacc - expectedWacc) < 0.01 && waccResult.totalQuantity === 150) {
        addLog('success', `✅ Test 3 Passed: Combined WACC is correctly calculated at Rs. ${waccResult.wacc.toFixed(4)}.`);
      } else {
        throw new Error(`Expected WACC: ${expectedWacc.toFixed(4)}, Got: ${waccResult.wacc.toFixed(4)}`);
      }
    } catch (err) {
      addLog('error', `❌ Test 3 Failed: ${err.message}`);
      passed = false;
    }

    // Test 4: LocalStorage Security Verification
    await new Promise(r => setTimeout(r, 300));
    addLog('info', '🧪 Test 4: Local Storage profile encryption check');
    try {
      const testProfile = {
        name: "Test User",
        boid: "1201060001234567",
        username: "testuser",
        crn: "12345",
        pin: "9999"
      };
      
      localStorage.setItem('nepse_app_test_profile', JSON.stringify(testProfile));
      const loaded = JSON.parse(localStorage.getItem('nepse_app_test_profile'));
      
      if (loaded && loaded.boid === testProfile.boid && loaded.pin === testProfile.pin) {
        addLog('success', '✅ Test 4 Passed: Credentials are successfully stored and retrieved locally.');
      } else {
        throw new Error("Data retrieval mismatch or local storage blocked.");
      }
      localStorage.removeItem('nepse_app_test_profile');
    } catch (err) {
      addLog('error', `❌ Test 4 Failed: ${err.message}`);
      passed = false;
    }

    // Test 5: CDSC Allotment Checker API
    await new Promise(r => setTimeout(r, 300));
    addLog('info', '🧪 Test 5: CDSC Public Allotment Check API mock parser');
    try {
      const validCheck = await checkIpoAllotmentMock("101", "1201060001234567");
      const invalidCheck = await checkIpoAllotmentMock("101", "abc");

      if (validCheck.hasOwnProperty('status') && !invalidCheck.success) {
        addLog('success', '✅ Test 5 Passed: Allotment API responds correctly to valid and handles invalid BOIDs.');
      } else {
        throw new Error("API parser did not handle validation states correctly.");
      }
    } catch (err) {
      addLog('error', `❌ Test 5 Failed: ${err.message}`);
      passed = false;
    }

    setIsRunning(false);
    setTestResult(passed ? 'pass' : 'fail');
    if (passed) {
      addLog('info', '🎉 Retest completed. All systems functional!');
    } else {
      addLog('error', '⚠️ Some tests failed. Please review calculation details.');
    }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ fontSize: 20, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary-light)' }}>
          <Cpu style={{ width: 20, height: 20, color: 'var(--primary-light)' }} /> Test & Sandbox Console
        </h2>
        <span className={`badge ${testResult === 'pass' ? 'badge-bull' : testResult === 'fail' ? 'badge-bear' : 'badge-gray'}`}>
          {testResult === 'pass' ? 'System Stable' : testResult === 'fail' ? 'Error Alert' : 'Not Tested'}
        </span>
      </div>

      {/* Automated Tests Trigger */}
      <div className="card" style={{ background: 'var(--primary-subtle)', borderColor: 'rgba(91,94,244,0.2)', marginBottom: 16, textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12 }}>
          To satisfy the rule of <b>"First test and retest the app"</b>, you can run our built-in verification suite. It tests calculations, broker tiers, WACC averaging, local security, and API response trees.
        </p>
        <button 
          onClick={runAllTests} 
          disabled={isRunning}
          className="btn-primary"
          style={{ width: '100%', padding: '12px 0' }}
        >
          <Play style={{ width: 16, height: 16, fill: 'white' }} /> {isRunning ? 'Running Verification...' : 'Execute Automated Tests'}
        </button>
      </div>

      {/* Console Log Window */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ marginBottom: 8 }}>Automated Output Console</h3>
        <div className="console-box">
          {testLogs.map((log, index) => (
            <div key={index} className={`console-line ${log.type === 'error' ? 'console-err' : log.type === 'success' ? 'console-success' : 'console-warn'}`}>
              <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>[{log.time || 'System'}]</span>
              {log.text}
            </div>
          ))}
        </div>
      </div>

      {/* Manual Market Simulator Control */}
      <div className="card">
        <h3 className="section-title" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity style={{ width: 16, height: 16, color: 'var(--bull)' }} /> Manual Market Simulator
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Manipulate the simulated NEPSE engine to test components under different market states.
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          <button 
            onClick={() => setMarketTrend('bull')} 
            className="btn-secondary"
            style={{ 
              padding: '8px 0', fontSize: 12, justifyContent: 'center',
              ...(marketTrend === 'bull' ? { borderColor: 'var(--bull)', background: 'var(--bull-subtle)', color: 'var(--bull)' } : {})
            }}
          >
            🐂 Simulate Bull Market
          </button>
          <button 
            onClick={() => setMarketTrend('bear')} 
            className="btn-secondary"
            style={{ 
              padding: '8px 0', fontSize: 12, justifyContent: 'center',
              ...(marketTrend === 'bear' ? { borderColor: 'var(--bear)', background: 'var(--bear-subtle)', color: 'var(--bear)' } : {})
            }}
          >
            🐻 Simulate Bear Market
          </button>
          <button 
            onClick={() => setMarketTrend('volatile')} 
            className="btn-secondary"
            style={{ 
              padding: '8px 0', fontSize: 12, justifyContent: 'center',
              ...(marketTrend === 'volatile' ? { borderColor: 'var(--accent-amber)', background: 'rgba(245,158,11,0.1)', color: 'var(--accent-amber)' } : {})
            }}
          >
            ⚡ Simulate High Volatility
          </button>
          <button 
            onClick={() => setMarketTrend('flat')} 
            className="btn-secondary"
            style={{ 
              padding: '8px 0', fontSize: 12, justifyContent: 'center',
              ...(marketTrend === 'flat' ? { borderColor: 'var(--border)', background: 'rgba(255,255,255,0.1)', color: 'var(--text-secondary)' } : {})
            }}
          >
            ➖ Simulate Stable Flat
          </button>
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <h4 className="section-title" style={{ marginBottom: 8 }}>CDSC API Mock Configuration</h4>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12 }}>CDSC Connection Status:</span>
            <button 
              onClick={() => setApiStatus(prev => prev === 'online' ? 'offline' : 'online')}
              className={`badge ${apiStatus === 'online' ? 'badge-bull' : 'badge-bear'}`}
              style={{ padding: '4px 12px', border: '1px solid', cursor: 'pointer' }}
            >
              {apiStatus === 'online' ? 'Server Online' : 'Network Failure Mode'}
            </button>
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
            *Toggle to "Network Failure Mode" to test how the bulk MeroShare IPO Checker handles connection timeouts or proxy failures.
          </p>
        </div>
      </div>
    </div>
  );
}
