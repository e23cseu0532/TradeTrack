import { Timestamp } from "firebase/firestore";

export interface StockRecord {
  id: string;
  dateTime: Timestamp;
  stockSymbol: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
}
