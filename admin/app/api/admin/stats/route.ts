import { NextResponse } from "next/server";
import { adminStatsSchema } from "@/lib/api/admin";
import { backendApi, backendProxyError } from "@/lib/auth/backend-api";
import { authorizeAdminRequest } from "@/lib/auth/admin-proxy";

export async function GET() {
  const authorization = await authorizeAdminRequest();
  if ("error" in authorization) return authorization.error;

  try {
    const response = await backendApi.get("/admin/stats", {
      headers: { Authorization: `Bearer ${authorization.token}` },
    });
    const stats = adminStatsSchema.safeParse(response.data);
    if (!stats.success) {
      console.error("Admin service returned an invalid statistics response.");
      return NextResponse.json(
        { message: "Admin service returned an invalid statistics response." },
        { status: 502 },
      );
    }
    return NextResponse.json(stats.data, { status: response.status });
  } catch (error) {
    return backendProxyError(error, "Admin service");
  }
}
