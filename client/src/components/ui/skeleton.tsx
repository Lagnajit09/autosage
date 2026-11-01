import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    // Explicit greys rather than bg-primary/10: this app's dark theme doesn't
    // redefine --primary, so a tint of it all but vanished on dark surfaces.
    <div
      className={cn("animate-pulse rounded-md bg-gray-200 dark:bg-gray-700/60", className)}
      {...props}
    />
  )
}

export { Skeleton }
