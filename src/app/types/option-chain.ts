import { Timestamp } from "firebase/firestore";

export interface OptionDataPoint {
  strikePrice: number;
  ltp: number;
  iv: number;
  oiChange: number;
  oi: number;
}

export interface OptionChainSnapshot {
  timestamp: Timestamp;
  underlyingValue: number;
  calls: OptionDataPoint[];
  puts: OptionDataPoint[];
}

export interface DailyOptionData {
  intervals: {
    [key: string]: OptionChainSnapshot;
  };
}
