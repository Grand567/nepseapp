try {
  const res = await fetch('https://nepseapp.onrender.com/api/telegram/dispatch-broker58-radar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: 'AKJCL' })
  });
  const data = await res.json();
  console.log('Result for AKJCL:', data);
} catch (e) {
  console.error('Error:', e.message);
}
