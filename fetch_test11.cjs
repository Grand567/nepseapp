fetch('https://www.sharesansar.com/live-trading').then(r=>r.text()).then(html => {
  const i = html.indexOf('259');
  console.log(html.substring(i - 100, i + 100));
});
