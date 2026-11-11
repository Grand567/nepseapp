import http from 'http';

// We can test the endpoints if server is running or inspect the server handler directly
import Database from 'better-sqlite3';
import { getFastVaultSnapshot, getOrFetchAllTimeBrokerHoldings, getOrFetchBrokerAnalysis } from '../proxy/brokerVault.mjs';

async function testAll() {
  for (const sym of ['AKJCL', 'GHL']) {
    console.log(`\n================= TESTING ${sym} =================`);
    const allRes = await getOrFetchAllTimeBrokerHoldings(sym);
    console.log('[allRes] totalSharesHeldTillNow:', allRes.totalSharesHeldTillNow);
    console.log('[allRes] allHoldings count:', allRes.allHoldings?.length);
    const sumAllHoldings = allRes.allHoldings.reduce((s, b) => s + b.netQty, 0);
    console.log('[allRes] sum of allHoldings netQty:', sumAllHoldings);

    // What about getOrFetchBrokerAnalysis with days=30?
    const res30 = await getOrFetchBrokerAnalysis(sym, 30);
    console.log('[res30] totalSharesHeldTillNow:', res30?.totalSharesHeldTillNow);
    console.log('[res30] totalHoldQty:', res30?.totalHoldQty);
    console.log('[res30] brokers count:', res30?.brokers?.length);
    const pos30 = res30?.brokers?.filter(b => b.netQty > 0);
    const sumPos30 = pos30?.reduce((s, b) => s + b.netQty, 0);
    console.log('[res30] sum of positive netQty in 30D:', sumPos30);

    // What about days=1?
    const res1 = await getOrFetchBrokerAnalysis(sym, 1);
    console.log('[res1] totalSharesHeldTillNow:', res1?.totalSharesHeldTillNow);
    const pos1 = res1?.brokers?.filter(b => b.netQty > 0);
    const sumPos1 = pos1?.reduce((s, b) => s + b.netQty, 0);
    console.log('[res1] sum of positive netQty in 1D:', sumPos1);
  }
}

testAll();
