import { z } from "zod";

export const publicUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["USER", "ADMIN"]),
});

export type PublicUser = z.infer<typeof publicUserSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: publicUserSchema,
});
