import { NextResponse } from "next/server";
import { backendApi, backendProxyError } from "@/lib/auth/backend-api";
import { authorizeAdminRequest } from "@/lib/auth/admin-proxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: RouteContext) {
  const authorization = await authorizeAdminRequest();
  if ("error" in authorization) return authorization.error;
  const { id } = await params;

  try {
    await backendApi.delete(`/documents/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${authorization.token}` },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return backendProxyError(error, "Document service");
  }
}
