"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { useSignIn } from "@clerk/clerk-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Mail, ArrowRight } from "lucide-react";
import { useLoading } from "../../contexts/LoadingContext";
import { Spinner } from "../ui/spinner";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "../ui/card";
import { SocialAuth } from "./SocialAuth";
import { VerifyEmail } from "./VerifyEmail";

// Schema for Email only
const EmailSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
});

export function SignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const { isLoading, setIsLoading } = useLoading();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");

  // Forms
  const emailForm = useForm<z.infer<typeof EmailSchema>>({
    resolver: zodResolver(EmailSchema),
    defaultValues: { email: "" },
  });

  // Handle errors from Clerk
  const handleError = (error: any) => {
    console.error("Clerk Error:", error);
    const msg = error.errors?.[0]?.message || "An unexpected error occurred.";
    toast({
      title: "Error",
      description: msg,
      variant: "destructive",
    });
  };

  // Handlers
  const onEmailSubmit = async (values: z.infer<typeof EmailSchema>) => {
    if (!isLoaded) return;
    setIsLoading(true);

    try {
      // Start the sign-in process using email code
      const { supportedFirstFactors } = await signIn.create({
        identifier: values.email,
      });

      // Find the email code factor
      const emailCodeFactor = supportedFirstFactors?.find(
        (factor) => factor.strategy === "email_code",
      );

      if (emailCodeFactor) {
        // Prepare email code verification
        await signIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: (emailCodeFactor as any).emailAddressId,
        });

        setEmail(values.email);
        setStep("otp");
        toast({
          title: "Code Sent",
          description: "We've sent a verification code to your email.",
        });
      }
    } catch (error) {
      handleError(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="border-border/50 bg-card/95 dark:bg-gray-800/40 dark:border-gray-700/50 backdrop-blur-sm shadow-xl">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight text-center text-gray-900 dark:text-white">
            {step === "email" ? "Welcome back!" : "Verify Email"}
          </CardTitle>
          <CardDescription className="text-center text-gray-500 dark:text-gray-400">
            {step === "email"
              ? "Enter your email to receive a verification code"
              : `Enter the code sent to ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {step === "email" ? (
            <>
              <Form {...emailForm}>
                <form
                  onSubmit={emailForm.handleSubmit(onEmailSubmit)}
                  className="space-y-4"
                >
                  <FormField
                    control={emailForm.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-gray-700 dark:text-gray-400">
                          Email
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="name@example.com"
                              className="pl-10 text-gray-800 dark:text-gray-200"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white border-none shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center">
                        <Spinner size="sm" variant="white" className="mr-2" />
                        Sending Code...
                      </div>
                    ) : (
                      <>
                        Continue with Email
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </form>
              </Form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-gray-50 dark:bg-gray-900 px-2 text-gray-800 dark:text-gray-200">
                    Or continue with
                  </span>
                </div>
              </div>

              <SocialAuth isLoading={isLoading} mode="signin" />
            </>
          ) : (
            <VerifyEmail
              mode="signin"
              email={email}
              onBack={() => setStep("email")}
              onSuccess={() => navigate("/dashboard", { replace: true })}
            />
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-gray-700 dark:text-gray-400 text-center">
            Don't have an account?{" "}
            <a
              href="/signup"
              className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-200 font-medium transition-colors"
            >
              Sign up
            </a>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
