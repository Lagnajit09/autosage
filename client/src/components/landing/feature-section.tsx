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

      background: (
        <img
          src={`${isDark ? "/ai-dark.png" : "/ai-light.png"}`}
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      ),
      className: "col-span-3 lg:col-span-1",
    },
    {
      Icon: Code2Icon,
      name: "Built-in Code-Editor",
      description: "Create the Scripts you want to execute.",

      background: (
        <img
          src={`${isDark ? "/code-dark.jpg" : "/code-light.png"}`}
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      ),
      className: "col-span-3 lg:col-span-2",
    },
    {
      Icon: Workflow,
      name: "Build your workflow",
      description: "Build your workflow in the Workflow-Editor.",

      background: (
        <img
          src={`${isDark ? "/workflow-dark.jpg" : "/workflow-light.png"}`}
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      ),
      className: "col-span-3 lg:col-span-2",
    },
    {
      Icon: Workflow,
      name: "Templates",
      description: "Build your workflow in the Workflow-Editor.",

      background: (
        <img
          src={`${isDark ? "/templates-dark.jpg" : "/templates-light.png"}`}
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      ),
      className: "col-span-3 lg:col-span-1",
    },
  ];
  return (
    <div className="w-[90%] mx-auto my-20 flex flex-col items-center justify-center">
      <LampContainer className="hidden dark:flex">
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
      <motion.h1
        initial={{ opacity: 0.5, y: 100 }}
        whileInView={{ opacity: 1, y: -20 }}
        transition={{
          delay: 0.3,
          duration: 0.8,
          ease: "easeInOut",
        }}
        className="dark:hidden my-10 bg-gradient-to-br from-slate-500 to-slate-700 py-4 bg-clip-text text-center text-4xl font-medium tracking-tight text-transparent md:text-7xl"
      >
        AI-crafted Scripts, <br /> Remote-ready Workflows
      </motion.h1>
      <BentoGrid className="lg:grid-rows-0">
        {features.map((feature) => (
          <>
            <BentoCard key={feature.name} {...feature} />
          </>
        ))}
      </BentoGrid>
    </div>
  );
};

export default Feature;
