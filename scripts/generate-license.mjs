#!/usr/bin/env node
// scripts/generate-license.mjs
// Developer CLI tool to issue single-use, device-bound Pro license keys for customers.

import {
  generateLicenseKey,
  cleanDeviceId,
  formatDeviceId,
  mapPlanToDays,
  parseLicenseKey
} from '../src/utils/licenseEngine.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    device: null,
    plan: '1m',
    customDays: null
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--device' || a === '-d') {
      parsed.device = args[++i];
    } else if (a === '--plan' || a === '-p') {
      parsed.plan = args[++i];
    } else if (a === '--days') {
      parsed.customDays = parseInt(args[++i], 10);
    } else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else if (!parsed.device && !a.startsWith('-')) {
      parsed.device = a;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`
🔑 Drabyashree NEPSE — Pro License Key Generator CLI

Usage:
  node scripts/generate-license.mjs --device <DEVICE_ID> [--plan <1m|2m|3m|6m|12m>]

Examples:
  node scripts/generate-license.mjs --device DS-8A7F-94B2 --plan 1m
  node scripts/generate-license.mjs --device DS-8A7F-94B2 --plan 3m
  node scripts/generate-license.mjs -d 8A7F94B2 -p 12m
`);
}

function main() {
  const { device, plan } = parseArgs();

  if (!device) {
    console.error('\n❌ Error: Please provide the customer\'s Device License ID using --device <ID>');
    printHelp();
    process.exit(1);
  }

  const clean = cleanDeviceId(device);
  if (clean.length !== 8) {
    console.error(`\n❌ Error: Invalid Device ID "${device}". Must be an 8-character ID like "DS-8A7F-94B2".`);
    process.exit(1);
  }

  const formattedDevice = formatDeviceId(clean);
  const planDuration = (plan || '1m').toLowerCase();
  const days = mapPlanToDays(planDuration);

  // Generate the cryptographic key
  const licenseKey = generateLicenseKey({
    deviceId: formattedDevice,
    planDuration
  });

  const parsed = parseLicenseKey(licenseKey);

  console.log(`
==================================================================
  👑 DRABYASHREE NEPSE — PRO LICENSE GENERATED
==================================================================
  Target Device : ${formattedDevice}
  Plan Duration : ${planDuration.toUpperCase()} (${days} Days Full Pro Access)
  License Key   : \x1b[1m\x1b[32m${licenseKey}\x1b[0m
  Single-Use    : YES (Permanently burned once activated)
  Anti-Sharing  : YES (Locked to ${formattedDevice} only)
==================================================================

📋 WhatsApp / Viber Message Template to Send to Customer:
------------------------------------------------------------------
Namaste! Thank you for subscribing to Drabyashree NEPSE Pro.

Here is your personal Pro Activation Key:

🔑 License Key: ${licenseKey}
⏱️ Duration: ${planDuration.toUpperCase()} (${days} Days Full Access)
📱 Bound To: Your Device (${formattedDevice})

How to Activate:
1. Open the Drabyashree NEPSE App
2. Tap the gold "PRO" button in the top header
3. Scroll down to "Have a Monthly Access Voucher or Code?"
4. Paste your key: ${licenseKey}
5. Tap "Redeem" to activate your Pro workstation!

Need assistance? Contact Developer Rexsh K Suwal: +977 9841576936.
------------------------------------------------------------------
`);
}

main();
