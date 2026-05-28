const axios = require('axios');

async function check() {
  try {
    const res = await axios.post('https://iporesult.cdsc.com.np/api/ipo-result/public/share-allotment/check', {
      companyShareId: 101, // dummy
      boid: '1201060000000000' // dummy
    }, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://iporesult.cdsc.com.np',
        'Referer': 'https://iporesult.cdsc.com.np/'
      }
    });
    console.log('Result status:', res.status);
    console.log('Result data:', JSON.stringify(res.data));
  } catch (err) {
    if (err.response) {
      console.log('Failed with status:', err.response.status);
      console.log('Response headers:', err.response.headers);
      console.log('Response body:', err.response.data);
    } else {
      console.error('Error:', err.message);
    }
  }
}

check();
