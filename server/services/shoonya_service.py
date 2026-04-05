import logging
from datetime import datetime, timedelta

try:
    from growwapi import GrowwAPI
except ImportError:
    # Placeholder for environment where SDK might not be installed yet
    class GrowwAPI:
        def __init__(self, token): pass
        def get_option_chain(self, **kwargs): return {}
        def get_ltp(self, **kwargs): return {}

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ShoonyaService:
    """
    Wrapper for GrowwAPI. 
    Class name 'ShoonyaService' is retained for compatibility with existing imports.
    """
    def __init__(self, access_token):
        self.api = None
        self.token = access_token
        self.is_logged_in = False
        self.connect()

    def connect(self):
        if not self.token or self.token == "your_token" or self.token == "your_token_here":
            logger.warning("No valid Groww API token provided in environment variables.")
            return
        try:
            self.api = GrowwAPI(self.token)
            self.is_logged_in = True
            logger.info("Successfully initialized GrowwAPI.")
        except Exception as e:
            logger.error(f"Failed to initialize GrowwAPI: {e}")
            self.is_logged_in = False

    def get_expiry_dates(self, symbol):
        """
        Generates the next 4 Thursdays as a fallback for NSE indices.
        """
        expiries = []
        today = datetime.now()
        # Find the next Thursday (3 is Thursday in Python's weekday(), Monday is 0)
        days_until_thursday = (3 - today.weekday() + 7) % 7
        
        # If today is Thursday but market is closed, move to next week
        if days_until_thursday == 0 and today.hour >= 16:
            days_until_thursday = 7
        
        next_thursday = today + timedelta(days=days_until_thursday)
        
        for i in range(4):
            expiry = next_thursday + timedelta(weeks=i)
            expiries.append(expiry.strftime("%Y-%m-%d"))
            
        logger.info(f"Generated expiries for {symbol}: {expiries}")
        return expiries

    def get_option_chain(self, symbol, expiry):
        if not self.is_logged_in:
            return {"error": "Not authenticated with Groww API"}

        # Normalize symbol for Groww (e.g., NIFTY 50 -> NIFTY)
        search_symbol = "NIFTY" if "NIFTY" in symbol.upper() else symbol.upper()
        
        try:
            logger.info(f"Fetching option chain for {search_symbol} on {expiry}")
            response = self.api.get_option_chain(
                exchange="NSE",
                underlying=search_symbol,
                expiry_date=expiry
            )
            
            # Map Groww response to the format expected by the frontend
            if response and "strikes" in response:
                formatted_strikes = []
                for strike, data in response["strikes"].items():
                    formatted_strikes.append({
                        "strikePrice": float(strike),
                        "ce_ltp": data.get("CE", {}).get("ltp", 0),
                        "ce_oi": data.get("CE", {}).get("open_interest", 0),
                        "pe_ltp": data.get("PE", {}).get("ltp", 0),
                        "pe_oi": data.get("PE", {}).get("open_interest", 0),
                    })
                return {
                    "underlying_ltp": response.get("underlying_ltp"), 
                    "strikes": formatted_strikes
                }
            return response
        except Exception as e:
            logger.error(f"Groww get_option_chain Error: {e}")
            return {"error": str(e)}

    def get_last_price(self, symbol):
        if not self.is_logged_in:
            return None
        
        # Groww expects symbols like "NSE_NIFTY"
        clean_symbol = symbol.upper().replace(" ", "_")
        formatted_symbol = f"NSE_{clean_symbol}" if not clean_symbol.startswith("NSE_") else clean_symbol
        
        try:
            logger.info(f"Fetching LTP for {formatted_symbol}")
            response = self.api.get_ltp(
                segment="CASH",
                exchange_trading_symbols=formatted_symbol
            )
            return response.get(formatted_symbol)
        except Exception as e:
            logger.error(f"Groww get_ltp Error: {e}")
            return None
