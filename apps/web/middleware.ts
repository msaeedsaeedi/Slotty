import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const publicPaths = ["/login"];

export function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (publicPaths.some((p) => pathname.startsWith(p))) {
		return NextResponse.next();
	}

	return NextResponse.next();
}

export const config = {
	matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
