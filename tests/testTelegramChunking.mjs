import { splitMessageIntoTelegramChunks } from '../proxy/telegramNotifier.mjs';

// Test 1: Short message is not split
const shortMsg = '<b>Hello World</b>';
const shortChunks = splitMessageIntoTelegramChunks(shortMsg);
console.assert(shortChunks.length === 1, 'Short message should not be split');
console.assert(shortChunks[0] === shortMsg, 'Short chunk matches original');

// Test 2: Message exceeding 3900 chars is cleanly split along cards delimiter
const card = `<b>1. $SHPC</b> — Sanima Mai Hydropower
• <b>Setup:</b> ⚡ Fresh 20-Day Resistance Breakout
• <b>Price:</b> Rs. 575.00 (+1.2% above pivot)
• <b>20D Resistance:</b> Rs. 568.00 (Broken 🚀)
• <b>Volume Surge:</b> <b>3.4x</b> 20D Avg (120,000 shares)
• 🛡️ <b>Stop-Loss Floor:</b> Rs. 548.00 (-4.5% defense)
• 🎯 <b>Target 1:</b> Rs. 621.00 (+8.0%) | 🚀 <b>Target 2:</b> Rs. 658.00 (+14.5%)`;

const delimiter = '\n──────────────────────────\n';
const cards = Array.from({ length: 12 }, (_, i) => card.replace('1.', `${i + 1}.`));
const fullText = [
  '🚀 <b>HIGH-VOLUME BREAKOUT & 20 EMA ACCUMULATION RADAR (12 Verified)</b>',
  '──────────────────────────',
  'Session Date: <b>2026-11-13</b>',
  'Strategy: 20 EMA Cross within 1–10 Days + Sharp Non-Surged Base + Volume Expansion',
  '──────────────────────────',
  cards.join(delimiter),
  '──────────────────────────',
  '💡 <i>Safe Entry Rule: Buy inside the sharp consolidation base near 20 EMA.</i>'
].join('\n');

console.log('Original message length:', fullText.length);
const chunks = splitMessageIntoTelegramChunks(fullText, 3900);
console.log(`Generated ${chunks.length} chunks:`, chunks.map(c => c.length));

console.assert(chunks.length > 1, 'Should have generated multiple chunks!');
for (let i = 0; i < chunks.length; i++) {
  console.assert(chunks[i].length <= 3900, `Chunk ${i} exceeds 3900 chars!`);
}

console.log('✅ All telegram chunking assertions passed!');
