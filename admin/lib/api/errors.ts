import axios from "axios";

export function getApiErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  if (!error.response) {
    return "Could not reach the API service. Check the API connection and try again.";
  }

  const message = error.response.data?.message as unknown;
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
  return fallback;
}
