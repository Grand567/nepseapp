const axios = require('axios');

async function testCorsProxy() {
  try {
    const pageUrl = encodeURIComponent('https://www.sharesansar.com/company/nabil');
    const pageRes = await axios.get('https://corsproxy.io/?url=' + pageUrl);
    const token = pageRes.data.match(/meta name="_token" content="(.*?)"/)[1];
    const setCookie = pageRes.headers['set-cookie'] || [];
    const cookieStr = setCookie.map(c => c.split(';')[0]).join('; ');
    
    console.log('Token:', token);
    console.log('Cookies:', cookieStr);

    const postData = new URLSearchParams();
    postData.append('company', '140');
    postData.append('draw', '1');
    postData.append('start', '0');
    postData.append('length', '50');

    const historyUrl = encodeURIComponent('https://www.sharesansar.com/company-price-history');
    const res = await axios.post('https://corsproxy.io/?url=' + historyUrl, postData.toString(), {
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

testCorsProxy();
