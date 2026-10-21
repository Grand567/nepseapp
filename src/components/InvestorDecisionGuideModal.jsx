// src/components/InvestorDecisionGuideModal.jsx
// Simple Language Decision Playbook for NEPSE Investors
// Explains clearly: When to Buy, When to Sell, When to Hold, and What to Avoid.

import React, { useState } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  AlertTriangle,
  Target,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ChevronRight,
  BookOpen,
  DollarSign,
  Scale,
  Sparkles,
  Award,
  Activity,
  BarChart3,
  Calendar,
  ShieldAlert,
  Zap
} from 'lucide-react';

export default function InvestorDecisionGuideModal({ isOpen, onClose, initialTab = 'index' }) {
  const [activeTab, setActiveTab] = useState(initialTab || 'index');

  React.useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(8px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px'
    }}>
      <div style={{
        backgroundColor: '#0F172A',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        overflow: 'hidden',
        color: '#F8FAFC',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.95))'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(99, 102, 241, 0.35)'
            }}>
              <BookOpen size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', color: '#ffffff' }}>
                  Investor Decision Guide
                </h2>
                <span style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99, 102, 241, 0.3)'
                }}>
                  सरल लगानी नियम
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94A3B8' }}>
                How to make profitable Buy, Sell, and Hold decisions based on real evidence
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: 'none',
              borderRadius: 10,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94A3B8',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          gap: 6,
          padding: '10px 16px',
          background: 'rgba(15, 23, 42, 0.95)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          overflowX: 'auto',
          scrollbarWidth: 'none'
        }}>
          {[
            { id: 'roadmap', label: '🧭 ५-चरण संस्थागत छनोट (5-Step Roadmap)', color: '#10B981' },
            { id: 'index', label: '🎯 इन्डेक्स हेरेर निर्णय', color: '#6366F1' },
            { id: 'buy', label: '🟢 कहिले किन्ने? (Buy)', color: '#10B981' },
            { id: 'sell', label: '🔴 कहिले बेच्ने? (Sell)', color: '#F43F5E' },
            { id: 'hold', label: '🔵 कहिले होल्ड? (Hold)', color: '#38BDF8' },
            { id: 'avoid', label: '⚠️ के नकिन्ने? (Avoid)', color: '#F59E0B' },
            { id: 'strategy', label: '⚖️ 2:1 गोल्डेन नियम', color: '#A855F7' }
          ].map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '7px 14px',
                  borderRadius: 10,
                  fontSize: 12,
                  fontWeight: 800,
                  border: isActive ? `1px solid ${tab.color}` : '1px solid rgba(255, 255, 255, 0.06)',
                  background: isActive ? `${tab.color}22` : 'rgba(255, 255, 255, 0.03)',
                  color: isActive ? tab.color : '#94A3B8',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Content Body */}
        <div style={{
          padding: '20px',
          overflowY: 'auto',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          fontSize: 13,
          lineHeight: 1.6
        }}>
          {/* TAB: INSTITUTIONAL 5-STEP STOCK SELECTION ROADMAP */}
          {activeTab === 'roadmap' && (
            <>
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 95, 70, 0.15))',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: 14,
                padding: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 900, color: '#34d399', fontSize: 15 }}>
                  <Sparkles size={20} />
                  संस्थागत ५-चरण सेयर छनोट कार्यविधि (Institutional 5-Step Selection Pipeline)
                </div>
                <p style={{ margin: '8px 0 0', color: '#cbd5e1', fontSize: 12.5, lineHeight: 1.5 }}>
                  नेप्सेमा बिना योजना किन्दा ठूलो घाटा (Tail Risk) हुन्छ। Drabyashree NEPSE को यो ५-चरण गणितीय पाइपलाइनले मात्र बजारका उत्कृष्ट ५% सेयर छनोट गर्छ र पुँजीको सुरक्षा गर्छ।
                </p>
              </div>

              {/* STEP 1 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#38bdf8', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Activity size={17} color="#38bdf8" />
                  चरण १: समष्टिगत तरलता तथा बजार अवस्था (Top-Down Macro & Liquidity Regime)
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                  नेपाल राष्ट्र बैंकको मौद्रिक सूचक र तरलता हेरेर मात्र पुँजी बाँडफाँड गर्नुहोस्:
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    <li><strong>🟢 Bullish / Easing (IBOR &le; 4.50%, CD Ratio &le; 83%):</strong> कुल पुँजीको <strong>८०%–१००%</strong> सम्म सेयरमा लगानी गर्नुहोस्।</li>
                    <li><strong>🟡 Neutral (IBOR 4.5%–6.0%, CD Ratio 83%–86%):</strong> बढीमा <strong>५०%–६०%</strong> मात्र लगानी गर्नुहोस्। कमजोर सेयर नकिन्नुहोस्।</li>
                    <li><strong>🔴 Tightening (IBOR &gt; 6.0% वा CD Ratio &gt; 87%):</strong> बढीमा <strong>२५%</strong> लगानी, ७५% नगद (Cash) सुरक्षित राख्नुहोस्।</li>
                    <li><strong>इन्डेक्स पुष्टि:</strong> Advance/Decline अनुपात <strong>&gt; 1.15</strong> र नेप्से २०-EMA भन्दा माथि हुनु अनिवार्य छ।</li>
                  </ul>
                </div>
              </div>

              {/* STEP 2 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#a78bfa', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={17} color="#a78bfa" />
                  चरण २: प्राविधिक मोमेन्टम तथा स्टेज २ फिल्टर (Minervini Stage 2 & Accumulation)
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                  म्युचुअल फण्ड र ऋणपत्र बाहेकका २५०+ साधारण सेयरलाई मिनर्विनी ट्रेन्ड टेम्प्लेटमा जाँच्नुहोस्:
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    <li><strong>ट्रेन्ड टेम्प्लेट:</strong> LTP &gt; 20-EMA &gt; 50-EMA &gt; 200-SMA, र मूल्य ५२-हप्ताको उच्चतम बिन्दुको १५% भित्र र न्यून बिन्दुको ३०% माथि।</li>
                    <li><strong>RSI दायरा:</strong> Wilder RSI(14) strictly <strong>५२ देखि ६८</strong> भित्र (बलियो गति तर Overbought नभएको)।</li>
                    <li><strong>वाइकोफ एक्युमुलेसन:</strong> Stealth Accumulation (Top 5 खुद खरिद BCR5 &ge; १८%, SCR3 &lt; १४%) भएका सेयर मात्र छनोट।</li>
                  </ul>
                </div>
              </div>

              {/* STEP 3 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#34d399', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BarChart3 size={17} color="#34d399" />
                  चरण ३: फ्लोरशिट स्मार्ट मनी पदचिन्ह (Floorsheet Smart Money & 5D POC)
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                  ब्रोकर फ्लो र टिक-लेभल फ्लोरशिटको भोल्युम प्रोफाइल विश्लेषण गर्नुहोस्:
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    <li><strong>ब्रोकर एकाग्रता (BCR3 &ge; ४०%):</strong> मुख्य ३ ब्रोकरले कम्तिमा ४०% सेयर एक्लै खरिद गरेको पुष्टि गर्नुहोस्।</li>
                    <li><strong>बिक्रेता दबाब निषेध:</strong> Top 3 खुद बिक्रेताको हिस्सा SCR3 &lt; १४% र आन्तरिक क्रस (Self-Wash) &lt; ५% हुनुपर्छ।</li>
                    <li><strong>५-दिने POC (Point of Control) पर्खाल:</strong> सेयरको बजार मूल्य पछिल्लो ५ दिनको सर्वाधिक कारोबार भएको मूल्य (5D POC) र संस्थागत VWAP भन्दा माथि अडिएको हुनुपर्छ।</li>
                  </ul>
                </div>
              </div>

              {/* STEP 4 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fb7185', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldAlert size={17} color="#fb7185" />
                  चरण ४: ४ वटा कडा नियमन तथा वित्तीय भिटो (Mandatory Hard Veto Gates)
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                  कुनै पनि एउटा भिटो लागेमा उक्त सेयर जतिसुकै राम्रो भए पनि तत्काल त्याग गर्नुहोस्:
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    <li><strong>🚨 संस्थापक लक-इन भिटो:</strong> ३ वर्षे लक-इन खुल्न <strong>१२० दिनभन्दा कम</strong> बाँकी भएमा सिधै अस्वीकार।</li>
                    <li><strong>🚨 बैंक तथा वित्तीय संस्था भिटो:</strong> खराब कर्जा NPL &ge; ५.०% वा पुँजी पर्याप्तता अनुपात CAR &lt; ११.०% भएमा अस्वीकार।</li>
                    <li><strong>🚨 जलविद्युत लागत भिटो:</strong> निर्माण लागत <strong>रु. २० करोड प्रति मेगावाट</strong> भन्दा बढी वा व्यापारिक उत्पादन (COD) ढिलाइ भएमा अस्वीकार।</li>
                    <li><strong>🚨 ग्राहम भ्यालुएसन:</strong> १२ महिनाको खुद प्रतिसेयर आम्दानी (EPS) धनात्मक हुनु अनिवार्य छ।</li>
                  </ul>
                </div>
              </div>

              {/* STEP 5 */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fbbf24', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Target size={17} color="#fbbf24" />
                  चरण ५: खरिद कार्यान्वयन, हाफ-केली साइजिङ र नाफा सुरक्षित (Execution, Half-Kelly & Ratchet Shield)
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                  अनुशासित गणितीय नियम अनुसार मात्र खरिद अर्डर राख्नुहोस्:
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    <li><strong>T+1 VWAP खरिद दायरा:</strong> अघिल्लो दिनको सिफारिसलाई भोलिपल्टको औसत मूल्य (Day T+1 VWAP) र 5D POC दायराभित्र मात्र किन्नुहोस्। +१४.९% सर्किट पासोमा कहिल्यै नदौडिनुहोस्।</li>
                    <li><strong>हाफ-केली कित्ता साइजिङ:</strong> कुल पोर्टफोलियोको <strong>बढीमा १.०% मात्र जोखिम (1% Portfolio Risk Ceiling)</strong> लिनुहोस्। StopLoss &ge; Entry भएमा कित्ता ० हुन्छ।</li>
                    <li><strong>T+2 राचेट शिल्ड (Ratchet Shield):</strong> T+2 राफसाफपछि नाफा +१.२R पुग्नासाथ स्टप-लस बढाएर Entry &times; १.०१२ मा सार्नुहोस् जसले गर्दा ब्रोकर कमिसन र ७.५% पुँजीगत लाभकर कटाएर पनि नाफा पूर्ण सुरक्षित हुन्छ।</li>
                    <li><strong>५०% नाफा बुक:</strong> पहिलो टार्गेट (+२.०R, दैनिक &plusmn;१५% सर्किट सीमा) मा ५०% सेयर बेच्नुहोस् र बाँकी ५०% सेयर २०-EMA को रेखामा पछ्याउँदै नाफा बढ्न दिनुहोस्।</li>
                  </ul>
                </div>
              </div>
            </>
          )}

          {/* TAB 0: HOW TO INVEST USING NEPSE INDEX PREDICTION */}
          {activeTab === 'index' && (
            <>
              <div style={{
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.25)',
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#818cf8', fontSize: 14 }}>
                  <Target size={18} />
                  नेप्से इन्डेक्सको भविष्यवाणी हेरेर लगानी गर्ने सही तरिका
                </div>
                <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: 12 }}>
                  नेप्सेमा ७५% सेयर समग्र बजार (Index) को दिशामै हिँड्छन्। व्यक्तिगत सेयर किन्नुअघि सधैं इन्डेक्सको अवस्था हेर्नुहोस्:
                </p>
              </div>

              {/* 1. Market Regime & Capital Allocation */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Activity size={16} color="#818cf8" />
                  १. बजारको अवस्था (Market Regime) अनुसार पुँजी व्यवस्थापन
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
                  {/* Regime A: Bullish Expansion */}
                  <div style={{ padding: 10, borderRadius: 8, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: '#34d399' }}>🟢 Bullish Expansion (५० EMA माथि र हरियो बजार)</span>
                      <span style={{ fontSize: 12, padding: '1px 6px', borderRadius: 6, background: '#10b981', color: '#000', fontWeight: 800 }}>७०-८०% लगानी</span>
                    </div>
                    <div style={{ color: '#cbd5e1', lineHeight: 1.5 }}>
                      <strong>निर्णय: आक्रामक खरिद (Aggressive Buy).</strong> बजार बलियो अपट्रेन्डमा छ। २० वा २१ EMA मा आउने सानो गिरावट (Pullback) मा बजारका अगुवा सेक्टर (Banking/Hydro) का ७० भन्दा माथि स्कोर भएका सेयर ढुक्कसँग किन्नुहोस् र Target 1 र Target 2 सम्म नाफा बढ्न दिनुहोस्।
                    </div>
                  </div>

                  {/* Regime B: Counter-Trend Bounce */}
                  <div style={{ padding: 10, borderRadius: 8, background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: '#fbbf24' }}>🟡 Counter-Trend Bounce (५० EMA मुनि १ दिनको उकालो)</span>
                      <span style={{ fontSize: 12, padding: '1px 6px', borderRadius: 6, background: '#f59e0b', color: '#000', fontWeight: 800 }}>६०-७०% नगद</span>
                    </div>
                    <div style={{ color: '#cbd5e1', lineHeight: 1.5 }}>
                      <strong>निर्णय: नयाँ खरिद नगर्नुहोस्, नाफा सुरक्षित गर्नुहोस् (Cautious / Exit Weak Stocks).</strong> जब इन्डेक्स ५० EMA भन्दा तल हुन्छ, बजार आधारभूत रूपमा घट्दो (Bearish) हुन्छ। १ दिन बजार हरियो हुनु 'ब्रेकआउट' होइन, 'पासो' (Bull Trap) हुन सक्छ। यो हरियो बजारलाई फसेका कमजोर सेयर बेचेर बाहिरिन (Exit) प्रयोग गर्नुहोस्।
                    </div>
                  </div>

                  {/* Regime C: Bearish Retracement */}
                  <div style={{ padding: 10, borderRadius: 8, background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.25)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontWeight: 800, color: '#fb7185' }}>🔴 Bearish Retracement (५० र २०० EMA मुनि गिरावट)</span>
                      <span style={{ fontSize: 12, padding: '1px 6px', borderRadius: 6, background: '#f43f5e', color: '#fff', fontWeight: 800 }}>८०-९०% नगद</span>
                    </div>
                    <div style={{ color: '#cbd5e1', lineHeight: 1.5 }}>
                      <strong>निर्णय: पुँजी सुरक्षा (Capital Preservation / Cash is King).</strong> "धेरै सस्तो भयो" भनेर कहिल्यै खसिरहेको चक्कु नसमात्नुहोस् (Never catch a falling knife)। बजार ५० EMA माथि नफर्किएसम्म आफ्नो पैसा सुरक्षित राख्नुहोस् वा छोटो अवधिको मुद्दती/म्युचुअल फन्डमा राख्नुहोस्।
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. How to Use Target 1, Target 2 & Stop Floor */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Target size={16} color="#818cf8" />
                  २. इन्डेक्सको Target 1, Target 2 र Stop Floor कसरी प्रयोग गर्ने?
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: '#cbd5e1' }}>
                  <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                    <strong style={{ color: '#38bdf8' }}>• Target 1 (पहिलो कडा अवरोध / ५० EMA):</strong> इन्डेक्स Target 1 नजिक पुगेपछि नयाँ खरिद रोक्नुहोस्। त्यहाँ बजार ठोक्किएर तल फर्किन सक्ने भएकाले कम्तिमा ५०% सेयरको नाफा सुरक्षित गर्नुहोस्।
                  </div>
                  <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                    <strong style={{ color: '#34d399' }}>• Target 2 (ट्रेन्ड विस्तार):</strong> यदि इन्डेक्सले Target 1 लाई ठूलो कारोबार (Turnover &gt; 1.2x) सहित काटेर दिनभरि माथि स्थिर रह्यो भने मात्र बजार Target 2 तर्फ लम्किन्छ। त्यसपछि मात्र थप सेयर खरिद गर्नुहोस्।
                  </div>
                  <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)' }}>
                    <strong style={{ color: '#f43f5e' }}>• Stop Floor (अन्तिम रक्षा रेखा):</strong> यदि इन्डेक्स Stop Floor भन्दा तल झर्छ भने, बजारमा ठूलो पहिरो जाने चेतावनी हो। आफ्ना सबै स्विङ वा अल्पकालीन सेयर तत्काल बेचेर घाटा रोक्नुहोस्।
                  </div>
                </div>
              </div>

              {/* 3. Turnover & Sector Breadth */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BarChart3 size={16} color="#818cf8" />
                  ३. टर्नओभर र सेक्टर ब्रोड्थको नियम (Volume & Sector Law)
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: '#cbd5e1' }}>
                  <div>
                    <strong style={{ color: '#fbbf24' }}>• टर्नओभर अनुपात (Turnover ≥ 1.2x):</strong> २० दिने औषत भन्दा बढी कारोबार सहित बजार बढेमा मात्र 'स्मार्ट मनी' (संस्थागत लगानीकर्ता) भित्रिएको पुष्टि हुन्छ। कम भोल्युममा बढेको बजारमा नफस्नुहोस्।
                  </div>
                  <div>
                    <strong style={{ color: '#60a5fa' }}>• मुख्य सेक्टर (कमर्सियल बैंक ३२% र हाइड्रो २०%):</strong> नेप्सेको ५२% भार यी दुई सेक्टरमा छ। बैंक वा हाइड्रो रातो भएको दिन अन्य साना सेक्टर (होटेल, म्यानुफ्याक्चरिङ) बढे पनि समग्र इन्डेक्स टिक्न सक्दैन।
                  </div>
                </div>
              </div>

              {/* 4. Nepal Fiscal Cycle Strategy */}
              <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={16} color="#818cf8" />
                  ४. नेपालको मौसमी तरलता चक्र अनुसार लगानी (Fiscal Cycle Timing)
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12, color: '#cbd5e1' }}>
                  <div>
                    <strong style={{ color: '#34d399' }}>• असार-साउन (बजेट खर्च लहर):</strong> सरकारले विकास बजेट निकासा गर्दा बैंकहरूमा अर्बौं रूपैयाँ थपिन्छ। ब्याजदर घट्ने र तरलता उर्लिने भएकाले यो समय नेप्सेमा आक्रामक लगानी गरी ठूलो नाफा लिने समय हो।
                  </div>
                  <div>
                    <strong style={{ color: '#f43f5e' }}>• पुस-माघ (अग्रिम कर खिचावट):</strong> कम्पनीहरूले ४०% अग्रिम कर तिर्दा बैंक प्रणालीबाट रु. ४०-६० अर्ब सरकारी खातामा जान्छ। बजारमा पैसा सुक्ने भएकाले मंसिरको अन्त्यमै नाफा बुक गरेर सुरक्षित हुनुपर्छ।
                  </div>
                  <div>
                    <strong style={{ color: '#fbbf24' }}>• भदौ-असोज (दशैं-तिहार खर्च चक्र):</strong> चाडपर्वका कारण बैंकबाट नगद बाहिरिने हुँदा कारोबार सुस्त हुन्छ। यो बेला ब्रेकआउट खेल्दा फसिने सम्भावना धेरै हुन्छ।
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 1: WHEN TO BUY */}
          {activeTab === 'buy' && (
            <>
              <div style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#34d399', fontSize: 14 }}>
                  <CheckCircle2 size={18} />
                  ४ वटा कुरा मिल्दा मात्र सेयर किन्नुहोस् (The 4 Buy Rules)
                </div>
                <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: 12 }}>
                  हल्ला वा फेसबुकको भरमा कहिल्यै नकिन्नुहोस्। एपमा यी ४ वटा प्रमाण हरियो भए मात्र किन्नुहोस्:
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#ffffff' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#10B981', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>1</span>
                    ट्रेंड ५० दिने औसत (50 EMA) भन्दा माथि हुनुपर्छ
                  </div>
                  <p style={{ margin: '6px 0 0 30px', color: '#94A3B8', fontSize: 12 }}>
                    ५० दिने रेखाभन्दा माथि भएको सेयरमा मात्र खरिद गर्नुहोस्। ५० EMA मुनि भएको सेयर घट्ने क्रममा हुन्छ, त्यसमा भएको सानो वृद्धि धोका (Trap) हुन सक्छ।
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#ffffff' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#10B981', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>2</span>
                    ठूला ब्रोकरले खरिद गरिरहेको हुनुपर्छ (Smart Money Flow)
                  </div>
                  <p style={{ margin: '6px 0 0 30px', color: '#94A3B8', fontSize: 12 }}>
                    Guru AI कार्डमा <strong>Top Broker Accumulator</strong> हेर्नुहोस्। यदि ब्रोकर ५८, ४५, ३४ आदिले नेट खरिद (Accumulation) गरिरहेका छन् भने मूल्य बढ्ने बलियो सम्भावना हुन्छ।
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#ffffff' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#10B981', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>3</span>
                    Screener Score ७० वा सोभन्दा माथि हुनुपर्छ
                  </div>
                  <p style={{ margin: '6px 0 0 30px', color: '#94A3B8', fontSize: 12 }}>
                    हाम्रो स्क्रिनरले भोलुम, क्यान्डल र चाल सबै हिसाब गर्छ। ७० भन्दा माथिको स्कोरले संस्थागत लगानीकर्ता सक्रिय रहेको पुष्टि गर्छ।
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#ffffff' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#10B981', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>4</span>
                    नाफाको सम्भावना घाटाभन्दा दोब्बर हुनुपर्छ (RRR ≥ 2.0)
                  </div>
                  <p style={{ margin: '6px 0 0 30px', color: '#94A3B8', fontSize: 12 }}>
                    यदि गुम्ने जोखिम रु. १५ छ भने, पहिलो टार्गेट कम्तिमा रु. ३० माथिको हुनुपर्छ। यसो गर्दा आधा ट्रेड मात्र सफल भए पनि तपाईं समग्रमा नाफामै रहनुहुनेछ।
                  </p>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: WHEN TO SELL */}
          {activeTab === 'sell' && (
            <>
              <div style={{
                background: 'rgba(244, 63, 94, 0.08)',
                border: '1px solid rgba(244, 63, 94, 0.25)',
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#fb7185', fontSize: 14 }}>
                  <AlertTriangle size={18} />
                  कहिले नाफा बुक गर्ने र कहिले घाटा काट्ने? (When to Exit)
                </div>
                <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: 12 }}>
                  लगानीमा सबैभन्दा धेरै पैसा गुम्ने कारण भनेको समयमै नबेच्नु हो। यी ३ अवस्थामा तुरुन्त बेच्नुहोस्:
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#34d399' }}>
                    🎯 नियम १: पहिलो टार्गेट (Target 1) मा आधा नाफा बुक गर्नुहोस्
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 12 }}>
                    सेयर Target 1 मा पुगेपछि ५०% सेयर बेचेर नाफा सुरक्षित गर्नुहोस्। बाँकी ५०% सेयरको Stop-Loss लाई बढाएर आफूले किनेको मूल्य (Entry Price) मा सार्नुहोस् — यसो गर्दा अब त्यो ट्रेडमा १ रुपैयाँ पनि घाटा हुँदैन!
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#f43f5e' }}>
                    🛑 नियम २: स्टप-लस (Stop Loss) छुने बित्तिकै बिना संकोच बेच्नुहोस्
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 12 }}>
                    यदि मूल्य एपले तोकेको Stop-Loss भन्दा तल गयो भने "फेरि बढ्ला कि" भनेर आश नगर्नुहोस्। ५% को सानो घाटा स्वीकार्न नसक्दा लगानीकर्ता ३०-४०% को ठूलो खाडलमा फस्छन्।
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#f59e0b' }}>
                    ⚠️ नियम ३: जब Guru AI ले "EXIT ZONE" देखाउँछ
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 12 }}>
                    यदि एपमा <strong>🟡 EXIT ZONE (TAKE PROFIT / DISTRIBUTION)</strong> वा <em>"Heavy Broker Distribution"</em> देखियो भने, ठूला ब्रोकरले सर्वसाधारणलाई सेयर भिराएर निस्किरहेका छन्। तुरुन्त बाहिरिनुहोस्।
                  </p>
                </div>
              </div>
            </>
          )}

          {/* TAB 3: WHEN TO HOLD */}
          {activeTab === 'hold' && (
            <>
              <div style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#38bdf8', fontSize: 14 }}>
                  <ShieldCheck size={18} />
                  कहिले सेयर च्यापेर बस्ने? (When to Hold)
                </div>
                <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: 12 }}>
                  नाफा दिइरहेको राम्रो सेयरलाई धेरै छिटो बेच्नु पनि गल्ती हो। यी अवस्थामा शान्त भएर होल्ड गर्नुहोस्:
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 800, color: '#38bdf8' }}>
                    १. मूल्य २० दिने र ५० दिने औसत (EMA) भन्दा माथि रहिरहँदासम्म
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 12 }}>
                    बजारमा दैनिक उतार-चढाव आइरहन्छ। जबसम्म मूल्य २० EMA भन्दा माथि छ, आत्तिनु पर्दैन। यो सामान्य आराम (Healthy Pullback) मात्र हो।
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 800, color: '#38bdf8' }}>
                    २. ब्रोकरको बिक्री चाप नदेखिँदासम्म (No Distribution)
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 12 }}>
                    जबसम्म ठूला ब्रोकरले बिक्री सुरु गरेका छैनन् र स्मार्ट मनी अझै भित्रै छ, सेयर होल्ड गर्नुहोस् र नाफालाई थप बढ्न दिनुहोस् (Let Profits Run).
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 800, color: '#38bdf8' }}>
                    ३. Trailing Stop-Loss को प्रयोग गर्नुहोस्
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 12 }}>
                    मूल्य जति जति माथि जान्छ, आफ्नो Stop-Loss पनि त्यति नै माथि सार्दै जानुहोस्। यसो गर्दा अचानक बजार खसे पनि तपाईंको नाफा शतप्रतिशत सुरक्षित रहन्छ।
                  </p>
                </div>
              </div>
            </>
          )}

          {/* TAB 4: WHAT TO AVOID */}
          {activeTab === 'avoid' && (
            <>
              <div style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#fbbf24', fontSize: 14 }}>
                  <XCircle size={18} />
                  यी सेयरमा भुलेर पनि हात नहाल्नुहोस् (Strictly Avoid)
                </div>
                <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: 12 }}>
                  नेप्सेमा अधिकांश साना लगानीकर्ता यी ३ वटा पासो (Traps) मा परेर डुब्छन्:
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 800, color: '#fbbf24' }}>
                    🚫 १. "COUNTER-TREND BOUNCE" लेखिएको सेयर
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 12 }}>
                    यदि कुनै सेयर आज +२% वा +३% बढेको छ तर त्यो ५० EMA भन्दा मुनि छ भने, त्यो ब्रेकआउट होइन। त्यो त फसेका पुराना लगानीकर्ताले बेच्नका लागि आएको क्षणिक उकालो मात्र हो।
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 800, color: '#fbbf24' }}>
                    ❄️ २. हिउँदको सुख्खायाममा हाइड्रोपावर (Hydro Winter Trap)
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 12 }}>
                    मंसिरदेखि फागुनसम्म नदीमा पानी घट्दा हाइड्रो कम्पनीको उत्पादन ७०% सम्म घट्छ। यो बेला आउने वृद्धि विशुद्ध हल्ला र कर्नरिङ मात्र हो। यसमा फस्नु निकै जोखिमपूर्ण हुन्छ।
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontWeight: 800, color: '#fbbf24' }}>
                    🎯 ३. लामो टुप्पो भएको क्यान्डल (Shooting Star / Upper Wick)
                  </div>
                  <p style={{ margin: '6px 0 0', color: '#94A3B8', fontSize: 12 }}>
                    यदि क्यान्डलको माथिल्लो धागो (Wick) कुल साइजको ४०% भन्दा लामो छ भने, खरीदकर्ता हारेर बिक्रेता हावी भएको प्रमाण हो। अर्को दिन मूल्य खस्ने सम्भावना धेरै हुन्छ।
                  </p>
                </div>
              </div>
            </>
          )}

          {/* TAB 5: 2:1 GOLDEN RULE */}
          {activeTab === 'strategy' && (
            <>
              <div style={{
                background: 'rgba(168, 85, 247, 0.08)',
                border: '1px solid rgba(168, 85, 247, 0.25)',
                borderRadius: 14,
                padding: '14px 16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, color: '#c084fc', fontSize: 14 }}>
                  <Scale size={18} />
                  नाफा कमाउने २:१ गोल्डेन नियम (The 2:1 Math of Profit)
                </div>
                <p style={{ margin: '6px 0 0', color: '#cbd5e1', fontSize: 12 }}>
                  कुनै पनि प्रोफेसनल ट्रेडरले १००% सहि अनुमान गर्न सक्दैन। तर यो गणितीय नियम प्रयोग गरेर उनीहरू सधैं नाफामै रहन्छन्:
                </p>
              </div>

              <div style={{ background: '#0B0E14', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#38bdf8', marginBottom: 8 }}>
                  📊 गणित कसरी काम गर्छ? (How the Math Works)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12, color: '#cbd5e1' }}>
                  <div style={{ background: 'rgba(244, 63, 94, 0.1)', padding: 10, borderRadius: 8, border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                    <div style={{ color: '#fb7185', fontWeight: 800 }}>अधिकतम जोखिम (Risk)</div>
                    <div>प्रत्येक ट्रेडमा: <strong>-रु. १०</strong></div>
                  </div>
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: 10, borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <div style={{ color: '#34d399', fontWeight: 800 }}>टार्गेट नाफा (Reward)</div>
                    <div>प्रत्येक ट्रेडमा: <strong>+रु. २०</strong></div>
                  </div>
                </div>

                <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: 'rgba(255, 255, 255, 0.03)', fontSize: 12, color: '#94a3b8' }}>
                  मानौं तपाईंले १० वटा ट्रेड गर्नुभयो र तपाईं ५ वटामा मात्र सफल हुनुभयो (५०% जित):
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#f8fafc' }}>
                    <li>५ वटा जित × रु. २० नाफा = <strong>+रु. १०० नाफा</strong></li>
                    <li>५ वटा हार × रु. १० घाटा = <strong>-रु. ५० घाटा</strong></li>
                    <li style={{ color: '#34d399', fontWeight: 900, marginTop: 4 }}>
                      कुल खुद नाफा = +रु. ५० (आधा ट्रेड बिग्रिँदा पनि तपाईं फाइदामै!)
                    </li>
                  </ul>
                </div>
              </div>

              <div style={{ background: 'rgba(56, 117, 246, 0.08)', border: '1px solid rgba(56, 117, 246, 0.25)', borderRadius: 12, padding: 14 }}>
                <div style={{ fontWeight: 800, color: '#60a5fa', marginBottom: 4 }}>
                  💡 एपमा कहाँ हेर्ने?
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                  कुनै पनि सेयर खोल्दा तल <strong>Instant Buy/Sell Calculator</strong> वा <strong>⚡ 1–2W Profit Plan</strong> मा <em>Risk-to-Reward Ratio</em> हेर्नुहोस्। यदि <strong>RRR ≥ 2.0</strong> हरियो बत्ती छ भने मात्र किन्नुहोस्!
                </div>
                <button
                  onClick={() => {
                    onClose();
                    window.dispatchEvent(new CustomEvent('switch_predictor_tab', { detail: { tab: 'short_term_plan' } }));
                  }}
                  style={{
                    marginTop: 10,
                    width: '100%',
                    padding: '9px 14px',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                    color: '#000',
                    fontWeight: 900,
                    fontSize: 12,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Zap size={14} />
                  <span>⚡ १–२ हप्ताको नाफा योजना खोल्नुहोस् (Open 1–2W Profit Planner) →</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(15, 23, 42, 0.98)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: 12, color: '#64748B' }}>
            Drabyashree-NEPSE · Institutional Evidence Engine
          </div>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              borderRadius: 10,
              background: '#10B981',
              color: '#000',
              fontWeight: 800,
              fontSize: 12,
              border: 'none',
              cursor: 'pointer',
              transition: 'opacity 0.2s'
            }}
          >
            बुझें, बन्द गर्नुहोस् (Got it)
          </button>
        </div>
      </div>
    </div>
  );
}
