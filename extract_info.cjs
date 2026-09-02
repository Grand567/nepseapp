const cheerio = require('cheerio');
const fs = require('fs');
const $ = cheerio.load(fs.readFileSync('glbsl.html', 'utf-8'));
console.log($('.company-basic-info').html() || $('.comp-info').html() || $('#myTable').html());
