const axios = require('axios');

async function testNoCookie() {
  const pageRes = await axios.get('https://www.sharesansar.com/company/nabil');
  const token = pageRes.data.match(/meta name="_token" content="(.*?)"/)[1];
  
  const postData = new URLSearchParams();
  postData.append('company', '140');
  postData.append('draw', '1');
  postData.append('start', '0');
  postData.append('length', '50');
  
  try {
    const res = await axios.post('https://www.sharesansar.com/company-price-history', postData.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-CSRF-Token': token,
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': 'https://www.sharesansar.com/company/nabil'
      }
    });
    console.log('No cookie success!', res.data?.data?.length || res.data);
  } catch (err) {
    console.log('No cookie failed:', err.response?.status);
  }
}

testNoCookie();
