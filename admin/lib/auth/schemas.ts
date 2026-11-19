import { z } from "zod";

const emailSchema = z.string().trim().email("Enter a valid email address.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

const registerFieldsSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100),
  email: emailSchema,
  password: z.string().min(8, "Use at least 8 characters."),
});

export const registerSchema = registerFieldsSchema
  .extend({ confirmPassword: z.string().min(1, "Confirm your password.") })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const registerRequestSchema = registerFieldsSchema;
