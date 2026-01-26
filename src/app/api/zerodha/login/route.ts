import { NextRequest, NextResponse } from 'next/server';
const KiteConnect = require('kiteconnect');

export function GET(request: NextRequest) {
  const apiKey = process.env.KITE_API_KEY;

  if (!apiKey || apiKey === 'YOUR_API_KEY') {
    const errorBody = {
        error: "Kite API Key is not configured.",
        message: "Please make sure you have created a .env.local file and added your KITE_API_KEY from the Zerodha developer portal."
    };
    return NextResponse.json(errorBody, { status: 500 });
  }

  try {
    const kc = new KiteConnect({
      api_key: apiKey,
    });

    const loginUrl = kc.getLoginURL();
    return NextResponse.redirect(loginUrl);

  } catch (error: any) {
    console.error("[KITE LOGIN ERROR]", error);
    const errorBody = {
        error: "An unexpected error occurred while generating the login URL.",
        message: error.message
    };
    return NextResponse.json(errorBody, { status: 500 });
  }
}
