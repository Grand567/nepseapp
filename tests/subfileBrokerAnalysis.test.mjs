import assert from 'node:assert';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';

test('Subfile offline broker analysis synthesis for AKJCL', () => {
  const subfile1 = JSON.parse(fs.readFileSync('public/data/subfiles/historical_day_1.json', 'utf8'));
  const akjcl1 = subfile1.scrips?.AKJCL;
  assert.ok(akjcl1, 'AKJCL should exist in Day 1 subfile');
  assert.equal(akjcl1.card_1_quote.vwap, 343.55);
  assert.equal(akjcl1.card_4_broker_smart_flow.lead_accumulator.broker_id, 62);
  assert.equal(akjcl1.card_4_broker_smart_flow.lead_accumulator.net_kitta, 15203);

  // Check all 5 subfiles exist
  for (let i = 1; i <= 5; i++) {
    const filePath = `public/data/subfiles/historical_day_${i}.json`;
    assert.ok(fs.existsSync(filePath), `Subfile ${filePath} must exist`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assert.ok(data.scrips?.AKJCL, `AKJCL must exist in subfile ${i}`);
  }
});
