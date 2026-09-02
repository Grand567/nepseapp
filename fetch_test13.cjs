fetch('https://www.sharesansar.com/').then(r=>r.text()).then(html => {
  const i = html.indexOf('259');
  if (i > -1) console.log(html.substring(i - 100, i + 100));
  const j = html.indexOf('260');
  if (j > -1) console.log(html.substring(j - 100, j + 100));
});
