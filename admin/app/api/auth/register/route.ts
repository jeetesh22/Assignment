import { NextResponse } from "next/server";
import { authProxyError, backendApi } from "@/lib/auth/backend-api";
import { registerRequestSchema } from "@/lib/auth/schemas";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { message: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const input = registerRequestSchema.safeParse(body);
  if (!input.success) {
    return NextResponse.json(
      { message: "Check the registration details and try again." },
      { status: 400 },
    );
  }

  try {
    await backendApi.post("/auth/register", input.data);
    return NextResponse.json({ message: "Account created." }, { status: 201 });
  } catch (error) {
    return authProxyError(error);
  }
}
