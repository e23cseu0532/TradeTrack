
import logging
import requests
from growwapi import GrowwAPI

logger = logging.getLogger(__name__)

class ShoonyaService:
    """
    Service class for interacting with the Groww API.
    Note: Renamed from Shoonya to maintain compatibility with existing imports
    while switching the underlying implementation to Groww.
    """
    def __init__(self, api_key):
        self.api_key = api_key
        # Initialize the Groww SDK
        self.api = GrowwAPI(api_key)
        # Map common names to Groww's expected lowercase slugs for URLs
        self.symbol_map = {
            "NIFTY 50": "nifty",
            "NIFTY BANK": "banknifty",
            "FINNIFTY": "finnifty",
            "MIDCPNIFTY": "midcpnifty"
        }

    def get_expiry_dates(self, symbol):
        """
        Fetches available expiry dates for a given underlying symbol.
        """
        # Normalize symbol for Groww's URL structure
        search_symbol = self.symbol_map.get(symbol.upper(), symbol.replace(" ", "").lower())
        
        # Groww endpoint for expiries
        url = f"https://api.groww.in/v1/option-chain/v1/option_chain/{search_symbol}/expiry"
        
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "X-API-VERSION": "1.0",
            "Accept": "application/json"
        }
        
        try:
            logger.info(f"Fetching expiries for {symbol} from {url}")
            response = requests.get(url, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"Groww API error: {response.status_code} - {response.text}")
                return None
                
            data = response.json()
            
            # Groww usually returns a list of strings or an object with an 'expiries' key
            expiries = data.get('expiries', data) if isinstance(data, dict) else data
            
            if not expiries or not isinstance(expiries, list):
                logger.error(f"No expiries found in response for {symbol}")
                return None
                
            return expiries
        except Exception as e:
            logger.error(f"Exception fetching expiries: {str(e)}")
            return None

    def get_option_chain(self, symbol, expiry):
        """
        Fetches the complete option chain for a specific expiry date.
        """
        try:
            # Normalize underlying for the SDK (e.g., "NIFTY", "BANKNIFTY")
            underlying = symbol.upper().replace(" ", "")
            if underlying == "NIFTY50": underlying = "NIFTY"
            
            logger.info(f"Fetching option chain for {underlying} on {expiry}")
            
            # Use the SDK method as per documentation
            chain = self.api.get_option_chain(
                exchange="NSE",
                underlying=underlying,
                expiry_date=expiry
            )
            
            if not chain or 'strikes' not in chain:
                logger.error(f"Invalid or empty option chain response for {symbol}")
                return None
                
            # Process the response to match the application's internal format
            processed_chain = []
            for strike_price, data in chain['strikes'].items():
                ce = data.get('CE', {})
                pe = data.get('PE', {})
                
                processed_chain.append({
                    'strikePrice': float(strike_price),
                    'call_lp': ce.get('ltp', 0),
                    'call_oi': ce.get('open_interest', 0),
                    'call_iv': ce.get('greeks', {}).get('iv', 0),
                    'put_lp': pe.get('ltp', 0),
                    'put_oi': pe.get('open_interest', 0),
                    'put_iv': pe.get('greeks', {}).get('iv', 0),
                })
            
            return {
                'underlying_price': chain.get('underlying_ltp', 0),
                'strikes': processed_chain
            }
        except Exception as e:
            logger.error(f"Error fetching option chain: {str(e)}")
            return None
    