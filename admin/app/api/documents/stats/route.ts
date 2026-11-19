import { NextResponse } from "next/server";
import {
  backendApi,
  backendProxyError,
} from "@/lib/auth/backend-api";
import { getSessionToken } from "@/lib/auth/server";
import { dashboardStatsSchema } from "@/lib/api/documents";

export async function GET() {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { message: "Authentication is required." },
      { status: 401 },
    );
  }

  try {
    const response = await backendApi.get("/documents/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const stats = dashboardStatsSchema.safeParse(response.data);
    if (!stats.success) {
      console.error("Document service returned invalid dashboard statistics.");
      return NextResponse.json(
        { message: "Document service returned an invalid response." },
        { status: 502 },
      );
    }
    return NextResponse.json(stats.data, { status: response.status });
  } catch (error) {
    return backendProxyError(error, "Document service");
  }
}
