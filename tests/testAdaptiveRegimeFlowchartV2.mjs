// tests/testAdaptiveRegimeFlowchartV2.mjs
import assert from 'assert';
import {
  formatFlowchartTrackDisplay,
  classifyDualTrackRally,
  evaluateLoopholeProtectedSmcSetup,
} from '../proxy/telegramNotifier.mjs';

console.log('🧪 Starting Automated Suite: Adaptive Regime Flowchart v2.0 Verification...\n');

// Test 1: formatFlowchartTrackDisplay in Bull Regime
console.log('Test 1: Testing formatFlowchartTrackDisplay in Bull Regime...');
{
  const trackB = formatFlowchartTrackDisplay('TRACK_B_T2_CLEARED_CONTINUATION', '', 'BULL');
  assert.ok(trackB.tierBadge.includes('Track B: Post-T+2 Cleared Continuation'), 'Track B badge should match');
  assert.ok(trackB.allocationGuide.includes('70% Core'), 'Track B allocation should guide 70%');
  assert.ok(trackB.regimeBadge.includes('BULL REGIME'), 'Regime badge should indicate Bull');

  const trackA = formatFlowchartTrackDisplay('TRACK_A_COILED_2_3D_IGNITION', '', 'BULL');
  assert.ok(trackA.tierBadge.includes('Track A: 2–3 Day Ignition Watch'), 'Track A badge should match in Bull');
  assert.ok(trackA.allocationGuide.includes('30% Tactical'), 'Track A allocation should guide 30% tactical');
  console.log('✅ Test 1 Passed: Bull Regime displays verified.');
}

// Test 2: formatFlowchartTrackDisplay in Chop Regime (Defensive Mode)
console.log('\nTest 2: Testing formatFlowchartTrackDisplay in Chop Regime...');
{
  const trackB = formatFlowchartTrackDisplay('TRACK_B_T2_CLEARED_CONTINUATION', '', 'CHOP');
  assert.ok(trackB.tierBadge.includes('Sniper Post-T+2 Retest'), 'Track B should be in Sniper mode in Chop');
  assert.ok(trackB.allocationGuide.includes('Chop Regime'), 'Track B allocation should note Chop Regime');
  assert.ok(trackB.regimeBadge.includes('DEFENSIVE CHOP REGIME'), 'Regime badge should indicate Chop');

  const trackAMuted = formatFlowchartTrackDisplay('TRACK_A_MUTED_CHOP_VETO', '', 'CHOP');
  assert.ok(trackAMuted.tierBadge.includes('Chop Regime Veto'), 'Track A should display Chop Regime Veto badge');
  assert.ok(trackAMuted.allocationGuide.includes('Track A Vetoed'), 'Track A allocation guide should warn to hold cash');
  console.log('✅ Test 2 Passed: Chop Regime displays verified.');
}

// Test 3: classifyDualTrackRally in Bull Regime
console.log('\nTest 3: Testing classifyDualTrackRally in Bull Regime...');
{
  // Break and Retest setup
  const resB = classifyDualTrackRally({
    smc: { isBreakAndRetest: true },
    marketRegime: 'BULL',
  });
  assert.strictEqual(resB.rallyTrack, 'TRACK_B_T2_CLEARED_CONTINUATION');
  assert.strictEqual(resB.rallyHorizonLabel, 'Track B: Post-T+2 Cleared Continuation');

  // Coiled Ignition setup
  const resA = classifyDualTrackRally({
    smc: { isNr7: true },
    leadRetentionPct: 80,
    marketRegime: 'BULL',
  });
  assert.strictEqual(resA.rallyTrack, 'TRACK_A_COILED_2_3D_IGNITION');
  assert.strictEqual(resA.rallyHorizonLabel, 'Track A: 2–3 Day Ignition Watch');
  console.log('✅ Test 3 Passed: Bull Regime classifications verified.');
}

// Test 4: classifyDualTrackRally in Chop Regime (Muting Track A)
console.log('\nTest 4: Testing classifyDualTrackRally in Chop Regime...');
{
  // Break and Retest in Chop should still qualify as Track B Sniper
  const resB = classifyDualTrackRally({
    smc: { isBreakAndRetest: true },
    marketRegime: 'CHOP',
  });
  assert.strictEqual(resB.rallyTrack, 'TRACK_B_T2_CLEARED_CONTINUATION');
  assert.ok(resB.rallyHorizonLabel.includes('Sniper Retest'), 'Should label as Sniper Retest');

  // Coiled Ignition in Chop MUST BE MUTED
  const resA = classifyDualTrackRally({
    smc: { isNr7: true },
    leadRetentionPct: 80,
    marketRegime: 'CHOP',
  });
  assert.strictEqual(resA.rallyTrack, 'TRACK_A_MUTED_CHOP_VETO');
  assert.ok(resA.rallyHorizonLabel.includes('Muted by Chop Regime Veto'), 'Should be muted by Chop Regime veto');
  console.log('✅ Test 4 Passed: Track A successfully muted in Chop Regime.');
}

// Test 5: Rejection of Upper Wick Distribution
console.log('\nTest 5: Testing Upper-Wick Distribution rejection...');
{
  const resWick = classifyDualTrackRally({
    smc: { isBreakAndRetest: true, upperWickRatio: 0.50 },
    dayChgPct: 2.5,
    marketRegime: 'BULL',
  });
  assert.strictEqual(resWick.isUpperWickRejected, true);
  assert.strictEqual(resWick.rallyTrack, 'STANDARD_ACCUMULATION');

  // Verify that isCoilIgnitionBreakout cannot bypass upper wick rejection
  const resCoilWick = classifyDualTrackRally({
    isCoilIgnitionBreakout: true,
    smc: { upperWickRatio: 0.52 },
    dayChgPct: 2.1,
    marketRegime: 'BULL',
  });
  assert.strictEqual(resCoilWick.isUpperWickRejected, true);
  assert.strictEqual(resCoilWick.rallyTrack, 'STANDARD_ACCUMULATION', 'Coil ignition must be rejected if upper wick shows distribution');
  console.log('✅ Test 5 Passed: Upper-wick rejection verified for both Retest and Coil Ignition.');
}

console.log('\n🎉 All Automated Tests Passed for Adaptive Regime Flowchart v2.0!');
