import { NextResponse } from "next/server";
import { backendApi, backendProxyError } from "@/lib/auth/backend-api";
import { getSessionToken } from "@/lib/auth/server";
import {
  searchQuerySchema,
  searchResponseSchema,
} from "@/lib/api/search";

export async function GET(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { message: "Authentication is required." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const parsedQuery = searchQuerySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.has("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined,
    documentId: url.searchParams.get("documentId") ?? undefined,
    fileType: url.searchParams.get("fileType") ?? undefined,
  });
  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: parsedQuery.error.issues[0]?.message ?? "Invalid search query." },
      { status: 400 },
    );
  }

  try {
    const response = await backendApi.get("/documents/search", {
      params: parsedQuery.data,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 30_000,
    });
    const results = searchResponseSchema.safeParse(response.data);
    if (!results.success) {
      console.error("Document service returned an invalid search response.");
      return NextResponse.json(
        { message: "Document service returned an invalid search response." },
        { status: 502 },
      );
    }
    return NextResponse.json(results.data, { status: response.status });
  } catch (error) {
    return backendProxyError(error, "Search service", {
      exposeServiceUnavailableMessage: true,
    });
  }
}
