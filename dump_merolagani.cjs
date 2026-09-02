const fs = require('fs');
fetch('https://merolagani.com/CompanyDetail.aspx?symbol=NABIL')
  .then(r => r.text())
  .then(html => {
    fs.writeFileSync('merolagani_nabil.html', html);
    console.log('Saved');
  });
