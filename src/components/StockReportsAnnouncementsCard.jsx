import React, { useState } from 'react';
import { FileText, ExternalLink, Calendar, Bell, Newspaper, ChevronRight } from 'lucide-react';

export default function StockReportsAnnouncementsCard({ symbol = '', companyName = '', sector = '' }) {
  const [activeTab, setActiveTab] = useState('reports'); // 'reports' | 'news' | 'announcements'
  const sym = (symbol || 'STOCK').toUpperCase();
  const displayName = companyName || sym;
  const isHydro = String(sector || '').toLowerCase().includes('hydro');
  const isBank = String(sector || '').toLowerCase().includes('bank') || String(sector || '').toLowerCase().includes('finance');

  // Financial Reports grouped by fiscal year (Share Hub Reference frame_046.jpg)
  const reportYears = [
    {
      fiscalYear: '2082/2083 (2025/2026)',
      reports: [
        { title: `Third Quarter Report of ${sym} For FY 2082/83. 2025/2026`, date: '2026-05-09', type: 'Q3' },
        { title: `Second Quarter Report of ${sym} For FY 2082/83. 2025/2026`, date: '2026-02-02', type: 'Q2' },
        { title: `First Quarter Report of ${sym} For FY 2082/83. 2025/2026`, date: '2025-11-08', type: 'Q1' }
      ]
    },
    {
      fiscalYear: '2081/2082 (2024/2025)',
      reports: [
        { title: `Fourth Quarter Report of ${sym} For FY 2081/82. 2024/2025`, date: '2025-08-12', type: 'Q4' },
        { title: `Second Quarter Report of ${sym} For FY 2081/82. 2024/2025`, date: '2025-02-04', type: 'Q2' },
        { title: `First Quarter Report of ${sym} For FY 2081/82. 2024/2025`, date: '2024-11-10', type: 'Q1' }
      ]
    },
    {
      fiscalYear: '2080/2081 (2023/2024)',
      reports: [
        { title: `Fourth Quarter Report of ${sym} For FY 2080/81. 2023/2024`, date: '2024-08-15', type: 'Q4' },
        { title: `Third Quarter Report of ${sym} For FY 2080/81. 2023/2024`, date: '2024-05-05', type: 'Q3' },
        { title: `Second Quarter Report of ${sym} For FY 2080/81. 2023/2024`, date: '2024-02-12', type: 'Q2' },
        { title: `First Quarter Report of ${sym} For FY 2080/81. 2023/2024`, date: '2023-11-10', type: 'Q1' }
      ]
    },
    {
      fiscalYear: '2079/2080 (2022/2023)',
      reports: [
        { title: `Annual Report of ${sym} For FY 2079/80. 2022/2023`, date: '2023-09-20', type: 'Annual' },
        { title: `Fourth Quarter Report of ${sym} For FY 2079/80. 2022/2023`, date: '2023-08-14', type: 'Q4' }
      ]
    }
  ];

  // Company News (Share Hub Reference frame_050.jpg)
  const companyNews = [
    {
      titleNp: isHydro
        ? `${displayName} (${sym}) को वित्तीय विवरण सार्वजनिक, विद्युत बिक्री आम्दानी र प्रमुख सूचक कस्ता छन् ?`
        : isBank
          ? `${displayName} (${sym}) को खुद ब्याज आम्दानी र वितरणयोग्य मुनाफामा सुधार, इपीएस कति ?`
          : `${displayName} (${sym}) को त्रैमासिक वित्तीय विवरण सार्वजनिक, प्रमुख सूचक कस्ता छन् ?`,
      titleEn: `${displayName} (${sym}) publishes latest quarterly financial highlights; key operating ratios & EPS trajectory analyzed.`,
      date: '09 May 2026, Saturday',
      source: 'NEPALI PAISA / MEROLAGANI',
      tag: 'Quarterly Earnings'
    },
    {
      titleNp: `${displayName} ले प्रकाशन गर्यो दोस्रो त्रैमासिक प्रतिवेदन, खुद नाफा र प्रतिसेयर आम्दानी कति ?`,
      titleEn: `${displayName} releases Q2 unaudited financial statement with updated Book Value and Return on Equity.`,
      date: '04 February 2026, Wednesday',
      source: 'SHARESANSAR',
      tag: 'Financial Report'
    },
    {
      titleNp: `${sym} को साधारण सभा तथा लाभांश/पुँजी योजना सम्बन्धी विशेष अद्यावधिक विवरण`,
      titleEn: `${displayName} corporate governance & capital adequacy update for shareholders and institutional investors.`,
      date: '10 November 2025, Tuesday',
      source: 'BIZMANDU',
      tag: 'Corporate Update'
    }
  ];

  // Announcements / Corporate Disclosures (Share Hub Reference frame_051.jpg)
  const announcements = [
    {
      title: `${displayName} has published its provisional financial statement from the Third quarter of the fiscal year 2082/83.`,
      date: '2026-05-09',
      category: 'Financial Disclosure'
    },
    {
      title: `${displayName} has published its provisional financial statement from the Fourth quarter of the fiscal year 2081/82.`,
      date: '2025-08-12',
      category: 'Financial Disclosure'
    },
    {
      title: `${displayName} has published its provisional financial statement from the second quarter of the fiscal year 2081/82.`,
      date: '2025-02-04',
      category: 'Financial Disclosure'
    },
    {
      title: `${displayName} has published its provisional financial statement from the First quarter of the fiscal year 2081/82.`,
      date: '2024-11-10',
      category: 'Financial Disclosure'
    },
    {
      title: `${displayName} has deposited bonus/right shares directly to the demat account of its shareholders and urged dematerialization.`,
      date: '2024-02-25',
      category: 'Corporate Action'
    },
    {
      title: `${displayName} has listed its additional securities in NEPSE for secondary market trading.`,
      date: '2024-02-23',
      category: 'NEPSE Listing'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Sub tabs: Financial Reports | Company News | Announcements (Share Hub frame_046 - frame_051) */}
      <div style={{
        background: '#111827',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 14,
        padding: '6px',
        display: 'flex',
        gap: 6,
        overflowX: 'auto'
      }}>
        {[
          { id: 'reports', label: 'Financial Reports' },
          { id: 'news', label: 'Company News' },
          { id: 'announcements', label: 'Announcements' }
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1,
              whiteSpace: 'nowrap',
              padding: '9px 12px',
              borderRadius: 10,
              border: 'none',
              fontSize: 12.5,
              fontWeight: 800,
              cursor: 'pointer',
              background: activeTab === t.id ? '#0f766e' : 'transparent',
              color: activeTab === t.id ? '#ffffff' : '#94a3b8',
              transition: 'all 0.15s ease'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Reports View (frame_046.jpg) */}
      {activeTab === 'reports' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reportYears.map((yr, idx) => (
            <div key={idx}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 10
              }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                <span style={{ fontSize: 12.5, fontWeight: 900, color: '#cbd5e1', letterSpacing: '0.04em' }}>
                  {yr.fiscalYear.split(' ')[0]}
                </span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {yr.reports.map((r, rIdx) => (
                  <div
                    key={rIdx}
                    style={{
                      background: '#111827',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: 12,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      cursor: 'pointer',
                      transition: 'border-color 0.15s ease'
                    }}
                    onClick={() => {
                      window.open(`https://nepalstock.com.np/company/detail/${sym}`, '_blank');
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: 8,
                        background: 'rgba(56, 189, 248, 0.12)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <FileText style={{ width: 16, height: 16, color: '#38bdf8' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#ffffff', lineHeight: 1.4 }}>
                          {r.title}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 3 }}>
                          📅 {r.date}
                        </div>
                      </div>
                    </div>

                    <ExternalLink style={{ width: 16, height: 16, color: '#94a3b8', flexShrink: 0 }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Company News View (frame_050.jpg) */}
      {activeTab === 'news' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {companyNews.map((n, idx) => (
            <div
              key={idx}
              style={{
                background: '#111827',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                gap: 14,
                alignItems: 'flex-start'
              }}
            >
              <div style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(56,189,248,0.2))',
                border: '1px solid rgba(16,185,129,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Newspaper style={{ width: 22, height: 22, color: '#10b981' }} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                    {n.tag}
                  </span>
                  <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700 }}>
                    {n.source}
                  </span>
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 800, color: '#ffffff', lineHeight: 1.45, marginBottom: 4 }}>
                  {n.titleNp}
                </div>
                <div style={{ fontSize: 12, color: '#cbd5e1', lineHeight: 1.4, marginBottom: 6 }}>
                  {n.titleEn}
                </div>
                <div style={{ fontSize: 11, color: '#64748b' }}>
                  📅 {n.date}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Announcements View (frame_051.jpg) */}
      {activeTab === 'announcements' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {announcements.map((a, idx) => (
            <div
              key={idx}
              style={{
                background: '#111827',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start'
              }}
            >
              <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(56, 189, 248, 0.14)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                fontSize: 10,
                fontWeight: 900,
                color: '#38bdf8'
              }}>
                NEWS
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#f8fafc', lineHeight: 1.45, fontWeight: 600 }}>
                  {a.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <span style={{
                    fontSize: 11.5,
                    color: '#94a3b8',
                    fontFamily: 'var(--font-mono)'
                  }}>
                    {a.date}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: '1px 7px', borderRadius: 6,
                    background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8'
                  }}>
                    {a.category}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
