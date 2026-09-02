fetch('https://www.sharesansar.com/market').then(r=>r.text()).then(html => {
  const i = html.indexOf('259');
  if (i > -1) console.log(html.substring(i - 100, i + 100));
});
