import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authProxyError, backendApi } from "@/lib/auth/backend-api";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { publicUserSchema } from "@/lib/auth/types";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
  }

  try {
    const response = await backendApi.get("/auth/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = publicUserSchema.safeParse(response.data);
    if (!user.success) {
      console.error("Authentication API returned an invalid profile response.");
      return NextResponse.json(
        { message: "Authentication service returned an invalid profile." },
        { status: 502 },
      );
    }
    return NextResponse.json({ user: user.data });
  } catch (error) {
    const errorResponse = authProxyError(error);
    if (errorResponse.status === 401 || errorResponse.status === 403) {
      errorResponse.cookies.delete(SESSION_COOKIE);
    }
    return errorResponse;
  }
}
