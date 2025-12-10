import { NextRequest, NextResponse } from 'next/server';

const CMC_API_KEY = process.env.CMC_API_KEY || '';
const CMC_API_URL = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const ids = searchParams.get('ids');

  if (!ids) {
    return NextResponse.json({ error: 'Missing ids parameter' }, { status: 400 });
  }

  try {
    const response = await fetch(`${CMC_API_URL}?id=${ids}`, {
      headers: {
        'X-CMC_PRO_API_KEY': CMC_API_KEY,
        'Accept': 'application/json',
      },
      next: { revalidate: 30 }, // Cache for 30 seconds
    });

    if (!response.ok) {
      console.error('CMC API error:', response.status, await response.text());
      return NextResponse.json({ error: 'CMC API error' }, { status: response.status });
    }

    const data = await response.json();
    
    // Extract prices from CMC response
    const prices: Record<number, number> = {};
    
    if (data.data) {
      for (const [cmcId, tokenData] of Object.entries(data.data)) {
        const price = (tokenData as any)?.quote?.USD?.price;
        if (price !== undefined) {
          prices[parseInt(cmcId)] = price;
        }
      }
    }

    return NextResponse.json({ 
      prices,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('CMC fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
  }
}
