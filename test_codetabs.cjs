const axios = require('axios');

async function testCodetabs() {
  try {
    const pageRes = await axios.get('https://api.codetabs.com/v1/proxy?quest=https://www.sharesansar.com/company/nabil');
    const token = pageRes.data.match(/meta name="_token" content="(.*?)"/)[1];
    const setCookie = pageRes.headers['set-cookie'] || [];
    const cookieStr = setCookie.map(c => c.split(';')[0]).join('; ');
    
    console.log('Token:', token);

    const postData = new URLSearchParams();
    postData.append('company', '140');
    postData.append('draw', '1');
    postData.append('start', '0');
    postData.append('length', '50');

    const res = await axios.post('https://api.codetabs.com/v1/proxy?quest=https://www.sharesansar.com/company-price-history', postData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF-Token': token,
        'Cookie': cookieStr,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.sharesansar.com/company/nabil'
      }
    });
    
    console.log('Success! Data length:', res.data?.data?.length);
  } catch (err) {
    console.error('Failed:', err.response?.status, err.message);
  }
}

testCodetabs();
