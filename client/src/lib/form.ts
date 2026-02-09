import { z } from "zod";
import { sanitizeString } from "@/sanitizers";

// Common password validation schema for reuse
const passwordSchema = z
  .string()
  .transform((val) => sanitizeString(val))
  .pipe(
    z
      .string()
      .min(8, { message: "Password must be at least 8 characters" })
      .regex(/[A-Z]/, {
        message: "Password must contain at least one uppercase letter",
      })
      .regex(/[a-z]/, {
        message: "Password must contain at least one lowercase letter",
      })
      .regex(/[0-9]/, { message: "Password must contain at least one number" }),
  );

// Reusable phone validation
const phoneSchema = z
  .string()
  .transform((val) => sanitizeString(val))
  .pipe(
    z
      .string()
      .regex(/^\d{10}$/, { message: "Phone number must be exactly 10 digits" }),
  );

export const SignupFormSchema = z
  .object({
    username: z
      .string()
      .transform((val) => sanitizeString(val))
      .pipe(
        z
          .string()
          .min(2, { message: "Username must be at least 2 characters" }),
      ),
    email: z
      .string()
      .transform((val) => sanitizeString(val))
      .pipe(
        z.string().email({ message: "Please enter a valid email address" }),
      ),
    password: passwordSchema,
    confirmPassword: z.string().transform((val) => sanitizeString(val)),
    acceptTerms: z.boolean().refine((val) => val === true, {
      message: "You must accept the terms and conditions",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const SigninFormSchema = z.object({
  username: z
    .string()
    .transform((val) => sanitizeString(val))
    .pipe(
      z.string().min(2, { message: "Username must be at least 2 characters" }),
    ),
  password: z.string().min(1, { message: "Password is required" }), // Usually don't sanitize login password strictly but let's keep it safe
  rememberMe: z.boolean().default(false).optional(),
});

export const resetPasswordFormSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string().transform((val) => sanitizeString(val)),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordFormSchema = z.object({
  email: z
    .string()
    .transform((val) => sanitizeString(val))
    .pipe(z.string().email({ message: "Please enter a valid email address" })),
});
