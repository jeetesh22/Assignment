import { NextResponse } from "next/server";
import { authProxyError, backendApi } from "@/lib/auth/backend-api";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/constants";
import { loginSchema } from "@/lib/auth/schemas";
import { loginResponseSchema } from "@/lib/auth/types";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const input = loginSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { message: "Enter a valid email address and password." },
      { status: 400 },
    );
  }

  try {
    const response = await backendApi.post("/auth/login", input.data);
    const session = loginResponseSchema.safeParse(response.data);
    if (!session.success) {
      console.error("Authentication API returned an invalid login response.");
      return NextResponse.json(
        { message: "Authentication service returned an invalid response." },
        { status: 502 },
      );
    }

    const nextResponse = NextResponse.json({ user: session.data.user });
    nextResponse.cookies.set(SESSION_COOKIE, session.data.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    });
    return nextResponse;
  } catch (error) {
    return authProxyError(error);
  }
}
