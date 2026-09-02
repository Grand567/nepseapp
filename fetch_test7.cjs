const cheerio = require('cheerio');
fetch('https://merolagani.com/').then(r=>r.text()).then(html => {
  const $ = cheerio.load(html);
  console.log($('#ctl00_ContentPlaceHolder1_LiveTrading_LiveNepse1_updatePanel1').html());
});
