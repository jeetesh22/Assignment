import "server-only";

import axios from "axios";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backendApi } from "@/lib/auth/backend-api";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { publicUserSchema } from "@/lib/auth/types";

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

export const getCurrentUser = cache(async () => {
  const token = await getSessionToken();
  if (!token) {
    redirect("/login");
  }

  try {
    const response = await backendApi.get("/auth/profile", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const parsedUser = publicUserSchema.safeParse(response.data);
    if (!parsedUser.success) {
      throw new Error("Authentication service returned an invalid profile.");
    }
    return parsedUser.data;
  } catch (error) {
    if (
      axios.isAxiosError(error) &&
      (error.response?.status === 401 || error.response?.status === 403)
    ) {
      redirect("/login");
    }
    throw error;
  }
});

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  return user;
}
