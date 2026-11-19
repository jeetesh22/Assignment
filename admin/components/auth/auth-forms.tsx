"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandLogo } from "@/components/brand-logo";
import { getApiErrorMessage } from "@/lib/api/errors";
import { apiClient } from "@/lib/api/client";
import { loginSchema, registerSchema } from "@/lib/auth/schemas";
import type { PublicUser } from "@/lib/auth/types";

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

function FormNotice({
  message,
  tone,
}: {
  message: string;
  tone: "error" | "success";
}) {
  const Icon = tone === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
      className={`mt-5 flex gap-2.5 rounded-xl border px-3.5 py-3 text-xs leading-5 ${
        tone === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function FieldError({ children }: { children?: string }) {
  return children ? (
    <p role="alert" className="mt-1.5 text-xs text-danger">
      {children}
    </p>
  ) : null;
}

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setServerError("");
    setSuccess("");
    try {
      const response = await apiClient.post<{ user: PublicUser }>(
        "/auth/login",
        values,
      );
      setSuccess("Signed in successfully. Opening your workspace…");
      reset();
      router.replace(
        response.data.user.role === "ADMIN" ? "/admin" : "/dashboard",
      );
      router.refresh();
    } catch (error) {
      setServerError(
        getApiErrorMessage(error, "Unable to sign in. Please try again."),
      );
    }
  }

  return (
    <div>
      <BrandLogo className="mb-4 h-8 w-auto lg:hidden" priority />
      <h2 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
        Welcome back
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Sign in to your document workspace.
      </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div>
          <label
            htmlFor="login-email"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Email address
          </label>
          <Input
            id="login-email"
            autoComplete="email"
            placeholder="you@company.com"
            {...register("email")}
            aria-invalid={Boolean(errors.email)}
          />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label
              htmlFor="login-password"
              className="text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <span className="text-xs font-medium text-slate-400">
              Forgot password?
            </span>
          </div>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            {...register("password")}
            aria-invalid={Boolean(errors.password)}
          />
          <FieldError>{errors.password?.message}</FieldError>
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
          {!isSubmitting && <ArrowRight className="size-4" />}
        </Button>
      </form>

      {serverError && <FormNotice tone="error" message={serverError} />}
      {success && <FormNotice tone="success" message={success} />}
      <p className="mt-7 text-center text-sm text-muted">
        New to Kriscent?{" "}
        <Link
          href="/register"
          className="font-semibold text-primary hover:text-primary/80"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

export function RegisterForm() {
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });

  async function onSubmit(values: RegisterValues) {
    setServerError("");
    setSuccess("");
    const registration = {
      name: values.name,
      email: values.email,
      password: values.password,
    };
    try {
      await apiClient.post("/auth/register", registration);
      setSuccess("Account created. You can now sign in.");
      reset();
    } catch (error) {
      setServerError(
        getApiErrorMessage(error, "Unable to create your account. Please try again."),
      );
    }
  }

  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary lg:hidden">
        PAPERTRAIL
      </p>
      <h2 className="text-3xl font-semibold tracking-[-0.04em] text-foreground">
        Create your account
      </h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Start organizing your document knowledge.
      </p>

      <form
        className="mt-7 space-y-4"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div>
          <label
            htmlFor="register-name"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Full name
          </label>
          <Input
            id="register-name"
            autoComplete="name"
            placeholder="Your name"
            {...register("name")}
            aria-invalid={Boolean(errors.name)}
          />
          <FieldError>{errors.name?.message}</FieldError>
        </div>
        <div>
          <label
            htmlFor="register-email"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Email address
          </label>
          <Input
            id="register-email"
            autoComplete="email"
            placeholder="you@company.com"
            {...register("email")}
            aria-invalid={Boolean(errors.email)}
          />
          <FieldError>{errors.email?.message}</FieldError>
        </div>
        <div>
          <label
            htmlFor="register-password"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Password
          </label>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            {...register("password")}
            aria-invalid={Boolean(errors.password)}
          />
          <FieldError>{errors.password?.message}</FieldError>
        </div>
        <div>
          <label
            htmlFor="register-confirm-password"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Confirm password
          </label>
          <Input
            id="register-confirm-password"
            type="password"
            autoComplete="new-password"
            placeholder="Enter your password again"
            {...register("confirmPassword")}
            aria-invalid={Boolean(errors.confirmPassword)}
          />
          <FieldError>{errors.confirmPassword?.message}</FieldError>
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
          {!isSubmitting && <ArrowRight className="size-4" />}
        </Button>
      </form>

      {serverError && <FormNotice tone="error" message={serverError} />}
      {success && <FormNotice tone="success" message={success} />}
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-semibold text-primary hover:text-primary/80"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
