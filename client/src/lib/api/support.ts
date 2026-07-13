import { apiRequest } from "../api-client";

export interface ReportBugBody {
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  page_url?: string;
}

export interface ContactSupportBody {
  subject: string;
  message: string;
}

export async function reportBug(data: ReportBugBody, token: string) {
  return apiRequest(
    "/api/users/report-bug/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    token,
  );
}

export async function contactSupport(data: ContactSupportBody, token: string) {
  return apiRequest(
    "/api/users/contact/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    },
    token,
  );
}
