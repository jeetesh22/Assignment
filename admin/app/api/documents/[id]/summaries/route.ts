import { NextResponse } from "next/server";
import { backendApi, backendProxyError } from "@/lib/auth/backend-api";
import { getSessionToken } from "@/lib/auth/server";
import {
  documentSchema,
  summaryRequestSchema,
} from "@/lib/api/documents";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { message: "Authentication is required." },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "A summary type is required." },
      { status: 400 },
    );
  }
  const input = summaryRequestSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { message: "A valid summary type is required." },
      { status: 400 },
    );
  }

  const { id } = await params;
  try {
    const response = await backendApi.post(
      `/documents/${encodeURIComponent(id)}/summaries`,
      input.data,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const document = documentSchema.safeParse(response.data);
    if (!document.success) {
      console.error("Document service returned an invalid summary response.");
      return NextResponse.json(
        { message: "Document service returned an invalid response." },
        { status: 502 },
      );
    }
    return NextResponse.json(document.data, { status: response.status });
  } catch (error) {
    return backendProxyError(error, "Summary service");
  }
}
