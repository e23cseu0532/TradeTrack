import { Timestamp } from "firebase/firestore";

export interface StockRecord {
  id: string;
  dateTime: Timestamp;
  stockSymbol: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice1: number;
  targetPrice2?: number;
  targetPrice3?: number;
  positionalTargetPrice?: number;
}
