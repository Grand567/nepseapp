const axios = require('axios');

async function test() {
  const types = ['index_history', 'chart', 'chart_data', 'market_chart'];
  for (const t of types) {
    try {
      const r = await axios.get(`https://merolagani.com/handlers/webrequesthandler.ashx?type=${t}`);
      console.log(`type=${t} =>`, JSON.stringify(r.data).substring(0, 100));
    } catch(e) {
      console.log(`type=${t} =>`, e.message);
    }
  }
}
test();
