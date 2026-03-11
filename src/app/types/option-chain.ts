
export interface OptionDataPoint {
  strikePrice: number;
  ltp: number;
  iv: number;
  oi: number;
  volume?: number;
  change?: number;
  pchange?: number;
}

/**
 * Format provided by user's Groww API documentation
 */
export interface GrowwGreekData {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  iv: number;
}

export interface GrowwOptionDetail {
  greeks: GrowwGreekData;
  trading_symbol: string;
  ltp: number;
  open_interest: number;
  volume: number;
}

export interface GrowwStrikeData {
  CE: GrowwOptionDetail;
  PE: GrowwOptionDetail;
}

export interface GrowwOptionChainResponse {
  underlying_ltp: number;
  strikes: {
    [strike: string]: GrowwStrikeData;
  };
  available_expiries?: string[];
  expiry_date?: string;
}

/** 
 * Legacy structure for RapidAPI (kept for compatibility)
 */
export interface RapidAPINSEResponse {
  optionChain: {
    result: Array<{
      underlyingSymbol: string;
      expirationDates: number[];
      strikes: number[];
      options: Array<{
        expirationDate: number;
        hasMiniOptions: boolean;
        calls: Array<{
          strike: number;
          lastPrice: number;
          impliedVolatility: number;
          openInterest: number;
          change: number;
          percentChange: number;
        }>;
        puts: Array<{
          strike: number;
          lastPrice: number;
          impliedVolatility: number;
          openInterest: number;
          change: number;
          percentChange: number;
        }>;
      }>;
      quote: {
        regularMarketPrice: number;
      };
    }>;
  };
}
