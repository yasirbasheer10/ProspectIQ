import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const isAuthPage = req.nextUrl.pathname.startsWith('/login') || 
                       req.nextUrl.pathname.startsWith('/signup') ||
                       req.nextUrl.pathname.startsWith('/forgot-password') ||
                       req.nextUrl.pathname.startsWith('/reset-password')

    if (isAuthPage) {
      if (token) {
        return NextResponse.redirect(new URL('/dashboard', req.url))
      }
      return null
    }

    if (!token && req.nextUrl.pathname.startsWith('/dashboard')) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  },
  {
    callbacks: {
      authorized: ({ req, token }) => {
        // This is required for the middleware function above to always be called
        return true
      },
    },
  }
)

export const config = {
  // Protect all routes inside /(app) by targeting their actual URL paths
  // Since /(app) is a route group, the actual URL doesn't have /app in it.
  // We assume /dashboard is the main protected route.
  matcher: [
    "/dashboard/:path*",
    "/login",
    "/signup",
    "/forgot-password",
    "/reset-password"
  ]
}
