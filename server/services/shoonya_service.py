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
        
        # Initialize Groww API SDK
        try:
            self.api = GrowwAPI(self.api_token)
            logger.info("GrowwAPI SDK initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize GrowwAPI SDK: {e}")
            # We continue because some methods might use direct requests
            self.api = None

    def get_expiry_dates(self, symbol):
        """
        Fetches available expiry dates for a given underlying symbol.
        Uses the Groww internal API endpoint.
        """
        # Map common names to Groww's expected lowercase slugs
        symbol_map = {
            "NIFTY": "nifty",
            "NIFTY 50": "nifty",
            "BANKNIFTY": "banknifty",
            "FINNIFTY": "finnifty",
            "MIDCPNIFTY": "midcpnifty"
        }
        
        search_symbol = symbol_map.get(symbol.upper(), symbol.lower().replace(" ", ""))
        url = f"https://api.groww.in/v1/api/v1/option_chain/{search_symbol}"
        
        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
            "X-API-VERSION": "1.0"
        }
        
        try:
            logger.info(f"Fetching expiry dates for {symbol} (slug: {search_symbol}) from {url}")
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                # The response structure: { "optionChains": [ {"expiryDate": "2024-05-30", ...}, ... ] }
                if "optionChains" in data:
                    expiries = [oc["expiryDate"] for oc in data["optionChains"]]
                    logger.info(f"Successfully found {len(expiries)} expiries for {symbol}")
                    return sorted(list(set(expiries)))
                else:
                    logger.warning(f"Response received but 'optionChains' key missing for {symbol}")
                    return []
            else:
                logger.error(f"Groww API error {response.status_code}: {response.text}")
                return []
        except Exception as e:
            logger.error(f"Exception during Groww expiry fetch: {str(e)}")
            return []

    def get_option_chain(self, symbol, expiry_date):
        """
        Fetches the option chain for a symbol and expiry date using the SDK.
        """
        if not self.api:
            logger.error("GrowwAPI SDK not initialized")
            return None

        try:
            # The SDK expects "NIFTY" (uppercase) for the underlying
            underlying = symbol.upper().replace(" ", "")
            if underlying == "NIFTY50": underlying = "NIFTY"
            
            logger.info(f"Fetching option chain for {underlying} with expiry {expiry_date}")
            
            response = self.api.get_option_chain(
                exchange="NSE",
                underlying=underlying,
                expiry_date=expiry_date
            )
            return response
        except Exception as e:
            logger.error(f"Error fetching option chain via SDK: {str(e)}")
            return None

    def get_ltp(self, symbol):
        """
        Fetch Last Traded Price for a symbol using the SDK.
        """
        if not self.api:
            return None
            
        try:
            # Map symbol for LTP
            clean_symbol = symbol.upper().replace(" ", "")
            if clean_symbol == "NIFTY50": clean_symbol = "NIFTY"
            
            search_symbol = f"NSE_{clean_symbol}"
            response = self.api.get_ltp(
                segment="CASH",
                exchange_trading_symbols=search_symbol
            )
            return response.get(search_symbol)
        except Exception as e:
            logger.error(f"Error fetching LTP for {symbol}: {str(e)}")
            return None

# Alias for compatibility with existing imports in the rest of the project
class ShoonyaService(GrowwService):
    pass
