import { NextResponse } from "next/server";
import { backendApi, backendProxyError } from "@/lib/auth/backend-api";
import { getSessionToken } from "@/lib/auth/server";
import { documentSchema } from "@/lib/api/documents";

export async function POST(request: Request) {
  const token = await getSessionToken();
  if (!token) {
    return NextResponse.json(
      { message: "Authentication is required." },
      { status: 401 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { message: "A multipart PDF or TXT file is required." },
      { status: 400 },
    );
  }

  if (!(formData.get("file") instanceof File)) {
    return NextResponse.json(
      { message: "A PDF or TXT file is required." },
      { status: 400 },
    );
  }

  try {
    const response = await backendApi.post("/documents/upload", formData, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 60_000,
    });
    const document = documentSchema.safeParse(response.data);
    if (!document.success) {
      console.error("Document service returned an invalid upload response.");
      return NextResponse.json(
        { message: "Document service returned an invalid response." },
        { status: 502 },
      );
    }
    return NextResponse.json(document.data, { status: response.status });
  } catch (error) {
    return backendProxyError(error, "Document service", {
      exposeServiceUnavailableMessage: true,
    });
  }
}
