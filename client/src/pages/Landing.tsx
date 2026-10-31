import Feature from "@/components/landing/feature-section";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero-section";
import PricingSection from "@/components/landing/pricing-section";
import SageCodeSection from "@/components/landing/sagecode-section";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/theme/theme-context";
import { BookText, Moon, Sun } from "lucide-react";
import { DOCS_BASE_URL, SAGECODE_URL } from "@/lib/api-client";

const Landing = () => {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div className="dark:bg-bg-card overflow-x-hidden">
      <div className="w-full h-10 px-8 flex justify-end items-center gap-2">
        <Button
          variant="outline"
          className="w-fit h-fit gap-1.5 px-2 py-1 text-xs font-semibold border-2 outline-none border-black text-black dark:bg-transparent dark:border-light-primary dark:text-white"
          asChild
        >
          <a href={SAGECODE_URL} target="_blank" rel="noopener noreferrer">
            <img
              src="/sagecode-mark-light.svg"
              alt=""
              className="h-4 w-auto dark:hidden"
            />
            <img
              src="/sagecode-mark-dark.svg"
              alt=""
              className="hidden h-4 w-auto dark:block"
            />
          </a>
        </Button>
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
      <SageCodeSection />
      <PricingSection />
      <Footer />
    </div>
  );
};

export default Landing;
