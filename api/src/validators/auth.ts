import { z } from "zod";

export const emailSchema = z
  .string()
  .min(1, "Email requerido")
  .email("Email inválido")
  .max(255, "Email demasiado largo");

export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(128, "La contraseña es demasiado larga");

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(2, "Name must be at least 2 characters").max(255, "Name too long"),
  phone: z.string().max(50, "Phone too long").optional(),
  company: z.string().max(255, "Company too long").optional(),
  country: z.string().max(100, "Country too long").optional(),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Contraseña requerida"),
});

export const tokenSchema = z.object({
  token: z.string().uuid("Token inválido"),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().uuid("Token inválido"),
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type TokenInput = z.infer<typeof tokenSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
