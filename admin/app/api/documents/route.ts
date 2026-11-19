import { NextResponse } from "next/server";
import { backendApi, backendProxyError } from "@/lib/auth/backend-api";
import { getSessionToken } from "@/lib/auth/server";
import { paginatedDocumentsSchema } from "@/lib/api/documents";

export async function GET(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { message: "Authentication is required." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? 1);
  const limit = Number(url.searchParams.get("limit") ?? 10);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return NextResponse.json(
      { message: "Page and limit must be valid positive integers." },
      { status: 400 },
    );
  }

  try {
    const response = await backendApi.get("/documents", {
      params: { page, limit },
      headers: { Authorization: `Bearer ${token}` },
    });
    const result = paginatedDocumentsSchema.safeParse(response.data);
    if (!result.success) {
      console.error("Document service returned an invalid list response.");
      return NextResponse.json(
        { message: "Document service returned an invalid response." },
        { status: 502 },
      );
    }
    return NextResponse.json(result.data, { status: response.status });
  } catch (error) {
    return backendProxyError(error, "Document service");
  }
}
