import logging
from datetime import datetime, timedelta
import calendar
from growwapi import GrowwAPI

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ShoonyaService:
    """
    Service class for interacting with the Groww API.
    Note: Keeping the name ShoonyaService to maintain compatibility with existing imports.
    """
    def __init__(self, access_token):
        self.api = None
        self.token = access_token
        self.is_logged_in = False
        self.connect()

    def connect(self):
        try:
            # Initialize Groww API with the provided token
            self.api = GrowwAPI(self.token)
            self.is_logged_in = True
            logger.info("Successfully initialized GrowwAPI with token.")
        except Exception as e:
            logger.error(f"Failed to initialize GrowwAPI: {e}")
            self.is_logged_in = False

    def get_expiry_dates(self, symbol):
        """
        Generates the next 4 Thursday expiry dates for NSE indices.
        Since the Groww API documentation provided doesn't specify an expiry list endpoint,
        we generate these programmatically.
        """
        if not self.is_logged_in:
            logger.error("Not logged in to Groww API")
            return []

        try:
            expiries = []
            today = datetime.now()
            
            # Find the next Thursday (weekday 3 in Python's weekday(), where Monday is 0)
            days_until_thursday = (3 - today.weekday() + 7) % 7
            
            # If today is Thursday, but past market hours (approx 3:30 PM), move to next week
            if days_until_thursday == 0 and today.hour >= 16:
                days_until_thursday = 7
                
            next_thursday = today + timedelta(days=days_until_thursday)
            
            for i in range(4):
                expiry = next_thursday + timedelta(weeks=i)
                expiries.append(expiry.strftime("%Y-%m-%d"))
            
            logger.info(f"Generated expiry dates for {symbol}: {expiries}")
            return expiries
        except Exception as e:
            logger.error(f"Error generating expiry dates: {e}")
            return []

    def get_option_chain(self, symbol, expiry):
        if not self.is_logged_in:
            raise Exception("Not logged in to Groww API")

        # Normalize symbol (Groww expects "NIFTY", not "NIFTY 50")
        search_symbol = symbol.upper().replace(" ", "")
        if search_symbol == "NIFTY50":
            search_symbol = "NIFTY"

        try:
            logger.info(f"Fetching option chain for {search_symbol} on {expiry}")
            # Use the method exactly as shown in the Groww documentation
            response = self.api.get_option_chain(
                exchange="NSE",
                underlying=search_symbol,
                expiry_date=expiry
            )
            
            # Check if response contains the expected 'strikes' key
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
                logger.error(f"Invalid response format from Groww: {response}")
                return []
        except Exception as e:
            logger.error(f"Exception in get_option_chain: {e}")
            return []

    def get_last_price(self, symbol):
        if not self.is_logged_in:
            return None
        
        # Format for get_ltp: "NSE_NIFTY"
        search_symbol = symbol.upper().replace(" ", "")
        if search_symbol == "NIFTY50":
            search_symbol = "NIFTY"
            
        formatted_symbol = f"NSE_{search_symbol}"
        try:
            logger.info(f"Fetching LTP for {formatted_symbol}")
            response = self.api.get_ltp(
                segment="CASH",
                exchange_trading_symbols=formatted_symbol
            )
            # The response is usually a dict: {"NSE_NIFTY": 22000.50}
            return response.get(formatted_symbol)
        except Exception as e:
            logger.error(f"Error fetching LTP: {e}")
            return None
