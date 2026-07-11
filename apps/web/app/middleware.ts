/**
 * Edge middleware for auth protection.
 * Edge 中间件：鉴权保护。
 */

import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })
  const allowE2EAuthBypass = process.env.PLAYWRIGHT_E2E_AUTH_BYPASS === '1' &&
    request.headers.get('x-meteorvoice-e2e') === '1'

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            response.cookies.set(name, value),
          )
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isAuthPage = request.nextUrl.pathname === '/login'
  const isPublic = request.nextUrl.pathname.startsWith('/_next') ||
                   request.nextUrl.pathname.startsWith('/api')

  if (!user && !allowE2EAuthBypass && !isAuthPage && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isAuthPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)'],
}
