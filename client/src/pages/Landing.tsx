import Feature from "@/components/landing/feature-section";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero-section";
import PricingSection from "@/components/landing/pricing-section";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme/theme-context";
import { BookText, Moon, Sun } from "lucide-react";
import { DOCS_BASE_URL } from "@/lib/api-client";
import SEO from "@/components/seo/SEO";

const Landing = () => {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div className="dark:bg-bg-card overflow-x-hidden">
      <SEO path="/" />
      <div className="w-full h-10 px-8 flex justify-end items-center gap-2">
        <Button
          variant="outline"
          className="w-fit p-1 h-fit border-2 outline-none border-black dark:bg-transparent dark:border-light-primary"
          asChild
        >
          <a
            href={`${DOCS_BASE_URL}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Documentation"
          >
            <BookText className="w-4 h-4 dark:text-white text-black" />
          </a>
        </Button>
        <Button
          variant="outline"
          className="w-fit p-1 h-fit border-2 outline-none border-black dark:bg-transparent dark:border-light-primary"
          onClick={() => toggleTheme()}
        >
          {isDark ? (
            <Sun className="w-8 h-8 text-light-primary" />
          ) : (
            <Moon className="w-8 h-8" />
          )}
        </Button>
      </div>
      <Hero />
      <Feature />
      <PricingSection />
      <Footer />
    </div>
  );
};

export default Landing;
