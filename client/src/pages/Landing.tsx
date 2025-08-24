import { Button } from "@/components/ui/button";
import { useTheme } from "@/provider/theme-provider";
import { Moon, Sun } from "lucide-react";

const Landing = () => {
  const { isDark, toggleTheme } = useTheme();
  return (
    <div className="">
      <div className="w-full h-10 px-8 flex justify-end items-center">
        <Button
          variant="outline"
          className="w-fit p-1 h-fit border-2 border-black"
          onClick={() => toggleTheme()}
        >
          {isDark ? <Moon className="w-8 h-8" /> : <Sun className="w-8 h-8" />}
        </Button>
      </div>
      <div className="">LANDING PAGE</div>
    </div>
  );
};

export default Landing;
