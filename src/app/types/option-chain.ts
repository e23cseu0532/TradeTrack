
export interface OptionDataPoint {
  strikePrice: number;
  ltp: number;
  iv: number;
  oi: number;
  change?: number;
  pchange?: number;
}

export interface OptionChainSnapshot {
  timestamp: string;
  underlyingValue: number;
  calls: OptionDataPoint[];
  puts: OptionDataPoint[];
}

/** 
 * Structure representing the YH Finance RapidAPI Response 
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
          contractSymbol?: string;
          currency?: string;
        }>;
        puts: Array<{
          strike: number;
          lastPrice: number;
          impliedVolatility: number;
          openInterest: number;
          change: number;
          percentChange: number;
          contractSymbol?: string;
          currency?: string;
        }>;
      }>;
      quote: {
        regularMarketPrice: number;
        regularMarketChange: number;
        regularMarketChangePercent: number;
      };
    }>;
  };
}
