import { useUser } from "@clerk/clerk-react";
import { useLocation, useNavigate } from "react-router-dom";
import { CreditCard, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { pathOf, withRedirect } from "@/lib/redirect";

const AVATAR_CLASS =
  "h-10 w-10 rounded-lg border-2 border-purple-500 dark:border-purple-600";

/**
 * Account dropdown for the app headers (Dashboard, Autobot dashboard/archive).
 * Shows the signed-in Clerk user's own name, email and avatar.
 */
export const UserMenu = ({ className }: { className?: string }) => {
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const name =
    user?.fullName?.trim() ||
    user?.firstName ||
    user?.username ||
    email ||
    "Account";
  const initial = (user?.firstName || name).charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className={cn(
          "ml-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-purple-400",
          className,
        )}
      >
        {/* Clerk always returns an imageUrl (a generated default when none is
            uploaded); only show it for a real photo, else keep the initial. */}
        {user?.hasImage ? (
          <img
            src={user.imageUrl}
            alt=""
            width={40}
            height={40}
            className={cn(AVATAR_CLASS, "object-cover")}
          />
        ) : (
          <div
            className={cn(
              AVATAR_CLASS,
              "flex items-center justify-center font-bold text-gray-50 dark:text-gray-950 bg-gray-700 dark:bg-gray-300",
            )}
          >
            {initial}
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="dark:bg-gray-800 dark:border-gray-900"
      >
        <DropdownMenuLabel className="max-w-[260px]">
          <p className="truncate dark:text-gray-200" title={name}>
            {name}
          </p>
          {email && email !== name && (
            <span
              className="block truncate font-normal text-gray-600 dark:text-gray-400 text-xs"
              title={email}
            >
              {email}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate("/billing")}
          className="cursor-pointer dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <CreditCard />
          Subscription
        </DropdownMenuItem>
        {/* Via /signout so signing back in returns the user to this page. */}
        <DropdownMenuItem
          onClick={() => navigate(withRedirect("/signout", pathOf(location)))}
          className="cursor-pointer dark:text-gray-300 dark:hover:bg-gray-700"
        >
          <LogOut />
          LogOut
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default UserMenu;
