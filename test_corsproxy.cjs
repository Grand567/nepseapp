const axios = require('axios');

async function testCorsProxy() {
  const url = encodeURIComponent('https://www.sharesansar.com/company/nabil');
  const pageRes = await axios.get(\`https://corsproxy.io/?url=\${url}\`);
  const token = pageRes.data.match(/meta name="_token" content="(.*?)"/)[1];
  
  // Extract cookies from corsproxy response? corsproxy doesn't give us the original set-cookie easily
  // Actually corsproxy.io shares the session per IP? No.
  console.log(token);
}

testCorsProxy();
