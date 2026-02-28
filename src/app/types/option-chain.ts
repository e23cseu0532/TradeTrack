
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
 * Structure representing the typical NSE RapidAPI Response 
 */
export interface RapidAPINSEResponse {
  records: {
    expiryDates: string[];
    data: Array<{
      strikePrice: number;
      expiryDate: string;
      CE?: {
        strikePrice: number;
        expiryDate: string;
        underlying: string;
        identifier: string;
        openInterest: number;
        changeinOpenInterest: number;
        pchangeinOpenInterest: number;
        totalTradedVolume: number;
        impliedVolatility: number;
        lastPrice: number;
        change: number;
        pChange: number;
        totalBuyQuantity: number;
        totalSellQuantity: number;
        bidQty: number;
        bidprice: number;
        askQty: number;
        askPrice: number;
        underlyingValue: number;
      };
      PE?: {
        strikePrice: number;
        expiryDate: string;
        underlying: string;
        identifier: string;
        openInterest: number;
        changeinOpenInterest: number;
        pchangeinOpenInterest: number;
        totalTradedVolume: number;
        impliedVolatility: number;
        lastPrice: number;
        change: number;
        pChange: number;
        totalBuyQuantity: number;
        totalSellQuantity: number;
        bidQty: number;
        bidprice: number;
        askQty: number;
        askPrice: number;
        underlyingValue: number;
      };
    }>;
    timestamp: string;
    underlyingValue: number;
    strikePrices: number[];
  };
}
