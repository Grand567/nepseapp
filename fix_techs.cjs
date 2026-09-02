const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf-8');

const oldD = `const d = useMemo(() => {
    if (!liveDetail) return stock;
    return {
      ...stock,
      eps:         liveDetail.eps         || stock.eps,
      pe:          liveDetail.pe          || stock.pe,
      pb:          liveDetail.pbv         || liveDetail.pb || stock.pb,
      bookValue:   liveDetail.bookValue   || stock.bookValue,
      divYield:    liveDetail.dividend    || stock.divYield,
      bonusShare:  liveDetail.bonus       || stock.bonusShare,
      cashDiv:     liveDetail.dividend    || stock.cashDiv,
      high52w:     (liveDetail.high52w && liveDetail.high52w > 0) ? liveDetail.high52w : stock.high52w,
      low52w:      (liveDetail.low52w  && liveDetail.low52w  > 0) ? liveDetail.low52w  : stock.low52w,
      marketCap:   liveDetail.marketCap   ? liveDetail.marketCap / 1000000 : stock.marketCap,
      listedShares:liveDetail.listedShares? liveDetail.listedShares / 1000000 : stock.listedShares,
      paidUpCapital:liveDetail.paidUpCapital ? liveDetail.paidUpCapital / 1000000 : stock.paidUpCapital,
    };
  }, [stock, liveDetail]);`;

const newD = `const d = useMemo(() => {
    let base = { ...stock };
    if (liveDetail) {
      base = {
        ...base,
        eps:         liveDetail.eps         || stock.eps,
        pe:          liveDetail.pe          || stock.pe,
        pb:          liveDetail.pbv         || liveDetail.pb || stock.pb,
        bookValue:   liveDetail.bookValue   || stock.bookValue,
        divYield:    liveDetail.dividend    || stock.divYield,
        bonusShare:  liveDetail.bonus       || stock.bonusShare,
        cashDiv:     liveDetail.dividend    || stock.cashDiv,
        high52w:     (liveDetail.high52w && liveDetail.high52w > 0) ? liveDetail.high52w : stock.high52w,
        low52w:      (liveDetail.low52w  && liveDetail.low52w  > 0) ? liveDetail.low52w  : stock.low52w,
        marketCap:   liveDetail.marketCap   ? liveDetail.marketCap / 1000000 : stock.marketCap,
        listedShares:liveDetail.listedShares? liveDetail.listedShares / 1000000 : stock.listedShares,
        paidUpCapital:liveDetail.paidUpCapital ? liveDetail.paidUpCapital / 1000000 : stock.paidUpCapital,
      };
    }
    
    // Calculate technicals from activeHistory if available
    const ah = liveHistory.length > 0 ? liveHistory : history;
    if (ah && ah.length > 0) {
      const sorted = [...ah].sort((a,b) => new Date(a.dateObj || a.date).getTime() - new Date(b.dateObj || b.date).getTime());
      
      const calcEMA = (data, period) => {
        if (data.length <= period) return null;
        const k = 2 / (period + 1);
        let ema = data[0].close;
        for (let i = 1; i < data.length; i++) {
          ema = (data[i].close * k) + (ema * (1 - k));
        }
        return ema;
      };

      const ema20 = calcEMA(sorted, 20);
      const ema50 = calcEMA(sorted, 50);
      const ema12 = calcEMA(sorted, 12);
      const ema26 = calcEMA(sorted, 26);
      
      let rsi = null;
      if (sorted.length > 14) {
        let gains = 0, losses = 0;
        for (let i = 1; i <= 14; i++) {
          const chg = sorted[i].close - sorted[i - 1].close;
          if (chg > 0) gains += chg; else losses -= chg;
        }
        let avgGain = gains / 14, avgLoss = losses / 14;
        for (let i = 15; i < sorted.length; i++) {
          const chg = sorted[i].close - sorted[i - 1].close;
          avgGain = (avgGain * 13 + (chg > 0 ? chg : 0)) / 14;
          avgLoss = (avgLoss * 13 + (chg < 0 ? -chg : 0)) / 14;
        }
        if (avgLoss === 0) {
          rsi = 100;
        } else {
          const rs = avgGain / avgLoss;
          rsi = 100 - (100 / (1 + rs));
        }
      }

      if (rsi !== null) base.rsi = rsi;
      if (ema20 !== null) base.ema20 = ema20;
      if (ema50 !== null) base.ema50 = ema50;
      if (ema12 !== null && ema26 !== null) {
        let macdLine = ema12 - ema26;
        let signal = macdLine * 0.9; // Approximate signal
        base.macd = { line: macdLine, signal: signal };
      }
    }
    
    return base;
  }, [stock, liveDetail, liveHistory, history]);`;

code = code.replace(oldD, newD);
fs.writeFileSync('src/components/Dashboard.jsx', code);
console.log('Injected technical indicator calculations.');
