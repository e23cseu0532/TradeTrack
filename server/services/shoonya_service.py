import logging
from typing import List, Dict, Any, Optional
from NorenRestApiPy.NorenApi import NorenApi
from app.models.option_chain import OptionData
from datetime import datetime
import os

logger = logging.getLogger(__name__)

class NorenApiProxy(NorenApi):
    def __init__(self, *args, **kwargs):
        super(NorenApiProxy, self).__init__(*args, **kwargs)

class ShoonyaService:
    def __init__(self):
        self.api = NorenApiProxy(host='https://api.shoonya.com/NorenWWS/', websocket='wss://api.shoonya.com/NorenWWS/')
        self.is_logged_in = False

    def login(self, userid, password, dob, vendor_code, api_key, imei):
        try:
            res = self.api.login(userid=userid, password=password, dob=dob, 
                               vendor_code=vendor_code, api_key=api_key, imei=imei)
            if res and res.get('stat') == 'Ok':
                self.is_logged_in = True
                logger.info(f"Successfully logged in to Shoonya for user {userid}")
                return res
            else:
                logger.error(f"Failed to login to Shoonya: {res}")
                return None
        except Exception as e:
            logger.error(f"Exception during Shoonya login: {e}")
            return None

    def get_expiries(self, exchange: str, symbol: str) -> List[str]:
        """Fetch available expiry dates for a symbol."""
        if not self.is_logged_in:
            logger.error("Attempted to get expiries without being logged in.")
            raise Exception("NOT_LOGGED_IN: Please login to Shoonya first.")

        # Normalize symbol for NFO search
        # Shoonya expects "NIFTY" for Nifty 50 options, "BANKNIFTY" for Nifty Bank options
        search_symbol = symbol.upper()
        if search_symbol in ["NIFTY 50", "NSEI", "^NSEI"]:
            search_symbol = "NIFTY"
        elif search_symbol in ["NIFTY BANK", "BANKNIFTY", "^NSEBANK"]:
            search_symbol = "BANKNIFTY"
        
        try:
            logger.info(f"Requesting expiries for Exchange: {exchange}, Symbol: {search_symbol}")
            # get_expiry_date expects 'exch' and 'searchtext'
            expiries = self.api.get_expiry_date(exch=exchange, searchtext=search_symbol)
            logger.info(f"Raw expiry response for {search_symbol}: {expiries}")
            
            if not expiries:
                raise Exception(f"NO_EXPIRIES_FOUND: No response from broker for {search_symbol} on {exchange}")
            
            if isinstance(expiries, dict):
                if expiries.get('stat') != 'Ok':
                    error_msg = expiries.get('emsg', 'Unknown error')
                    raise Exception(f"NO_EXPIRIES_FOUND: {error_msg}")
                return expiries.get('values', [])
                
            if isinstance(expiries, list):
                # Filter out any error messages that might be in the list
                return [e for e in expiries if isinstance(e, str)]

            raise Exception(f"NO_EXPIRIES_FOUND: Unexpected response format: {type(expiries)}")
            
        except Exception as e:
            logger.error(f"Error in get_expiries for {symbol}: {str(e)}")
            raise e

    async def get_option_chain(self, symbol: str, exchange: str = 'NFO') -> List[OptionData]:
        try:
            # Map input symbol to the correct spot symbol and search symbol
            norm_symbol = symbol.upper()
            if norm_symbol in ["NIFTY", "NSEI", "^NSEI", "NIFTY 50"]:
                spot_symbol = "Nifty 50"
                spot_exchange = "NSE"
                search_symbol = "NIFTY"
            elif norm_symbol in ["BANKNIFTY", "NIFTY BANK", "^NSEBANK"]:
                spot_symbol = "Nifty Bank"
                spot_exchange = "NSE"
                search_symbol = "BANKNIFTY"
            else:
                spot_symbol = symbol
                spot_exchange = "NSE"
                search_symbol = symbol
            
            logger.info(f"Fetching quotes for spot: {spot_exchange}:{spot_symbol}")
            quotes = self.api.get_quotes(spot_exchange, spot_symbol)
            
            if not quotes or quotes.get('stat') != 'Ok':
                logger.error(f"Could not fetch spot price for {spot_symbol}: {quotes}")
                # Fallback if spot is not found, continue to try getting expiries
                lp = 0
            else:
                lp = float(quotes.get('lp', 0))
            
            # Use the normalized search_symbol for expiries
            expiries = self.get_expiries(exchange, search_symbol)
            
            if not expiries:
                return []

            # Get the nearest expiry
            expiry = expiries[0]
            logger.info(f"Using expiry: {expiry} for {search_symbol}")
            
            # Logic to fetch and parse option chain would go here
            # (Keeping existing placeholder logic for now)
            chain = []
            return chain
            
        except Exception as e:
            logger.error(f"Error in get_option_chain: {e}")
            raise e

shoonya_service = ShoonyaService()