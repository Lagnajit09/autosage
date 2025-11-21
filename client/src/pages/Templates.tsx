import { useState, useEffect } from "react";
import LeftNav, { NavItems } from "@/components/LeftNav";
import { Button } from "@/components/ui/button";
import { LayoutGrid, List, Search, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { Template } from "@/components/Templates/types";
import { TemplateCard } from "@/components/Templates/TemplateCard";
import { TemplateListItem } from "@/components/Templates/TemplateListItem";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";

// Mock Data
const templates: Template[] = [
  {
    id: "1",
    title: "E-commerce Scraper",
    description:
      "Scrape product details, prices, and reviews from major e-commerce sites.",
    category: "Scraping",
    tags: ["E-commerce", "Data", "Web Scraping"],
    downloads: 1200,
    author: "AutoSage Team",
    successRate: 98,
  },
  {
    id: "2",
    title: "Social Media Scheduler",
    description:
      "Automate posting to Twitter, LinkedIn, and Facebook with a content calendar.",
    category: "Marketing",
    tags: ["Social Media", "Automation", "Marketing"],
    downloads: 850,
    author: "MarketingPro",
    successRate: 95,
  },
  {
    id: "3",
    title: "AWS Infrastructure Setup",
    description:
      "Deploy a scalable VPC, EC2 instances, and RDS database on AWS using Terraform.",
    category: "DevOps",
    tags: ["AWS", "Terraform", "Infrastructure"],
    downloads: 500,
    author: "CloudMaster",
    successRate: 92,
  },
  {
    id: "4",
    title: "CI/CD Pipeline for Node.js",
    description:
      "Standard CI/CD pipeline for Node.js applications using GitHub Actions.",
    category: "DevOps",
    tags: ["CI/CD", "Node.js", "GitHub Actions"],
    downloads: 900,
    author: "DevOpsGuru",
    successRate: 99,
  },
  {
    id: "5",
    title: "Lead Generation Bot",
    description:
      "Find and qualify leads from LinkedIn and export them to a CSV file.",
    category: "Sales",
    tags: ["Lead Gen", "LinkedIn", "Sales"],
    downloads: 600,
    author: "SalesWizard",
    successRate: 88,
  },
  {
    id: "6",
    title: "Daily Report Emailer",
    description:
      "Generate and send daily business reports via email to stakeholders.",
    category: "Automation",
    tags: ["Reporting", "Email", "Automation"],
    downloads: 450,
    author: "AutoSage Team",
    successRate: 97,
  },
  {
    id: "7",
    title: "Kubernetes Cluster Deployment",
    description:
      "Deploy a production-ready Kubernetes cluster on DigitalOcean.",
    category: "Deployment",
    tags: ["Kubernetes", "DigitalOcean", "Container"],
    downloads: 300,
    author: "K8sExpert",
    successRate: 94,
  },
  {
    id: "8",
    title: "SEO Analyzer",
    description:
      "Analyze website SEO performance and generate a comprehensive report.",
    category: "Marketing",
    tags: ["SEO", "Analysis", "Marketing"],
    downloads: 700,
    author: "SEOPro",
    successRate: 96,
  },
];

const categories = [
  "All",
  "Automation",
  "Scraping",
  "DevOps",
  "Deployment",
  "Marketing",
  "Sales",
];

const Templates = () => {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      template.title
        .toLowerCase()
        .includes(debouncedSearchQuery.toLowerCase()) ||
      template.description
        .toLowerCase()
        .includes(debouncedSearchQuery.toLowerCase()) ||
      template.tags.some((tag) =>
        tag.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
      );

    const matchesCategory =
      selectedCategory === "All" || template.category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
      <LeftNav />

      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
            {/* Header Section */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Mobile Menu */}
                  <div className="md:hidden">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-ml-2 hover:bg-gray-300 dark:hover:bg-gray-700"
                        >
                          <Menu className="h-6 w-6 text-gray-800 dark:text-gray-200" />
                        </Button>
                      </SheetTrigger>

                      <SheetContent
                        side="left"
                        className="w-[250px] sm:w-[300px] bg-gray-100 dark:bg-gray-900 dark:border-gray-800"
                      >
                        <SheetHeader>
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col items-start">
                              <h1 className="text-gray-950 dark:text-gray-100 font-semibold text-lg">
                                Autosage
                              </h1>
                              <p className="text-sidebar-foreground text-sm">
                                Automation Hub
                              </p>
                            </div>
                          </div>
                        </SheetHeader>
                        <NavItems mobile />
                      </SheetContent>
                    </Sheet>
                  </div>

                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                      Templates
                    </h1>
                    <p className="text-sm md:text-lg text-gray-500 dark:text-gray-400 mt-1 hidden md:block">
                      Explore and use pre-built automation templates.
                    </p>
                  </div>
                </div>
              </div>

              {/* Category Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                {categories.map((category) => (
                  <Button
                    key={category}
                    variant={
                      selectedCategory === category ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() => setSelectedCategory(category)}
                    className={cn(
                      "whitespace-nowrap rounded-full",
                      selectedCategory === category
                        ? "bg-purple-600 hover:bg-purple-700 text-white border-transparent"
                        : "bg-white dark:bg-gray-800/50 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                  >
                    {category}
                  </Button>
                ))}
              </div>

              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                  <Input
                    placeholder="Search templates..."
                    className="pl-8 bg-white dark:bg-gray-800/50 border-gray-200 dark:border-gray-700/50 dark:text-gray-200"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3">
                  <div className="flex items-center bg-white dark:bg-gray-800/50 rounded-lg p-1 border border-gray-200 dark:border-gray-700/50 shadow-sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewMode("grid")}
                      className={cn(
                        "h-8 w-8 p-0 rounded-md transition-all",
                        viewMode === "grid"
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-800"
                      )}
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setViewMode("list")}
                      className={cn(
                        "h-8 w-8 p-0 rounded-md transition-all",
                        viewMode === "list"
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-800"
                      )}
                    >
                      <List className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* Templates Grid/List */}
            <div
              className={cn(
                "animate-in fade-in slide-in-from-bottom-4 duration-500",
                viewMode === "grid"
                  ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
                  : "flex flex-col space-y-4"
              )}
            >
              {filteredTemplates.length > 0 ? (
                filteredTemplates.map((template) =>
                  viewMode === "grid" ? (
                    <TemplateCard key={template.id} template={template} />
                  ) : (
                    <TemplateListItem key={template.id} template={template} />
                  )
                )
              ) : (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-center">
                  <div className="bg-gray-100 dark:bg-gray-800/50 p-4 rounded-full mb-4">
                    <Search className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    No templates found
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                    We couldn't find any templates matching "{searchQuery}" in
                    the "{selectedCategory}" category. Try adjusting your search
                    terms or category.
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Templates;
