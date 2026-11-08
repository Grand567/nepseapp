import type { EnrichedFloorsheetContract } from '../services/floorsheet/floorsheetHubEngine';

export interface MarketWideScripWhaleRollup {
  symbol: string;
  totalKitta: number;
  totalTurnover: number;
  vwap: number;
  whalePrintCount: number;
  buyAggressorPct: number;
  topBuyerBroker: number;
}

export interface MarketWideBrokerRollup {
  brokerId: number;
  buyKitta: number;
  sellKitta: number;
  netKitta: number;
  turnover: number;
  whaleTrades: number;
  anomalyScore: number;
}

export interface FloorsheetHubApiResponse {
  ok: boolean;
  asOfDate: string;
  availableDates?: string[];
  source: 'SQLITE_CONTRACTS' | 'SQLITE_BROKER_SUMMARY_SYNTHESIS' | 'EMPTY';
  summary: {
    totalContracts: number;
    totalKitta: number;
    totalTurnover: number;
    whaleContractCount: number;
    whaleTurnoverPct: number;
    internalCrossKittaPct: number;
    marketBuyAggressorPct: number;
  };
  topWhaleScrips: MarketWideScripWhaleRollup[];
  topInstitutionalBrokers: MarketWideBrokerRollup[];
  contracts: EnrichedFloorsheetContract[];
}
