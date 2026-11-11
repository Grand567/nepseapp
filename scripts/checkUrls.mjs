const urls = [
  'https://nepse-hub.vercel.app',
  'https://drabyashree-nepse-hub-2347.vercel.app',
  'https://drabyashree-nepse-hub6936.vercel.app',
  'https://nepse-app.vercel.app',
  'https://nepseapp.onrender.com'
];

for (const u of urls) {
  try {
    const res = await fetch(u, { method: 'GET', signal: AbortSignal.timeout(6000) });
    console.log(`${u} -> Status: ${res.status} ${res.statusText}`);
  } catch (e) {
    console.log(`${u} -> Error: ${e.message}`);
  }
}
