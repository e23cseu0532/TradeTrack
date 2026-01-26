import { NextRequest, NextResponse } from 'next/server';
import { setCookie } from 'cookies-next';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestToken = searchParams.get('request_token');
  const baseUrl = request.nextUrl.origin;


  if (!requestToken) {
    return NextResponse.redirect(`${baseUrl}/option-chain?error=Request%20token%20not%20found.`);
  }

  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;

  if (!apiKey || apiKey === 'YOUR_API_KEY' || !apiSecret || apiSecret === 'YOUR_API_SECRET') {
    const errorMessage = "API key or secret not configured. Please add your credentials to the .env.local file.";
    return NextResponse.redirect(`${baseUrl}/option-chain?error=${encodeURIComponent(errorMessage)}`);
  }
  
  try {
    const KiteConnect = require('kiteconnect');
    const kc = new KiteConnect({ api_key: apiKey });
    const session = await kc.generateSession(requestToken, apiSecret);

    const response = NextResponse.redirect(`${baseUrl}/option-chain`);
    
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
    return NextResponse.redirect(`${baseUrl}/option-chain?error=${encodeURIComponent(errorMessage)}`);
  }
}
