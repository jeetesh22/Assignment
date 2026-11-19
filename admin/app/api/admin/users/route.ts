import { NextResponse } from "next/server";
import {
  adminListQuerySchema,
  adminUsersSchema,
} from "@/lib/api/admin";
import { backendApi, backendProxyError } from "@/lib/auth/backend-api";
import { authorizeAdminRequest } from "@/lib/auth/admin-proxy";

export async function GET(request: Request) {
  const authorization = await authorizeAdminRequest();
  if ("error" in authorization) return authorization.error;

  const url = new URL(request.url);
  const query = adminListQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!query.success) {
    return NextResponse.json(
      { message: query.error.issues[0]?.message ?? "Invalid pagination." },
      { status: 400 },
    );
  }

  try {
    const response = await backendApi.get("/admin/users", {
      params: query.data,
      headers: { Authorization: `Bearer ${authorization.token}` },
    });
    const users = adminUsersSchema.safeParse(response.data);
    if (!users.success) {
      console.error("Admin service returned an invalid users response.");
      return NextResponse.json(
        { message: "Admin service returned an invalid users response." },
        { status: 502 },
      );
    }
    return NextResponse.json(users.data, { status: response.status });
  } catch (error) {
    return backendProxyError(error, "Admin service");
  }
}
