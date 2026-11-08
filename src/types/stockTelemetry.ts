import type {
  RawQuotePayload,
  HistoricalCandle,
  LedgerTelemetryRow,
} from '../services/aiGuru/runAiQuantitativeAssessment';
import type {
  RawFloorsheetContract,
  UnifiedStockTabTelemetry,
} from '../services/floorsheet/floorsheetHubEngine';
import type {
  CorporateActionRow,
  EvaluatedFundamentalTelemetry,
  RawFundamentalRecord,
} from '../services/fundamentals/nepseRegulatoryEngine';

export interface AtomicStockTelemetryApiResponse {
  ok: boolean;
  symbol: string;
  asOfTimestamp: string;
  quoteData: RawQuotePayload | null;
  historicalCandles: HistoricalCandle[];
  ledgerTelemetry: LedgerTelemetryRow | null;
  rawFloorsheetContracts: RawFloorsheetContract[];
  liveDepth: {
    bids: Array<{ price: number; kitta: number; orders: number }>;
    asks: Array<{ price: number; kitta: number; orders: number }>;
  } | null;
  broker5DPayload: unknown;
  rawFundamentals: RawFundamentalRecord | null;
  corporateActions: CorporateActionRow[];
  tabTelemetry: UnifiedStockTabTelemetry;
  fundamentalTelemetry: EvaluatedFundamentalTelemetry;
}
