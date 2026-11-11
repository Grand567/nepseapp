const res = await fetch('https://drabyashree-nepse-hub6936.vercel.app');
const text = await res.text();
const match = text.match(/src="(\/assets\/[^"]+)"/);
console.log('Live Vercel Main Script:', match ? match[1] : 'Not found');

// Local dist main script
import fs from 'fs';
const localIndex = fs.readFileSync('dist/index.html', 'utf8');
const localMatch = localIndex.match(/src="(\/assets\/[^"]+)"/);
console.log('Local Dist Main Script:', localMatch ? localMatch[1] : 'Not found');
