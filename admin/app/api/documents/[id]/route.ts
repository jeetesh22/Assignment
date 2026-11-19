import { NextResponse } from "next/server";
import { backendApi, backendProxyError } from "@/lib/auth/backend-api";
import { getSessionToken } from "@/lib/auth/server";
import { documentSchema } from "@/lib/api/documents";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { message: "Authentication is required." },
      { status: 401 },
    );
  }
  const { id } = await params;

  try {
    const response = await backendApi.get(
      `/documents/${encodeURIComponent(id)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const document = documentSchema.safeParse(response.data);
    if (!document.success) {
      console.error("Document service returned an invalid detail response.");
      return NextResponse.json(
        { message: "Document service returned an invalid response." },
        { status: 502 },
      );
    }
    return NextResponse.json(document.data, { status: response.status });
  } catch (error) {
    return backendProxyError(error, "Document service");
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { message: "Authentication is required." },
      { status: 401 },
    );
  }
  const { id } = await params;

  try {
    await backendApi.delete(`/documents/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return backendProxyError(error, "Document service");
  }
}
