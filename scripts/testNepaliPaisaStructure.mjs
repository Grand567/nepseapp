// scripts/testNepaliPaisaStructure.mjs
import axios from 'axios';

(async () => {
  try {
    const resA = await axios.get('https://www.nepalipaisa.com/api/GetIpos?pageNo=1&itemsPerPage=25&pagePerDisplay=5', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout: 12000
    });
    console.log('Top keys:', Object.keys(resA.data));
    console.log('Full response preview:', JSON.stringify(resA.data).slice(0, 500));
  } catch (e) {
    console.log('Error:', e.message);
  }
})();
