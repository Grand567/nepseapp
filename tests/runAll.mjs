import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const testFiles = [
  'comparativeVerification.test.mjs',
  'bBatchIndicators.test.mjs',
  'cBatchPriceAdjustment.test.mjs',
  'dBatchFundamentals.test.mjs',
  'eBatchRiskManagement.test.mjs',
  'fBatchBacktest.test.mjs',
  'gBatchInvariants.test.mjs',
  'hBatchMacroEvents.test.mjs',
  'iBatchInvestorSafety.test.mjs',
  'jBatchAdvancedEngines.test.mjs',
  'kWhaleDailyArchive.test.mjs',
  'testSmartAlertPipeline.mjs'
];

console.log('====================================================');
console.log(' RUNNING FULL NEPSE SUITE VERIFICATION (12 SUITES)  ');
console.log('====================================================\n');

let totalFailures = 0;
let totalPassedSuites = 0;

for (const file of testFiles) {
  const filePath = path.join(__dirname, file);
  console.log(`\n▶ [SUITE] ${file}`);
  const result = spawnSync(process.execPath, [filePath], {
    stdio: 'inherit'
  });

  if (result.status !== 0) {
    console.error(`❌ FAILED: ${file} exited with code ${result.status}`);
    totalFailures++;
  } else {
    totalPassedSuites++;
  }
}

console.log('\n====================================================');
console.log(`SUMMARY: ${totalPassedSuites} passed, ${totalFailures} failed out of ${testFiles.length} test suites.`);
console.log('====================================================');

if (totalFailures > 0) {
  process.exit(1);
} else {
  console.log('✅ ALL TEST SUITES PASSED CLEANLY!\n');
  process.exit(0);
}
