import React, { useState } from 'react';
import { ExternalLink, BookOpen, Search, ArrowRight, ShieldAlert } from 'lucide-react';

export default function Resources() {
  const [searchBroker, setSearchBroker] = useState('');
  
  // Sample brokers list (Nepal has 60+ active broker companies)
  const brokers = [
    { number: 1, name: "Kumari Securities Pvt. Ltd." },
    { number: 2, name: "Orchid Securities Limited" },
    { number: 3, name: "Elixir Securities Pvt. Ltd." },
    { number: 4, name: "Market Securities Pvt. Ltd." },
    { number: 5, name: "Opal Securities Investment Pvt. Ltd." },
    { number: 6, name: "Agrawal Securities Pvt. Ltd." },
    { number: 7, name: "JBS Securities Pvt. Ltd." },
    { number: 8, name: "Ashutosh Brokerage & Securities" },
    { number: 9, name: "J.B. Securities Pvt. Ltd." },
    { number: 10, name: "Pragyan Securities Pvt. Ltd." },
    { number: 11, name: "Sajilo Securities Pvt. Ltd." },
    { number: 12, name: "Neco Securities Pvt. Ltd." },
    { number: 13, name: "Sani Securities Company Ltd." },
    { number: 14, name: "Nepal Stock House Pvt. Ltd." },
    { number: 16, name: "Primo Securities Pvt. Ltd." },
    { number: 17, name: "J.B. Securities Pvt. Ltd." },
    { number: 18, name: "Siprabi Securities Pvt. Ltd." },
    { number: 19, name: "Imperial Securities Co. Pvt. Ltd." },
    { number: 20, name: "Jeevan Securities Pvt. Ltd." },
    { number: 21, name: "Trishakti Securities Public Ltd." },
    { number: 22, name: "Siprabi Securities Pvt. Ltd." },
    { number: 23, name: "Swarnalaxmi Securities Pvt. Ltd." },
    { number: 24, name: "Sri Hari Securities Pvt. Ltd." },
    { number: 25, name: "Swarnalaxmi Securities Pvt. Ltd." },
    { number: 26, name: "Asian Securities Pvt. Ltd." },
    { number: 28, name: "Sani Securities Company Ltd." },
    { number: 29, name: "Trishul Securities & Investment" },
    { number: 30, name: "Creative Securities Pvt. Ltd." },
    { number: 31, name: "Mohit Securities Pvt. Ltd." },
    { number: 32, name: "Premier Securities Company Ltd." },
    { number: 33, name: "Dakshinkali Investment & Securities" },
    { number: 34, name: "Imperial Securities Co. Pvt. Ltd." },
    { number: 35, name: "Creative Securities Pvt. Ltd." },
    { number: 36, name: "Divya Securities Pvt. Ltd." },
    { number: 37, name: "Swarnalaxmi Securities Pvt. Ltd." },
    { number: 38, name: "Dipshikha Dhitpatra Karobar" },
    { number: 39, name: "Sumeru Securities Pvt. Ltd." },
    { number: 40, name: "Sewa Securities Pvt. Ltd." },
    { number: 41, name: "Lin Securities Pvt. Ltd." },
    { number: 42, name: "Sani Securities (Branch)" },
    { number: 43, name: "South Asian Securities Pvt. Ltd." },
    { number: 44, name: "Dynamic Investment & Securities" },
    { number: 45, name: "Imperial Securities (Branch)" },
    { number: 46, name: "Kalika Securities Pvt. Ltd." },
    { number: 47, name: "Neev Securities Pvt. Ltd." },
    { number: 48, name: "Trishul Securities Pvt. Ltd." },
    { number: 49, name: "Online Securities Ltd." },
    { number: 50, name: "Crystal Kanchhangunga Securities" },
    { number: 51, name: "Oxford Securities Pvt. Ltd." },
    { number: 52, name: "Sunda Securities Pvt. Ltd." },
    { number: 53, name: "Secured Securities Ltd." },
    { number: 54, name: "Sewa Securities Pvt. Ltd." },
    { number: 55, name: "Bhrikuti Stock Broking Co. Ltd." },
    { number: 56, name: "Sri Hari Securities Pvt. Ltd." },
    { number: 57, name: "Aryatara Investment & Securities" },
    { number: 58, name: "Naasa Securities Co. Ltd." },
    { number: 59, name: "Geneve Securities Pvt. Ltd." },
    { number: 60, name: "ABC Securities Pvt. Ltd." }
  ];

  const filteredBrokers = brokers.filter(
    b => b.name.toLowerCase().includes(searchBroker.toLowerCase()) || 
         b.number.toString().includes(searchBroker)
  );

  const getTmsUrl = (number) => {
    return `https://tms${number}.nepse.com.np/`;
  };

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <BookOpen style={{ width: 20, height: 20 }} /> Resources & Trading Hub
      </h2>

      {/* Free Portals Grid */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ marginBottom: 12, color: 'var(--text-primary)' }}>Free Nepal Financial Portals</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
          <a href="https://meroshare.cdsc.com.np/" target="_blank" rel="noreferrer" className="card-sm clickable" style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 'bold', color: 'var(--primary-light)' }}>🔑 MeroShare Portal</span>
              <ExternalLink style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Calculate WACC, apply for IPOs, transfer shares via EDIS.</span>
          </a>
          <a href="https://iporesult.cdsc.com.np/" target="_blank" rel="noreferrer" className="card-sm clickable" style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 'bold', color: 'var(--bull)' }}>🎯 IPO Result Checker</span>
              <ExternalLink style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Fastest public lookup for CDSC allotment results.</span>
          </a>
          <a href="https://www.sharesansar.com/" target="_blank" rel="noreferrer" className="card-sm clickable" style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 'bold', color: 'var(--accent-cyan)' }}>📰 ShareSansar News</span>
              <ExternalLink style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Track market dividends, corporate announcements, IPO dates.</span>
          </a>
          <a href="https://nepsealpha.com/" target="_blank" rel="noreferrer" className="card-sm clickable" style={{ display: 'flex', flexDirection: 'column', gap: 4, textDecoration: 'none', color: 'var(--text-primary)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: 'bold', color: 'var(--accent-violet)' }}>📊 NepseAlpha Charts</span>
              <ExternalLink style={{ width: 12, height: 12, color: 'var(--text-muted)' }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.4 }}>Advanced technical charting and live market heatmaps.</span>
          </a>
        </div>
      </div>

      {/* Broker TMS Directory */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 className="section-title" style={{ marginBottom: 4, color: 'var(--text-primary)' }}>Broker TMS Logins</h3>
        <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 12 }}>Find and open the Trade Management System (TMS) for your broker.</p>
        
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search by Broker Name or Number..."
            value={searchBroker}
            onChange={(e) => setSearchBroker(e.target.value)}
            className="input"
            style={{ paddingLeft: 36 }}
          />
          <Search style={{ width: 16, height: 16, color: 'var(--text-muted)', position: 'absolute', left: 12, top: 14 }} />
        </div>

        {/* List of brokers */}
        <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' }}>
          {filteredBrokers.length > 0 ? (
            filteredBrokers.map((broker, idx) => (
              <div key={broker.number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, borderBottom: idx === filteredBrokers.length - 1 ? 'none' : '1px solid var(--border)' }}>
                <div>
                  <span className="badge badge-primary" style={{ marginRight: 8 }}>TMS {broker.number}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{broker.name}</span>
                </div>
                <a 
                  href={getTmsUrl(broker.number)} 
                  target="_blank" 
                  rel="noreferrer" 
                  style={{ padding: 6, background: 'var(--primary-subtle)', border: '1px solid rgba(91,94,244,0.2)', borderRadius: 8, color: 'var(--primary-light)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                  <ExternalLink style={{ width: 14, height: 14 }} />
                </a>
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--text-muted)' }}>No brokers matching your query.</div>
          )}
        </div>
      </div>

      {/* Simple Trading Guides */}
      <div className="card">
        <h3 className="section-title" style={{ marginBottom: 12, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
          📖 Share Market Guides (Plain English)
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ borderLeft: '2px solid var(--primary)', paddingLeft: 12 }}>
            <h4 style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 4 }}>How to Buy Shares in Secondary Market?</h4>
            <ul style={{ listStyleType: 'decimal', listStylePosition: 'inside', fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <li>Open a <b>Demat Account</b> and a <b>Broker Trading Account</b> (TMS).</li>
              <li>Log in to your TMS portal, navigate to Collateral and load funds (via eSewa/Khalti/ConnectIPS).</li>
              <li>Go to <b>Order Management</b> &rarr; Buy, enter Stock Symbol, Quantity, and Bid Price, then submit.</li>
              <li>Verify the trade in your purchase list. You must clear the payment to your broker within T+2 days.</li>
            </ul>
          </div>

          <div style={{ borderLeft: '2px solid var(--primary)', paddingLeft: 12 }}>
            <h4 style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 4 }}>How to Sell Shares? (Crucial WACC Step)</h4>
            <p style={{ fontSize: 10, color: 'var(--accent-amber)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ShieldAlert style={{ width: 12, height: 12, flexShrink: 0 }} />
              Before selling, you MUST calculate WACC on MeroShare to declare acquisition costs!
            </p>
            <ul style={{ listStyleType: 'decimal', listStylePosition: 'inside', fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              <li>Log in to your TMS portal, navigate to Sell order window, and list your stock.</li>
              <li>Once sold, log in to <b>MeroShare</b>, go to <b>My ASBA</b> &rarr; <b>My Purchase Source</b> &rarr; select the sold stock, calculate and submit the WACC.</li>
              <li>Wait for broker clearance, then perform **My EDIS** (Electronic Deposit Instruction Slip) on MeroShare to transfer the shares from your Demat account to the broker within 24 hours of selling.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Expandable FAQs Accordion */}
      <div className="card" style={{ marginTop: 16 }}>
        <h3 className="section-title" style={{ marginBottom: 12, color: 'var(--text-primary)' }}>
          ❓ Frequently Asked Questions (FAQ)
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <details style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', outline: 'none' }}>
            <summary style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
              What is T+2 clearing in NEPSE?
            </summary>
            <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
              T+2 stands for Transaction date + 2 working days. If you buy shares on Monday, you must pay your broker, and if you sell, you must transfer shares via EDIS within this window, and expect funds cleared T+2.
            </p>
          </details>

          <details style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', outline: 'none' }}>
            <summary style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
              Why is WACC computation mandatory?
            </summary>
            <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
              WACC (Weighted Average Cost of Capital) defines the cost price of your stock holdings. Nepal's Inland Revenue requires it to compute Capital Gains Tax (CGT) fairly when you sell. If you do not compute WACC, CDSC assumes a default face value of Rs. 100, which might overcharge your tax!
            </p>
          </details>

          <details style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', outline: 'none' }}>
            <summary style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
              What happens if I miss the EDIS deadline?
            </summary>
            <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
              If you sell shares but fail to submit EDIS on MeroShare within 24 hours, it triggers a "closeout". You will be fined a penalty equal to 20% of the total sold value, paid directly to the buyer as compensation.
            </p>
          </details>

          <details style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', outline: 'none' }}>
            <summary style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer', outline: 'none', userSelect: 'none' }}>
              How do I load collateral in TMS?
            </summary>
            <p style={{ fontSize: 10.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
              Log in to your TMS portal, click on "Collateral Management" &rarr; "Load Collateral", choose your bank/wallet (ConnectIPS, eSewa, Khalti), enter the amount, and authenticate.
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}
