import { getFastVaultSnapshot, getOrFetchAllTimeBrokerHoldings } from '../proxy/brokerVault.mjs';

async function run() {
  for (const sym of ['AKJCL', 'GHL', 'SHEL', 'SAHAS']) {
    console.log(`\n=== Checking Vault for ${sym} ===`);
    const allTime = await getOrFetchAllTimeBrokerHoldings(sym);
    console.log('allTime success:', allTime?.success);
    console.log('allTime totalSharesHeldTillNow:', allTime?.totalSharesHeldTillNow);
    console.log('allTime allHoldings count:', allTime?.allHoldings?.length);
    if (allTime?.allHoldings?.length > 0) {
      const sumAllHoldings = allTime.allHoldings.reduce((s, b) => s + (b.netQty || 0), 0);
      console.log('Sum of allHoldings netQty:', sumAllHoldings);
      console.log('Top 3 holdings:', allTime.allHoldings.slice(0, 3).map(b => `B#${b.broker}: net=${b.netQty} (${b.holdingSharePct}%)`));
    }

    const snap30 = getFastVaultSnapshot(sym, 30);
    console.log('snap30 totalSharesHeldTillNow:', snap30?.totalSharesHeldTillNow);
    console.log('snap30 brokers count:', snap30?.brokers?.length);

    const snap1 = getFastVaultSnapshot(sym, 1);
    console.log('snap1 totalSharesHeldTillNow:', snap1?.totalSharesHeldTillNow);
  }
}

run();
