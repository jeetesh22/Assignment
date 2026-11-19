import { NextResponse } from "next/server";
import { backendApi, backendProxyError } from "@/lib/auth/backend-api";
import { getSessionToken } from "@/lib/auth/server";
import { publicUserSchema } from "@/lib/auth/types";

type AdminAuthorization =
  | { token: string; error?: never }
  | { token?: never; error: NextResponse };

export async function authorizeAdminRequest(): Promise<AdminAuthorization> {
  const token = await getSessionToken();
  if (!token) {
    return {
      error: NextResponse.json(
        { message: "Authentication is required." },
        { status: 401 },
      ),
    };
  }

  try {
    const response = await backendApi.get("/auth/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const user = publicUserSchema.safeParse(response.data);
    if (!user.success) {
      console.error("Authentication service returned an invalid profile.");
      return {
        error: NextResponse.json(
          { message: "Authentication service returned an invalid profile." },
          { status: 502 },
        ),
      };
    }
    if (user.data.role !== "ADMIN") {
      return {
        error: NextResponse.json(
          { message: "Administrator access is required." },
          { status: 403 },
        ),
      };
    }

    return { token };
  } catch (error) {
    return { error: backendProxyError(error, "Authentication service") };
  }
}
