const axios = require('axios');

async function test() {
  const types = ['market_index', 'nepse_index', 'index', 'dashboard', 'summary', 'market_summary'];
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
