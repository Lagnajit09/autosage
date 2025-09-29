import { Code2Icon, Workflow } from "lucide-react";
import { BentoCard, BentoGrid } from "@/components/ui/bento-grid";
import { useTheme } from "@/provider/theme-provider";
import { LampContainer } from "../ui/lamp";
import { motion } from "motion/react";

const Feature = () => {
  const { isDark } = useTheme();
  const features = [
    {
      Icon: Workflow,
      name: "Autobot",
      description: "Generate workflows and scripts in a prompt.",
      href: "/",
      cta: "Learn more",
      background: (
        <img
          src={`${isDark ? "/public/ai-dark.png" : "/public/ai-light.png"}`}
          className="absolute -top-10 -right-10 opacity-60"
        />
      ),
      className: "col-span-3 lg:col-span-1",
    },
    {
      Icon: Code2Icon,
      name: "Built-in Code-Editor",
      description: "Create the Scripts you want to execute.",
      href: "/",
      cta: "Learn more",
      background: (
        <img
          src={`${
            isDark ? "/public/editor-dark.png" : "/public/editor-light.png"
          }`}
          className="absolute bottom-10 -right-10 opacity-60"
        />
      ),
      className: "col-span-3 lg:col-span-2",
    },
    {
      Icon: Workflow,
      name: "Build your workflow",
      description: "Build your workflow in the Workflow-Editor.",
      href: "/",
      cta: "Learn more",
      background: (
        <img
          src={`${
            isDark ? "/public/workflow-dark.png" : "/public/workflow-light.png"
          }`}
          className="absolute bottom-10 -right-10 opacity-60"
        />
      ),
      className: "col-span-3 lg:col-span-2",
    },
    {
      Icon: Workflow,
      name: "Templates",
      description: "Build your workflow in the Workflow-Editor.",
      href: "/",
      cta: "Learn more",
      background: (
        <img
          src={`${
            isDark
              ? "/public/templates-dark.png"
              : "/public/templates-light.png"
          }`}
          className="absolute -top-0 -right-10 opacity-60"
        />
      ),
      className: "col-span-3 lg:col-span-1",
    },
  ];
  return (
    <div className="w-[90%] mx-auto my-20 flex flex-col items-center justify-center">
      <LampContainer>
        <motion.h1
          initial={{ opacity: 0.5, y: 100 }}
          whileInView={{ opacity: 1, y: -20 }}
          transition={{
            delay: 0.3,
            duration: 0.8,
            ease: "easeInOut",
          }}
          className="mt-8 bg-gradient-to-br from-slate-300 to-slate-500 py-4 bg-clip-text text-center text-4xl font-medium tracking-tight text-transparent md:text-7xl"
        >
          AI-crafted Scripts, <br /> Remote-ready Workflows
        </motion.h1>
      </LampContainer>
      <BentoGrid className="lg:grid-rows-0">
        {features.map((feature) => (
          <BentoCard key={feature.name} {...feature} />
        ))}
      </BentoGrid>
    </div>
  );
};

export default Feature;
