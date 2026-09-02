const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

async function testHistory(length) {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, withCredentials: true }));
  
  const pageRes = await client.get('https://www.sharesansar.com/company/glbsl');
  const token = pageRes.data.match(/meta name="_token" content="(.*?)"/)[1];
  
  const postData = new URLSearchParams();
  postData.append('company', '719');
  postData.append('draw', '1');
  postData.append('start', '0');
  postData.append('length', length);
  
  const res = await client.post('https://www.sharesansar.com/company-price-history', postData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-CSRF-Token': token,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.sharesansar.com/company/glbsl',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  });
  
  console.log('Length:', length, 'Data length:', res.data.data?.length);
}

testHistory('90').then(() => testHistory('50')).then(() => testHistory('30'));
