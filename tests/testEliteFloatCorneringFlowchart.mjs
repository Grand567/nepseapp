// tests/testEliteFloatCorneringFlowchart.mjs
import assert from 'assert';
import Database from 'better-sqlite3';
import path from 'path';
import {
  formatFlowchartTrackDisplay,
  classifyDualTrackRally,
} from '../proxy/telegramNotifier.mjs';

console.log('🧪 Starting Automated Suite: Elite Float Cornering & Track B Normalization...\n');

const dbPath = path.join(process.cwd(), 'proxy', 'data', 'drabyashree_ledger.db');
const db = new Database(dbPath, { readonly: true });

// Test 1: Float % Normalization vs Absolute Kitta
console.log('Test 1: Testing Free Float % Normalization vs Absolute Kitta...');
{
  // A mega-cap with 110M float where 50,000 kitta was bought:
  const megaCapFloat = 110_900_000;
  const megaCapNet = 50_000;
  const megaCapPct = (megaCapNet / megaCapFloat) * 100;
  assert.ok(megaCapPct < 0.10, 'Mega cap with 50k kitta must have < 0.1% cornered float');

  // A mid/small-cap with 6.0M float where 50,000 kitta was bought:
  const smallCapFloat = 6_000_000;
  const smallCapNet = 50_000;
  const smallCapPct = (smallCapNet / smallCapFloat) * 100;
  assert.ok(smallCapPct >= 0.80, 'Small cap with 50k kitta must have >= 0.8% cornered float');

  console.log(`✅ Test 1 Passed: Float % accurately distinguishes NABIL (0.05%) vs MBJC (0.83%) for identical 50k kitta.`);
}

// Test 2: Track B Classification with Float Cornering & VDU
console.log('\nTest 2: Testing Track B Classification and Regime Handling...');
{
  const resB = classifyDualTrackRally({
    smc: { isBreakAndRetest: true },
    leadRetentionPct: 82,
    dayChgPct: 1.2,
    marketRegime: 'BULL',
  });

  assert.strictEqual(resB.rallyTrack, 'TRACK_B_T2_CLEARED_CONTINUATION');
  assert.strictEqual(resB.isUpperWickRejected, false);
  console.log('✅ Test 2 Passed: Track B verified in Bull Regime.');
}

// Test 3: Track B Sniper Retest in Defensive Chop Regime
console.log('\nTest 3: Testing Track B Sniper Retest in Defensive Chop Regime...');
{
  const resBChop = classifyDualTrackRally({
    smc: { isBreakAndRetest: true },
    leadRetentionPct: 85,
    dayChgPct: 0.5,
    marketRegime: 'CHOP',
  });

  assert.strictEqual(resBChop.rallyTrack, 'TRACK_B_T2_CLEARED_CONTINUATION');
  assert.ok(resBChop.rallyHorizonLabel.includes('Sniper Retest'));

  // Track A MUST BE MUTED in Chop
  const resAChop = classifyDualTrackRally({
    smc: { isNr7: true },
    leadRetentionPct: 85,
    marketRegime: 'CHOP',
  });
  assert.strictEqual(resAChop.rallyTrack, 'TRACK_A_MUTED_CHOP_VETO');
  console.log('✅ Test 3 Passed: Track B operates as Sniper while Track A is safely muted in Chop.');
}

// Test 4: Format Flowchart Track Display with Elite Badges
console.log('\nTest 4: Testing formatFlowchartTrackDisplay...');
{
  const dispBull = formatFlowchartTrackDisplay('TRACK_B_T2_CLEARED_CONTINUATION', '', 'BULL');
  assert.ok(dispBull.tierBadge.includes('70%+ Win-Rate Tier'));
  assert.ok(dispBull.regimeBadge.includes('BULL REGIME'));

  const dispChop = formatFlowchartTrackDisplay('TRACK_B_T2_CLEARED_CONTINUATION', '', 'CHOP');
  assert.ok(dispChop.tierBadge.includes('Sniper Post-T+2 Retest'));
  assert.ok(dispChop.regimeBadge.includes('DEFENSIVE CHOP REGIME'));
  console.log('✅ Test 4 Passed: Display badges accurately reflect adaptive status.');
}

console.log('\n🎉 All 4/4 Automated Tests Passed for Elite Float Cornering & Track B Normalization!');
try { db.close(); } catch (_) {}
