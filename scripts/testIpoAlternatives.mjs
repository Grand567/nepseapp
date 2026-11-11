// scripts/testIpoAlternatives.mjs
import axios from 'axios';

(async () => {
  // Test 1: CDSC iporesult public endpoint
  try {
    const res1 = await axios.get('https://iporesult.cdsc.com.np/api/ipo-result/companyShare/allCompanyShare', {
      headers: {
        'Origin': 'https://iporesult.cdsc.com.np',
        'Referer': 'https://iporesult.cdsc.com.np/'
      },
      timeout: 8000
    });
    console.log('1. CDSC iporesult allCompanyShare status:', res1.status, 'items:', res1.data?.body?.length || res1.data?.length);
    if (res1.data?.body) {
      console.log('   Sample:', res1.data.body.slice(0, 2));
    }
  } catch (e) {
    console.log('1. CDSC iporesult failed:', e.message);
  }

  // Test 2: NepaliPaisa alternative URL
  try {
    const res2 = await axios.get('https://nepalipaisa.com/api/GetIpos?pageNo=1&itemsPerPage=25&pagePerDisplay=5', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://nepalipaisa.com/'
      },
      timeout: 8000
    });
    console.log('2. NepaliPaisa no-www status:', res2.status, 'items:', res2.data?.result?.data?.length);
  } catch (e) {
    console.log('2. NepaliPaisa no-www failed:', e.message);
  }

  // Test 3: NepaliPaisa news/scrapes
  try {
    const res3 = await axios.get('https://nepalipaisa.com/ipo', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000
    });
    console.log('3. NepaliPaisa HTML status:', res3.status, 'length:', res3.data?.length);
  } catch (e) {
    console.log('3. NepaliPaisa HTML failed:', e.message);
  }

  // Test 4: Chillum / Bizshala / SEBON
  try {
    const res4 = await axios.get('https://sebon.gov.np/public-issues', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });
    console.log('4. SEBON public issues status:', res4.status, 'length:', res4.data?.length);
  } catch (e) {
    console.log('4. SEBON public issues failed:', e.message);
  }
})();
