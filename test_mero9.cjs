const axios = require('axios');

async function test() {
  const types = ['price_history', 'floorsheet', 'technical', 'fundamental'];
  for (const t of types) {
    try {
      const r = await axios.get(`https://merolagani.com/handlers/webrequesthandler.ashx?type=${t}&symbol=NABIL`);
      console.log(`type=${t} =>`, JSON.stringify(r.data).substring(0, 100));
    } catch(e) {
      console.log(`type=${t} =>`, e.message);
    }
  }
}
test();
