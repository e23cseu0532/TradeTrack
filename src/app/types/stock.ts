export type StockData = {
  [key: string]: {
    currentPrice?: number;
    high?: number;
    low?: number;
    loading: boolean;
    error?: boolean;
  };
};

export type FinancialData = {
  marketCap?: number;
  peRatio?: number;
  eps?: number;
  dividendYield?: number;
  fourWeekHigh?: number;
  fourWeekLow?: number;
};
