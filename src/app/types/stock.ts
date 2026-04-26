export type StockData = {
  [key: string]: {
    currentPrice?: number;
    high?: number;
    low?: number;
    loading: boolean;
    error?: boolean;
  };
};

export type PricePoint = {
  value: number;
  date: string;
};

export type FinancialData = {
  currentPrice?: number;
  high52w?: PricePoint;
  low52w?: PricePoint;
  high4w?: PricePoint;
  low4w?: PricePoint;
  marketCap?: number;
  peRatio?: number;
  eps?: number;
  dividendYield?: number;
};
