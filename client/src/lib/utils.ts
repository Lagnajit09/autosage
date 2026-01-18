import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInDays = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);

  if (diffInDays <= 30) {
    // Relative time: "3 days ago", "2 weeks ago"
    return (
      date.toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      }) + (diffInDays > 0 ? ` (${Math.round(diffInDays)} days ago)` : "")
    );
  }

  // Full date: "Jan 17, 2026 7:30 AM"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
