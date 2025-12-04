import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public routes that don't require authentication
const publicRoutes = ['/login', '/auth/callback'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check if it's a public route
  const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route));

  // For public routes, allow access
  if (isPublicRoute) {
    return NextResponse.next();
  }

  // For protected routes, check for access token
  // Note: This is a simple check - the actual token validation happens on the backend
  // The middleware just ensures users are redirected to login if no token exists
  const accessToken = request.cookies.get('cryptarena_access_token')?.value;
  
  // Also check localStorage via a custom header (set by the client)
  // Since middleware runs on the edge and can't access localStorage,
  // we rely on the client-side auth check for the actual protection
  
  // For now, we'll allow the request and let the client-side AuthProvider handle redirects
  // This is because localStorage tokens can't be read in middleware
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public assets
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg$|.*\\.png$|.*\\.jpg$|.*\\.jpeg$|.*\\.gif$|.*\\.webp$).*)',
  ],
};

