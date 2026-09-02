const cheerio = require('cheerio');
fetch('https://merolagani.com/LatestMarket.aspx').then(r=>r.text()).then(html => {
  const $ = cheerio.load(html);
  $('table').each((i, el) => console.log('Table class:', $(el).attr('class')));
});
