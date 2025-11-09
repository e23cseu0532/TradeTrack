export type StockData = {
  [key: string]: {
    currentPrice?: number;
    high?: number;
    low?: number;
    loading: boolean;
    error?: boolean;
  };
};
