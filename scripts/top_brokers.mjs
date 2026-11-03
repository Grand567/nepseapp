import Database from 'better-sqlite3';

const db = new Database('proxy/data/drabyashree_ledger.db');

const brokerMap = {
  "58": "Naasa Securities Co. Ltd.",
  "45": "Imperial Securities Co. Ltd.",
  "42": "Sani Securities Co. Ltd.",
  "49": "Online Securities Ltd.",
  "34": "Vision Securities Pvt. Ltd.",
  "28": "Shrikrishna Securities Ltd.",
  "38": "Dipshikha Dhitopatra Karobar Co.",
  "44": "Dynamic Technosoft / Broker 44",
  "17": "ABC Securities Pvt. Ltd.",
  "57": "Aryatara Investment & Securities",
  "6": "Agrawal Securities Pvt. Ltd.",
  "14": "Nepal Stock House Pvt. Ltd.",
  "50": "Crystal Kanchenjunga Securities",
  "59": "Deevya Securities & Stock",
  "32": "Premier Securities Co. Ltd.",
  "48": "Trisakti Securities Public Ltd.",
  "36": "Secured Securities Ltd.",
  "65": "Sharepro Securities Pvt. Ltd.",
  "16": "Primo Securities Pvt. Ltd.",
  "39": "Sumeru Securities Pvt. Ltd.",
  "54": "Sewa Securities Pvt. Ltd.",
  "52": "Sundhara Securities Ltd.",
  "25": "Sweta Securities Pvt. Ltd."
};

const rows = db.prepare(`
  SELECT 
    broker_id,
    count(DISTINCT symbol) as scrips_traded,
    sum(buy_vol + sell_vol) as total_volume,
    round(sum(buy_amt + sell_amt) / 10000000.0, 2) as total_turnover_crores,
    round(sum(buy_amt) / 10000000.0, 2) as buy_turnover_crores,
    round(sum(sell_amt) / 10000000.0, 2) as sell_turnover_crores,
    sum(buy_vol) - sum(sell_vol) as net_volume
  FROM daily_broker_ledger
  GROUP BY broker_id
  ORDER BY sum(buy_amt + sell_amt) DESC
  LIMIT 15
`).all();

const formatted = rows.map(r => ({
  broker_id: r.broker_id,
  broker_name: brokerMap[String(r.broker_id)] || `Broker #${r.broker_id}`,
  scrips_traded: r.scrips_traded,
  total_turnover_crores: r.total_turnover_crores,
  buy_crores: r.buy_turnover_crores,
  sell_crores: r.sell_turnover_crores,
  net_volume_kitta: r.net_volume
}));

console.table(formatted);
