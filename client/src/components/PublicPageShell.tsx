import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import Logo from "@/components/Logo";
import Footer from "@/components/landing/footer";
import { pathOf, withRedirect } from "@/lib/redirect";

const CTA_CLASS =
  "bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-none";

/**
 * Layout for public, content-only pages (FAQ for visitors, Terms, Privacy):
 * a light header with auth actions, the page body, and the shared footer.
 * Signed-in users get a "Dashboard" shortcut instead of sign-in/sign-up.
 */
const PublicPageShell = ({ children }: { children: ReactNode }) => {
  const { isSignedIn } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen w-full flex flex-col bg-gray-100 dark:bg-gray-950">
      <header className="w-full border-b border-gray-200 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" aria-label="AutoSage home">
            <Logo />
          </Link>
          <div className="flex items-center gap-2">
            {isSignedIn ? (
              <Button asChild className={CTA_CLASS}>
                <Link to="/dashboard">Dashboard</Link>
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  asChild
                  className="text-gray-700 dark:text-gray-300"
                >
                  {/* Return to this page after signing in. */}
                  <Link to={withRedirect("/signin", pathOf(location))}>
                    Sign In
                  </Link>
                </Button>
                <Button asChild className={CTA_CLASS}>
                  <Link to="/signup">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1 p-6 md:p-10">{children}</main>
      <Footer className="max-w-5xl w-full" />
    </div>
  );
};

export default PublicPageShell;
