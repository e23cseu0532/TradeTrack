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
            raise Exception("NOT_LOGGED_IN: Please login to Shoonya first.")

        # Shoonya expects "NIFTY" for NFO but sometimes "Nifty 50" for NSE
        search_symbol = symbol
        if symbol == "NIFTY" and exchange == "NFO":
            search_symbol = "NIFTY"
        
        try:
            logger.info(f"Fetching expiries for {exchange}:{search_symbol}")
            expiries = self.api.get_expiry_date(exchange, search_symbol)
            
            if not expiries:
                logger.error(f"No expiries found for {exchange}:{search_symbol}. Response: {expiries}")
                raise Exception(f"NO_EXPIRIES_FOUND: Broker returned no expiry dates for {search_symbol} on {exchange}. Check if the symbol is correct or if the session is valid.")
            
            return expiries
        except Exception as e:
            logger.error(f"Error fetching expiries for {search_symbol}: {e}")
            raise e

    async def get_option_chain(self, symbol: str, exchange: str = 'NFO') -> List[OptionData]:
        try:
            # For NIFTY, we need to get the spot price from NSE index
            spot_symbol = "Nifty 50" if symbol == "NIFTY" else symbol
            spot_exchange = "NSE" if symbol == "NIFTY" else exchange
            
            quotes = self.api.get_quotes(spot_exchange, spot_symbol)
            if not quotes or quotes.get('stat') != 'Ok':
                raise Exception(f"Could not fetch spot price for {spot_symbol}")
            
            lp = float(quotes.get('lp', 0))
            expiries = self.get_expiries(exchange, symbol)
            
            if not expiries:
                return []

            # Get the nearest expiry
            expiry = expiries[0]
            
            # Fetch option chain for the expiry
            # This is a simplified version, in a real app you'd fetch specific strikes
            # around the current spot price
            chain = []
            # Logic to fetch and parse option chain would go here
            # For now returning empty list or mock data to avoid crash
            return chain
            
        except Exception as e:
            logger.error(f"Error in get_option_chain: {e}")
            raise e

shoonya_service = ShoonyaService()