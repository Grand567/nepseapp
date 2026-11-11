// scripts/inspectIpoFeeds.mjs
import axios from 'axios';

(async () => {
  try {
    const res = await axios.get('https://iporesult.cdsc.com.np/api/ipo-result/companyShare/allCompanyShare', {
      headers: {
        'Origin': 'https://iporesult.cdsc.com.np',
        'Referer': 'https://iporesult.cdsc.com.np/'
      },
      timeout: 8000
    });
    console.log('CDSC body preview:');
    const parsed = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
    console.log('Parsed keys:', Object.keys(parsed));
    if (parsed.body) {
      console.log('Body length:', parsed.body.length);
      console.log('First 3 items:', parsed.body.slice(0, 3));
    }
  } catch (e) {
    console.error('CDSC error:', e.message);
  }
})();
