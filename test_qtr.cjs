const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

async function testQtr() {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar, withCredentials: true }));
  const pageRes = await client.get('https://www.sharesansar.com/company/glbsl');
  const token = pageRes.data.match(/meta name="_token" content="(.*?)"/)[1];
  
  const postData = new URLSearchParams();
  postData.append('company', '719');
  
  const res = await client.post('https://www.sharesansar.com/company-quarterly-report', postData.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-CSRF-Token': token,
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.sharesansar.com/company/glbsl'
    }
  });
  console.log(res.data.substring(0, 1000));
}
testQtr();
