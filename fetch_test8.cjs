fetch('https://merolagani.com/').then(r=>r.text()).then(html => {
  const index = html.indexOf('2597');
  console.log(html.substring(index - 100, index + 200));
});
