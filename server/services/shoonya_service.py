
import logging
import requests
from growwapi import GrowwAPI

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ShoonyaService:
    """
    Wrapper for GrowwAPI to maintain compatibility with existing code.
    Actually uses the growwapi library.
    """
    def __init__(self, api_token):
        self.api_token = api_token
        self.api = None
        self.base_url = "https://api.groww.in/v1/option-chain"
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "X-API-VERSION": "1.0",
            "Accept": "application/json"
        }
        self.connect()

    def connect(self):
        try:
            # Initialize the GrowwAPI from the provided SDK
            self.api = GrowwAPI(self.api_token)
            logger.info("GrowwAPI initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize GrowwAPI: {e}")
            self.api = None

    def get_expiry_dates(self, symbol):
        """
        Fetches expiry dates for a given symbol.
        """
        # Normalize symbol for Groww
        search_symbol = "NIFTY" if "NIFTY" in symbol.upper() else symbol.upper()
        
        # Endpoint based on documentation patterns
        url = f"{self.base_url}/exchange/NSE/underlying/{search_symbol}/expiry"
        
        try:
            logger.info(f"Fetching expiries from: {url}")
            response = requests.get(url, headers=self.headers)
            
            if response.status_code != 200:
                logger.error(f"Error fetching expiries: {response.status_code} - {response.text}")
                return None
                
            data = response.json()
            # Handle potential Groww response formats
            if "payload" in data and "expiries" in data["payload"]:
                return data["payload"]["expiries"]
            elif "expiries" in data:
                return data["expiries"]
            elif isinstance(data, list):
                return data
                
            logger.error(f"Unexpected response format for expiries: {data}")
            return None
        except Exception as e:
            logger.error(f"Exception in get_expiry_dates: {e}")
            return None

    def get_option_chain(self, symbol, expiry):
        """
        Fetches the option chain for a specific expiry.
        """
        search_symbol = "NIFTY" if "NIFTY" in symbol.upper() else symbol.upper()
        
        try:
            # Using the SDK method as per documentation
            chain = self.api.get_option_chain(
                exchange="NSE",
                underlying=search_symbol,
                expiry_date=expiry
            )
            
            if not chain or 'strikes' not in chain:
                # Try direct REST if SDK fails
                url = f"{self.base_url}/exchange/NSE/underlying/{search_symbol}?expiry_date={expiry}"
                response = requests.get(url, headers=self.headers)
                if response.status_code == 200:
                    data = response.json()
                    return data.get("payload", data)
                return None
                
            return chain
        except Exception as e:
            logger.error(f"Error fetching option chain: {e}")
            return None

    def get_last_price(self, symbol, exchange='NSE'):
        """
        Fetches the Last Traded Price (LTP).
        """
        try:
            # Normalize symbol for LTP
            # If it's an index like NIFTY, it often needs a prefix or specific name
            formatted_symbol = f"{exchange}_{symbol.replace(' ', '_')}"
            
            # Using the SDK method as per documentation
            ltp_data = self.api.get_ltp(
                segment="CASH",
                exchange_trading_symbols=formatted_symbol
            )
            
            if ltp_data and formatted_symbol in ltp_data:
                return ltp_data[formatted_symbol]
            return None
        except Exception as e:
            logger.error(f"Error fetching LTP: {e}")
            return None
