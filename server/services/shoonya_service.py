
import logging
from datetime import datetime, timedelta
from growwapi import GrowwAPI

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ShoonyaService:
    """
    Service class for interacting with the Groww API.
    Named ShoonyaService to maintain compatibility with existing imports.
    """
    def __init__(self, access_token):
        self.api = None
        self.token = access_token
        self.is_logged_in = False
        self.connect()

    def connect(self):
        try:
            # Initialize Groww API with the provided token
            # Note: Ensure the 'growwapi' package is installed via pip
            self.api = GrowwAPI(self.token)
            self.is_logged_in = True
            logger.info("Successfully initialized GrowwAPI with token.")
        except Exception as e:
            logger.error(f"Failed to initialize GrowwAPI: {e}")
            self.is_logged_in = False

    def get_expiry_dates(self, symbol):
        """
        Generates the next 4 Thursdays as expiry dates.
        Groww API doesn't seem to have a specific endpoint for listing all expiries.
        """
        if not self.is_logged_in:
            return []

        search_symbol = "NIFTY" if "NIFTY" in symbol.upper() else symbol.upper()
        
        try:
            logger.info(f"Generating fallback expiries for {search_symbol}")
            
            expiries = []
            today = datetime.now()
            # Find the next Thursday (weekday 3)
            days_until_thursday = (3 - today.weekday() + 7) % 7
            
            # If today is Thursday, move to next week if after market hours
            if days_until_thursday == 0 and today.hour >= 16:
                days_until_thursday = 7
                
            next_thursday = today + timedelta(days=days_until_thursday)
            
            for i in range(4):
                expiry = next_thursday + timedelta(weeks=i)
                expiries.append(expiry.strftime("%Y-%m-%d"))
            
            return expiries

        except Exception as e:
            logger.error(f"Error in get_expiry_dates: {e}")
            return []

    def get_option_chain(self, symbol, expiry):
        if not self.is_logged_in:
            raise Exception("Not logged in to Groww API")

        search_symbol = "NIFTY" if "NIFTY" in symbol.upper() else symbol.upper()
        
        try:
            logger.info(f"Fetching option chain for {search_symbol} on {expiry}")
            # Method from Groww SDK documentation
            response = self.api.get_option_chain(
                exchange="NSE",
                underlying=search_symbol,
                expiry_date=expiry
            )
            
            if response and "strikes" in response:
                chain = []
                for strike_price, data in response["strikes"].items():
                    chain.append({
                        "strikePrice": float(strike_price),
                        "ce_ltp": data.get("CE", {}).get("ltp", 0),
                        "ce_oi": data.get("CE", {}).get("open_interest", 0),
                        "pe_ltp": data.get("PE", {}).get("ltp", 0),
                        "pe_oi": data.get("PE", {}).get("open_interest", 0),
                    })
                return chain
            else:
                logger.error(f"Invalid response from get_option_chain: {response}")
                return []
        except Exception as e:
            logger.error(f"Exception in get_option_chain: {e}")
            return []

    def get_last_price(self, symbol):
        if not self.is_logged_in:
            return None
        
        # Format for get_ltp: "NSE_NIFTY"
        formatted_symbol = f"NSE_{symbol.upper().replace(' ', '_')}"
        try:
            logger.info(f"Fetching LTP for {formatted_symbol}")
            response = self.api.get_ltp(
                segment="CASH",
                exchange_trading_symbols=formatted_symbol
            )
            return response.get(formatted_symbol)
        except Exception as e:
            logger.error(f"Error fetching LTP: {e}")
            return None
