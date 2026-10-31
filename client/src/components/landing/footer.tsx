import {
  Facebook,
  Github,
  Instagram,
  Linkedin,
  Twitter,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router-dom";
import { DOCS_BASE_URL, SAGECODE_URL } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const SUPPORT_EMAIL = "autosagex@gmail.com";

interface FooterLink {
  label: string;
  /** In-app route (react-router). */
  to?: string;
  /** External / mailto URL. */
  href?: string;
}

// Auth-gated destinations (Billing, Dashboard, Report a Bug) are fine to link
// from public pages: ProtectedRoute sends visitors through sign-in with a
// `redirect_url`, so they land on the page they clicked afterwards.
const SECTIONS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Home", to: "/" },
      { label: "Plans & Pricing", to: "/#pricing" },
      { label: "SageCode CLI", href: SAGECODE_URL },
      { label: "Get Started", to: "/signup" },
      { label: "Sign In", to: "/signin" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Docs", href: DOCS_BASE_URL },
      { label: "FAQ", to: "/faq" },
      { label: "Report a Bug", to: "/report-bug" },
    ],
  },
  {
    title: "Account",
    links: [
      { label: "Billing", to: "/billing" },
      { label: "Dashboard", to: "/dashboard" },
      // Contact form lives on the FAQ page (/contact → /faq#contact).
      { label: "Contact Us", to: "/contact" },
    ],
  },
];

const LEGAL_LINKS: { label: string; to: string }[] = [
  { label: "Terms", to: "/terms" },
  { label: "Privacy", to: "/privacy" },
];

// Fill in `href` to make an icon a link; empty ones render as plain icons.
const SOCIAL_LINKS: { label: string; icon: LucideIcon; href: string }[] = [
  { label: "Instagram", icon: Instagram, href: "" },
  { label: "Facebook", icon: Facebook, href: "" },
  { label: "Twitter", icon: Twitter, href: "" },
  { label: "LinkedIn", icon: Linkedin, href: "" },
  { label: "GitHub", icon: Github, href: "" },
];

const LINK_CLASS =
  "text-sm text-gray-600 dark:text-gray-400 hover:text-gray-950 dark:hover:text-white transition-colors";

const FooterItem = ({ link }: { link: FooterLink }) => {
  if (link.to) {
    return (
      <Link to={link.to} className={LINK_CLASS}>
        {link.label}
      </Link>
    );
  }
  const external = !!link.href && !link.href.startsWith("mailto:");
  return (
    <a
      href={link.href}
      className={LINK_CLASS}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {link.label}
    </a>
  );
};

const Footer = ({ className }: { className?: string }) => {
  const year = new Date().getFullYear();

  return (
    <footer
      className={cn(
        "w-[90%] mx-auto pt-16 pb-10 border-t border-gray-200 dark:border-gray-800",
        className,
      )}
    >
      <div className="flex flex-col md:flex-row md:justify-between gap-10">
        {/* Brand */}
        <div className="flex flex-col max-w-xs">
          <Link to="/" className="flex items-end gap-2 w-fit">
            <img
              src="/logo.png"
              alt="AutoSage Logo"
              className="h-10 w-auto object-contain mb-4"
            />
            <p className="text-gray-950 dark:text-gray-100 font-semibold text-xl tracking-tight leading-tight mb-4">
              AUTOSAGE
            </p>
          </Link>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Seamless automation, smarter execution.
          </p>
        </div>

        {/* Link columns */}
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 sm:grid-cols-3 gap-8 md:gap-16"
        >
          {SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-950 dark:text-gray-100">
                {section.title}
              </p>
              {section.links.map((link) => (
                <FooterItem key={link.label} link={link} />
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-800 flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
        <span className="text-xs text-gray-600 dark:text-gray-500 text-center sm:text-left">
          Copyright © {year} Autosage. All rights reserved. ·{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="hover:text-gray-950 dark:hover:text-white transition-colors"
          >
            {SUPPORT_EMAIL}
          </a>
          {LEGAL_LINKS.map((link) => (
            <span key={link.label}>
              {" · "}
              <Link
                to={link.to}
                className="hover:text-gray-950 dark:hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            </span>
          ))}
        </span>
        <div className="flex gap-4 items-center text-gray-700 dark:text-gray-300">
          {SOCIAL_LINKS.map(({ label, icon: Icon, href }) =>
            href ? (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="hover:text-gray-950 dark:hover:text-white transition-colors"
              >
                <Icon className="w-4 h-4" />
              </a>
            ) : (
              <Icon key={label} className="w-4 h-4" aria-hidden="true" />
            ),
          )}
        </div>
      </div>
    </footer>
  );
};

export default Footer;
