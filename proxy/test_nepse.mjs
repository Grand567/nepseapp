import { Nepse } from '@rumess/nepse-api';

async function test() {
  try {
    const nepse = new Nepse();
    const summary = await nepse.getMarketSummary();
    console.log("Market Summary:", summary);
    const indices = await nepse.getNepseIndex();
    console.log("Nepse Index:", indices);
  } catch (e) {
    console.error(e);
  }
}
test();
