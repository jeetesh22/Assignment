import { NextResponse } from "next/server";
import {
  adminDocumentsSchema,
  adminListQuerySchema,
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
    const response = await backendApi.get("/admin/documents", {
      params: query.data,
      headers: { Authorization: `Bearer ${authorization.token}` },
    });
    const documents = adminDocumentsSchema.safeParse(response.data);
    if (!documents.success) {
      console.error("Admin service returned an invalid documents response.");
      return NextResponse.json(
        { message: "Admin service returned an invalid documents response." },
        { status: 502 },
      );
    }
    return NextResponse.json(documents.data, { status: response.status });
  } catch (error) {
    return backendProxyError(error, "Admin service");
  }
}
