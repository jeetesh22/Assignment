import { NextResponse } from "next/server";
import { backendApi, backendProxyError } from "@/lib/auth/backend-api";
import { authorizeAdminRequest } from "@/lib/auth/admin-proxy";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteContext) {
  const authorization = await authorizeAdminRequest();
  if ("error" in authorization) return authorization.error;
  const { id } = await params;

  try {
    const response = await backendApi.post(
      `/admin/refresh-summary/${encodeURIComponent(id)}`,
      undefined,
      { headers: { Authorization: `Bearer ${authorization.token}` } },
    );
    if (response.status === 204 || response.data === undefined) {
      return new NextResponse(null, { status: response.status });
    }
    return NextResponse.json(response.data, { status: response.status });
  } catch (error) {
    return backendProxyError(error, "AI service");
  }
}
