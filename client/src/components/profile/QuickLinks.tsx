import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Settings, CreditCard, Activity } from "lucide-react";

export const QuickLinks = () => {
  const navigate = useNavigate();

  const links = [
    {
      icon: Settings,
      title: "Settings",
      description: "Manage preferences",
      onClick: () => navigate("/settings"),
      color: "text-purple-600 dark:text-purple-400",
    },
    {
      icon: CreditCard,
      title: "Billing",
      description: "Payment & invoices",
      onClick: () => navigate("/billing"),
      color: "text-blue-600 dark:text-blue-400",
    },
    {
      icon: Activity,
      title: "API Usage",
      description: "View API stats",
      onClick: () => navigate("/settings"),
      color: "text-green-600 dark:text-green-400",
    },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Quick Links
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {links.map((link, index) => {
          const Icon = link.icon;
          return (
            <Card
              key={index}
              className="bg-white dark:bg-gray-900/50 border-gray-200 dark:border-gray-800 shadow-sm cursor-pointer hover:border-purple-300 dark:hover:border-purple-700 transition-colors"
              onClick={link.onClick}
            >
              <CardContent className="p-6 flex items-center gap-4">
                <Icon className={`w-8 h-8 ${link.color}`} />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {link.title}
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {link.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
};
