import { Nepse } from '@rumess/nepse-api';

async function test() {
  try {
    const nepse = new Nepse();
    const live = await nepse.getLiveMarket();
    console.log("Live Market (first 5):", live.slice(0, 5));
  } catch (e) {
    console.error(e);
  }
}
test();
