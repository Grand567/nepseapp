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
  Award
} from 'lucide-react';

export default function InvestorDecisionGuideModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('buy'); // 'buy', 'sell', 'hold', 'avoid', 'strategy'

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
              background: 'linear-gradient(135deg, #10B981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(16, 185, 129, 0.35)'
            }}>
              <BookOpen size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: '-0.02em', color: '#ffffff' }}>
                  Investor Decision Guide
                </h2>
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)'
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
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#10B981', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>1</span>
                    ट्रेंड ५० दिने औसत (50 EMA) भन्दा माथि हुनुपर्छ
                  </div>
                  <p style={{ margin: '6px 0 0 30px', color: '#94A3B8', fontSize: 12 }}>
                    ५० दिने रेखाभन्दा माथि भएको सेयरमा मात्र खरिद गर्नुहोस्। ५० EMA मुनि भएको सेयर घट्ने क्रममा हुन्छ, त्यसमा भएको सानो वृद्धि धोका (Trap) हुन सक्छ।
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#ffffff' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#10B981', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>2</span>
                    ठूला ब्रोकरले खरिद गरिरहेको हुनुपर्छ (Smart Money Flow)
                  </div>
                  <p style={{ margin: '6px 0 0 30px', color: '#94A3B8', fontSize: 12 }}>
                    Guru AI कार्डमा <strong>Top Broker Accumulator</strong> हेर्नुहोस्। यदि ब्रोकर ५८, ४५, ३४ आदिले नेट खरिद (Accumulation) गरिरहेका छन् भने मूल्य बढ्ने बलियो सम्भावना हुन्छ।
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#ffffff' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#10B981', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>3</span>
                    Screener Score ७० वा सोभन्दा माथि हुनुपर्छ
                  </div>
                  <p style={{ margin: '6px 0 0 30px', color: '#94A3B8', fontSize: 12 }}>
                    हाम्रो स्क्रिनरले भोलुम, क्यान्डल र चाल सबै हिसाब गर्छ। ७० भन्दा माथिको स्कोरले संस्थागत लगानीकर्ता सक्रिय रहेको पुष्टि गर्छ।
                  </p>
                </div>

                <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 12, padding: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: '#ffffff' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#10B981', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900 }}>4</span>
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
                  कुनै पनि सेयर खोल्दा तल <strong>Instant Buy/Sell Calculator</strong> मा <em>Risk-to-Reward Ratio</em> हेर्नुहोस्। यदि <strong>RRR ≥ 1.5 वा 2.0</strong> हरियो बत्ती छ भने मात्र किन्नुहोस्!
                </div>
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
          <div style={{ fontSize: 11, color: '#64748B' }}>
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
