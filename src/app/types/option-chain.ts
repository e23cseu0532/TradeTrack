
export interface OptionDataPoint {
  strikePrice: number;
  ltp: number;
  iv: number;
  oi: number;
}

export interface OptionChainSnapshot {
  timestamp: string;
  underlyingValue: number;
  calls: OptionDataPoint[];
  puts: OptionDataPoint[];
}
