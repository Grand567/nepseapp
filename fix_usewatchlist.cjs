const fs = require('fs');
let code = fs.readFileSync('src/components/Dashboard.jsx', 'utf8');

if (!code.includes('useEffect')) {
  code = code.replace(/import React, \{ useState, useMemo \} from 'react';/, "import React, { useState, useMemo, useEffect } from 'react';");
}

const useWatchlistCode = `
export const useWatchlist = () => {
  const [watchlist, setWatchlist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('nepse_watchlist')) || []; }
    catch(e) { return []; }
  });

  const toggleWatchlist = (symbol) => {
    let newList;
    if (watchlist.includes(symbol)) {
      newList = watchlist.filter(s => s !== symbol);
    } else {
      newList = [...watchlist, symbol];
    }
    setWatchlist(newList);
    localStorage.setItem('nepse_watchlist', JSON.stringify(newList));
    window.dispatchEvent(new Event('watchlist_updated'));
  };

  useEffect(() => {
    const handleUpdate = () => {
      try { setWatchlist(JSON.parse(localStorage.getItem('nepse_watchlist')) || []); }
      catch(e) {}
    };
    window.addEventListener('watchlist_updated', handleUpdate);
    return () => window.removeEventListener('watchlist_updated', handleUpdate);
  }, []);

  return { watchlist, toggleWatchlist };
};

`;

const startMarker = 'export default function Dashboard';
const startIndex = code.indexOf(startMarker);
if (startIndex !== -1) {
  code = code.substring(0, startIndex) + useWatchlistCode + code.substring(startIndex);
  fs.writeFileSync('src/components/Dashboard.jsx', code);
  console.log('Fixed useWatchlist and imports!');
} else {
  console.log('Could not find start marker');
}
