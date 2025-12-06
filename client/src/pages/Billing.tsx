import { useNavigate } from "react-router-dom";
import LeftNav, { NavItems } from "@/components/LeftNav";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard,
  Download,
  CheckCircle2,
  AlertCircle,
  Menu,
  Plus,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const Billing = () => {
  const navigate = useNavigate();

  // Mock Data
  const currentPlan = {
    name: "Pro Plan",
    price: "$29/month",
    status: "Active",
    nextBilling: "January 25, 2026",
    features: [
      "Unlimited Workflows",
      "Priority Support",
      "Advanced Analytics",
      "Team Collaboration",
    ],
  };

  const paymentMethods = [
    {
      id: 1,
      type: "Visa",
      last4: "4242",
      expiry: "12/28",
      isDefault: true,
    },
    {
      id: 2,
      type: "Mastercard",
      last4: "8888",
      expiry: "09/27",
      isDefault: false,
    },
  ];

  const invoices = [
    {
      id: "INV-2024-001",
      date: "Dec 25, 2025",
      amount: "$29.00",
      status: "Paid",
    },
    {
      id: "INV-2024-002",
      date: "Nov 25, 2025",
      amount: "$29.00",
      status: "Paid",
    },
    {
      id: "INV-2024-003",
      date: "Oct 25, 2025",
      amount: "$29.00",
      status: "Paid",
    },
  ];

  return (
    <SidebarProvider>
      <div className="flex w-full h-screen bg-gray-100 dark:bg-workflow-void/90 overflow-hidden">
        <LeftNav />

        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <main className="flex-1 overflow-y-auto p-6 md:p-10">
            <div className="max-w-5xl mx-auto space-y-8">
              {/* Header */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  {/* Mobile Menu */}
                  <div className="md:hidden">
                    <Sheet>
                      <SheetTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-ml-2 hover:bg-gray-200 dark:hover:bg-gray-800"
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
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                      Billing & Subscription
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 text-lg hidden md:block">
                      Manage your plan, payment methods, and invoices.
                    </p>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-sm md:hidden">
                  Manage your plan, payment methods, and invoices.
                </p>
              </div>

              <Separator className="bg-gray-200 dark:bg-gray-800" />

              <Tabs defaultValue="overview" className="w-full space-y-6">
                <TabsList className="bg-gray-100 dark:bg-gray-900/50 p-1 border border-gray-200 dark:border-gray-800">
                  <TabsTrigger
                    value="overview"
                    className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm dark:data-[state=active]:text-gray-200"
                  >
                    Overview
                  </TabsTrigger>
                  <TabsTrigger
                    value="payment"
                    className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm dark:data-[state=active]:text-gray-200"
                  >
                    Payment Methods
                  </TabsTrigger>
                  <TabsTrigger
                    value="invoices"
                    className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-800 data-[state=active]:shadow-sm dark:data-[state=active]:text-gray-200"
                  >
                    Invoices
                  </TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Current Plan Card */}
                    <Card className="md:col-span-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                      <CardHeader>
                        <div className="flex justify-between items-start">
                          <div>
                            <CardTitle className="text-xl text-gray-900 dark:text-white">
                              Current Plan
                            </CardTitle>
                            <CardDescription className="mt-2">
                              You are currently on the{" "}
                              <span className="font-semibold text-purple-600 dark:text-purple-400">
                                {currentPlan.name}
                              </span>
                            </CardDescription>
                          </div>
                          <Badge
                            variant="secondary"
                            className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800"
                          >
                            {currentPlan.status}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-bold text-gray-900 dark:text-white">
                            {currentPlan.price}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Renews automatically on {currentPlan.nextBilling}
                        </p>
                        <div className="space-y-2 mt-4">
                          {currentPlan.features.map((feature, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300"
                            >
                              <CheckCircle2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                              {feature}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                      <CardFooter className="flex gap-4 border-t border-gray-100 dark:border-gray-800 pt-6">
                        <Button
                          onClick={() => navigate("/plans")}
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          Change Plan
                        </Button>
                        <Button
                          variant="outline"
                          className="dark:bg-transparent dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                        >
                          Cancel Subscription
                        </Button>
                      </CardFooter>
                    </Card>

                    {/* Stats / Usage (Placeholder) */}
                    <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                      <CardHeader>
                        <CardTitle className="text-lg text-gray-900 dark:text-white">
                          Usage
                        </CardTitle>
                        <CardDescription>
                          Credits used this month
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col items-center justify-center py-6 space-y-4">
                          <div className="relative h-32 w-32 rounded-full border-8 border-gray-100 dark:border-gray-800 flex items-center justify-center">
                            <div className="absolute inset-0 rounded-full border-8 border-purple-600 border-t-transparent rotate-45"></div>
                            <span className="text-2xl font-bold text-gray-900 dark:text-white">
                              75%
                            </span>
                          </div>
                          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                            7,500 / 10,000 Credits
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* Payment Methods Tab */}
                <TabsContent value="payment" className="space-y-6">
                  <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                    <CardHeader>
                      <CardTitle className="text-xl text-gray-900 dark:text-white">
                        Payment Methods
                      </CardTitle>
                      <CardDescription>
                        Manage your credit cards and payment details.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {paymentMethods.map((method) => (
                        <div
                          key={method.id}
                          className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30"
                        >
                          <div className="flex items-center gap-4">
                            <div className="h-10 w-16 bg-white dark:bg-gray-800 rounded flex items-center justify-center border border-gray-200 dark:border-gray-700">
                              <CreditCard className="w-6 h-6 text-gray-600 dark:text-gray-400" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">
                                {method.type} ending in {method.last4}
                              </p>
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                Expires {method.expiry}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {method.isDefault && (
                              <Badge
                                variant="secondary"
                                className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                              >
                                Default
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              className="text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full sm:w-auto bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100">
                        <Plus className="w-4 h-4 mr-2" /> Add Payment Method
                      </Button>
                    </CardFooter>
                  </Card>
                </TabsContent>

                {/* Invoices Tab */}
                <TabsContent value="invoices" className="space-y-6">
                  <Card className="border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                    <CardHeader>
                      <CardTitle className="text-xl text-gray-900 dark:text-white">
                        Billing History
                      </CardTitle>
                      <CardDescription>
                        Download your previous invoices.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-gray-200 dark:border-gray-800">
                            <TableHead className="w-[150px]">
                              Invoice ID
                            </TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoices.map((invoice) => (
                            <TableRow
                              key={invoice.id}
                              className="hover:bg-gray-50 dark:hover:bg-gray-800/50 border-gray-200 dark:border-gray-800"
                            >
                              <TableCell className="font-medium text-gray-900 dark:text-white">
                                {invoice.id}
                              </TableCell>
                              <TableCell className="text-gray-500 dark:text-gray-400">
                                {invoice.date}
                              </TableCell>
                              <TableCell className="text-gray-900 dark:text-white">
                                {invoice.amount}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={`bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border border-green-200 dark:border-green-800`}
                                >
                                  {invoice.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                >
                                  <Download className="w-4 h-4 mr-2" />
                                  Download
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>

              {/* Security Note */}
              <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-900/30">
                <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900 dark:text-blue-300">
                    Secure Payment Processing
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-400 mt-1">
                    All payments are processed securely via Stripe. We do not
                    store your credit card information on our servers.
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Billing;
