import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const handleAuth = auth((req) => {
  const isPublic =
    req.nextUrl.pathname.startsWith("/api/auth") ||
    req.nextUrl.pathname === "/login"

  if (!req.auth && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
})

export async function middleware(req: NextRequest) {
  const isPublic =
    req.nextUrl.pathname.startsWith("/api/auth") ||
    req.nextUrl.pathname === "/login"

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return await (handleAuth as any)(req, {})
  } catch {
    if (!isPublic) {
      return NextResponse.redirect(new URL("/login", req.url))
    }
    return NextResponse.next()
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
