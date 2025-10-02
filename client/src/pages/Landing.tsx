import Feature from "@/components/landing/feature-section";
import Footer from "@/components/landing/footer";
import Hero from "@/components/landing/hero-section";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/provider/theme-provider";
import { Moon, Sun } from "lucide-react";

const Landing = () => {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div className="dark:bg-bg-card">
      <div className="w-full h-10 px-8 flex justify-end items-center">
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
      <Footer />
    </div>
  );
};

export default Landing;
