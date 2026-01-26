import { NextRequest, NextResponse } from 'next/server';
const { KiteConnect } = require('kiteconnect');
import { setCookie } from 'cookies-next';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestToken = searchParams.get('request_token');

  if (!requestToken) {
    return NextResponse.redirect(new URL('/option-chain?error=Request token not found.', request.url));
  }

  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;

  if (!apiKey || !apiSecret) {
    return NextResponse.redirect(new URL('/option-chain?error=API key or secret not configured.', request.url));
  }
  
  try {
    const kc = new KiteConnect({ api_key: apiKey });
    const session = await kc.generateSession(requestToken, apiSecret);

    const response = NextResponse.redirect(new URL('/option-chain', request.url));
    
    // Set access token in a secure, httpOnly cookie
    setCookie('kite_access_token', session.access_token, {
        req: request,
        res: response,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 8, // 8 hours
        path: '/',
    });

    return response;

  } catch (error: any) {
    console.error('Kite Connect session generation error:', error);
    const errorMessage = error.message || 'An unknown error occurred during authentication.';
    return NextResponse.redirect(new URL(`/option-chain?error=${encodeURIComponent(errorMessage)}`, request.url));
  }
}
