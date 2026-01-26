import { NextRequest, NextResponse } from 'next/server';
const KiteConnect = require('kiteconnect');

export function GET(request: NextRequest) {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    throw new Error('KITE_API_KEY is not defined in environment variables.');
  }

  const kc = new KiteConnect({
    api_key: apiKey,
  });

  const loginUrl = kc.getLoginURL();

  return NextResponse.redirect(loginUrl);
}
