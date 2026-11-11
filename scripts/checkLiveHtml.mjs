const res = await fetch('https://drabyashree-nepse-hub6936.vercel.app');
const text = await res.text();
const m = text.match(/assets\/stock-detail-modal-[^.]+\.js/);
console.log('Stock detail modal script on live Vercel:', m ? m[0] : 'not found');
if (m) {
  const t = await fetch(`https://drabyashree-nepse-hub6936.vercel.app/${m[0]}`).then(r => r.text());
  console.log('Includes allTimeBrokerAnalysis:', t.includes('allTimeBrokerAnalysis'));
  console.log('Includes fetchCompanyQuarterlyReports:', t.includes('fetchCompanyQuarterlyReports'));
}




