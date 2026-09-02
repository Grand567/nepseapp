fetch('https://www.sharesansar.com/live-trading').then(r=>r.text()).then(html => {
  const i = html.indexOf('2598');
  if (i > -1) console.log(html.substring(i - 100, i + 100));
  const j = html.indexOf('2599');
  if (j > -1) console.log(html.substring(j - 100, j + 100));
});
