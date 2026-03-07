/* eslint-disable no-control-regex */
export const sanitizeString = (
  str: string,
  options: { stripHtml?: boolean } = {},
): string => {
  if (typeof str !== "string") return str;
  // Remove control characters (excluding newlines and tabs which are valid in text/code)
  str = str.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g,
    "",
  );

  if (options.stripHtml) {
    // Remove HTML tags (basic sanitization) to prevent XSS
    str = str.replace(/<[^>]*>/g, "");
  }

  return str.trim();
};

export const sanitizeInput = (value: unknown): unknown => {
  if (typeof value === "string") {
    // By default, we do NOT strip HTML tags to support code/script content,
    // but we do clean invisible control characters and trim whitespace.
    return sanitizeString(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeInput);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [key, sanitizeInput(val)]),
    );
  }
  return value;
};
