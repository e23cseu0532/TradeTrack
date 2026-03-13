
import os
import requests
import logging
from growwapi import GrowwAPI

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class GrowwService:
    def __init__(self):
        self.api_token = os.getenv("GROWW_API_TOKEN")
        if not self.api_token:
            logger.error("GROWW_API_TOKEN not found in environment variables")
            raise ValueError("GROWW_API_TOKEN is missing")
        
        self.api = GrowwAPI(self.api_token)
        logger.info("GrowwAPI initialized successfully")

    def get_expiry_dates(self, symbol):
        """
        Fetches available expiry dates for a given underlying symbol.
        """
        # Normalize symbol for Groww
        if symbol == "NIFTY 50":
            symbol = "NIFTY"
        
        # Groww API endpoint for expiries
        url = f"https://api.groww.in/v1/option-chain/exchange/NSE/underlying/{symbol}/expiries"
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }
        
        try:
            logger.info(f"Fetching expiry dates for {symbol} from {url}")
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                # The API typically returns an object with an 'expiries' list
                expiries = data.get('expiries', [])
                if not expiries:
                    logger.warning(f"No expiries found in response for {symbol}")
                return expiries
            else:
                logger.error(f"Error {response.status_code} fetching expiries: {response.text}")
                return []
        except Exception as e:
            logger.error(f"Exception during expiry fetch: {str(e)}")
            return []

    def get_option_chain(self, symbol, expiry_date=None):
        """
        Fetches the option chain for a symbol and expiry date.
        If no expiry_date is provided, it fetches the first available one.
        """
        if symbol == "NIFTY 50":
            symbol = "NIFTY"
            
        if not expiry_date:
            expiries = self.get_expiry_dates(symbol)
            if not expiries:
                raise Exception(f"NO_EXPIRIES_FOUND: Broker returned 0 expiry dates for {symbol}. Check token permissions.")
            expiry_date = expiries[0]
            
        try:
            logger.info(f"Fetching option chain for {symbol} with expiry {expiry_date}")
            response = self.api.get_option_chain(
                exchange="NSE",
                underlying=symbol,
                expiry_date=expiry_date
            )
            return response
        except Exception as e:
            logger.error(f"Error fetching option chain: {str(e)}")
            return None

    def get_ltp(self, symbol):
        """
        Fetch Last Traded Price for a symbol.
        """
        # Groww expects prefix for get_ltp
        search_symbol = symbol
        if symbol == "NIFTY" or symbol == "NIFTY 50":
            search_symbol = "NSE_NIFTY"
        elif not symbol.startswith("NSE_"):
            search_symbol = f"NSE_{symbol}"
            
        try:
            response = self.api.get_ltp(
                segment="CASH",
                exchange_trading_symbols=search_symbol
            )
            return response.get(search_symbol)
        except Exception as e:
            logger.error(f"Error fetching LTP for {symbol}: {str(e)}")
            return None

# For backward compatibility with existing imports if needed
class ShoonyaService(GrowwService):
    pass
