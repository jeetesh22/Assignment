import axios from "axios";
import { NextResponse } from "next/server";

export const backendApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
  timeout: 15_000,
  headers: { Accept: "application/json" },
});

function upstreamMessage(data: unknown): string | undefined {
  if (typeof data !== "object" || data === null || !("message" in data)) {
    return undefined;
  }

  const message = data.message;
  if (typeof message === "string" && message.length <= 300) {
    return message;
  }
  if (
    Array.isArray(message) &&
    message.every((item) => typeof item === "string") &&
    message.join(" ").length <= 300
  ) {
    return message.join(" ");
  }
  return undefined;
}

export function backendProxyError(
  error: unknown,
  serviceName = "Backend service",
  options: { exposeServiceUnavailableMessage?: boolean } = {},
): NextResponse {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return NextResponse.json(
        { message: `${serviceName} is unavailable.` },
        { status: 503 },
      );
    }

    const status = error.response.status;
    if (status >= 400 && status < 500) {
      return NextResponse.json(
        { message: upstreamMessage(error.response.data) ?? `${serviceName} rejected the request.` },
        { status },
      );
    }

    if (status === 503 && options.exposeServiceUnavailableMessage) {
      return NextResponse.json(
        { message: upstreamMessage(error.response.data) ?? `${serviceName} is unavailable.` },
        { status },
      );
    }

    return NextResponse.json(
      { message: `${serviceName} encountered an error.` },
      { status: 502 },
    );
  }

  console.error(`Unexpected ${serviceName.toLowerCase()} proxy error`, error);
  return NextResponse.json(
    { message: `${serviceName} encountered an unexpected error.` },
    { status: 500 },
  );
}

export function authProxyError(error: unknown): NextResponse {
  return backendProxyError(error, "Authentication service");
}
