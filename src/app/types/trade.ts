export interface Trade {
  id: string;
  dateTime: Date;
  stockSymbol: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
}
