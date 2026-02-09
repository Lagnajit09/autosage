import { z } from "zod";

export const emailSchema = z.string().email();

export const isValidEmail = (email: string): boolean => {
  try {
    emailSchema.parse(email);
    return true;
  } catch {
    return false;
  }
};

export const urlSchema = z.string().url();

export const isValidUrl = (url: string): boolean => {
  try {
    urlSchema.parse(url);
    return true;
  } catch {
    return false;
  }
};

export const hasSQLInjectionChars = (str: string): boolean => {
  // Basic check for common SQL injection patterns
  const sqlPattern =
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b)|(--)|(';)|(\/\*)|(\*\/)/i;
  return sqlPattern.test(str);
};

export const hasXSSChars = (str: string): boolean => {
  // Basic check for common XSS patterns
  const xssPattern = /(<script)|(javascript:)|(onload=)|(onerror=)/i;
  return xssPattern.test(str);
};
