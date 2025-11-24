import * as React from "react";
import { cn } from "@/lib/utils"; // optional: Tailwind class merge helper
import { useTheme } from "@/provider/theme-provider";

interface AutobotIconProps extends React.SVGProps<SVGSVGElement> {
  dark?: boolean;
  size?: number;
}

const AutobotIcon = React.forwardRef<SVGSVGElement, AutobotIconProps>(
  ({ dark = false, size = 20, className, ...props }, ref) => {
    const { isDark } = useTheme();
    const src = dark || isDark ? "/autobot-dark.svg" : "/autobot-light.svg";

    return (
      <svg
        ref={ref}
        width={size}
        height={size}
        className={cn("inline-block", className)}
        {...props}
      >
        <image href={src} width={size} height={size} />
      </svg>
    );
  }
);

AutobotIcon.displayName = "AutobotIcon";

export { AutobotIcon };
