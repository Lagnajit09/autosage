import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import PublicPageShell from "@/components/PublicPageShell";

export interface LegalSection {
  /** Anchor id, used by the table of contents (e.g. "billing"). */
  id: string;
  title: string;
  content: ReactNode;
}

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  intro: ReactNode;
  sections: LegalSection[];
  /** Cross-link to the sibling legal page. */
  related: { label: string; to: string };
}

// Typography for plain JSX content (no typography plugin in this project).
const PROSE =
  "text-sm leading-relaxed text-gray-700 dark:text-gray-300 " +
  "[&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1.5 " +
  "[&_strong]:font-semibold [&_strong]:text-gray-900 dark:[&_strong]:text-gray-100 " +
  "[&_a]:text-purple-600 dark:[&_a]:text-purple-400 [&_a]:underline [&_a:hover]:text-purple-700";

/** Shared layout for the Terms of Service and Privacy Policy pages. */
const LegalPage = ({
  title,
  lastUpdated,
  intro,
  sections,
  related,
}: LegalPageProps) => (
  <PublicPageShell>
    <article className="max-w-3xl mx-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 md:p-10 shadow-sm">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
          {title}
        </h1>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Last updated: {lastUpdated}
        </p>
      </header>

      <div className={PROSE}>{intro}</div>

      <nav
        aria-label="Contents"
        className="my-8 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950/50 p-5"
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-900 dark:text-gray-100">
          Contents
        </p>
        <ol className="grid gap-1.5 sm:grid-cols-2 list-decimal pl-5 text-sm">
          {sections.map((s) => (
            <li key={s.id}>
              <Link
                to={`#${s.id}`}
                className="text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              >
                {s.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((s, i) => (
        <section key={s.id} id={s.id} className="scroll-mt-6 mb-8">
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
            {i + 1}. {s.title}
          </h2>
          <div className={PROSE}>{s.content}</div>
        </section>
      ))}

      <footer className="mt-10 pt-6 border-t border-gray-200 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400">
        See also our{" "}
        <Link
          to={related.to}
          className="text-purple-600 dark:text-purple-400 underline hover:text-purple-700"
        >
          {related.label}
        </Link>
        .
      </footer>
    </article>
  </PublicPageShell>
);

export default LegalPage;
