// scripts/testMoreIpoSources.mjs
import axios from 'axios';

(async () => {
  // Test A: NepaliPaisa with 12s timeout
  try {
    const t0 = Date.now();
    const resA = await axios.get('https://www.nepalipaisa.com/api/GetIpos?pageNo=1&itemsPerPage=25&pagePerDisplay=5', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 12000
    });
    console.log(`NepaliPaisa answered in ${Date.now() - t0}ms, status: ${resA.status}, count: ${resA.data?.result?.data?.length}`);
  } catch (e) {
    console.log('NepaliPaisa error:', e.message);
  }

  // Test B: Bizshala IPO / Announcements
  try {
    const resB = await axios.get('https://bizshala.com/category/ipo', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000
    });
    console.log('Bizshala status:', resB.status, 'HTML length:', resB.data?.length);
  } catch (e) {
    console.log('Bizshala error:', e.message);
  }

  // Test C: ArthikNews / AarthikAbhiyan
  try {
    const resC = await axios.get('https://www.aarthikabhiyan.com.np/', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });
    console.log('AarthikAbhiyan status:', resC.status, 'HTML length:', resC.data?.length);
  } catch (e) {
    console.log('AarthikAbhiyan error:', e.message);
  }
})();
