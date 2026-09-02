const cheerio = require('cheerio');
const fs = require('fs');
const $ = cheerio.load(fs.readFileSync('glbsl.html', 'utf-8'));
console.log('companyid:', $('#companyid').text().trim());
console.log('token:', $('meta[name="_token"]').attr('content') || $('input[name="_token"]').val());
