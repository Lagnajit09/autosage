"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import { useSignUp } from "@clerk/clerk-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Mail, ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { useLoading } from "../../contexts/LoadingContext";
import { Spinner } from "../ui/spinner";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../ui/card";
import { SocialAuth } from "./SocialAuth";
import { VerifyEmail } from "./VerifyEmail";

const SignUpSchema = z.object({
  firstName: z.string().min(2, { message: "First name is required" }),
  lastName: z.string().min(2, { message: "Last name is required" }),
  email: z.string().email({ message: "Invalid email address" }),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions",
  }),
});

export function SignUpForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { isLoading, setIsLoading } = useLoading();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");

  const form = useForm<z.infer<typeof SignUpSchema>>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      acceptTerms: false,
    },
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

  const onEmailSubmit = async (values: z.infer<typeof SignUpSchema>) => {
    if (!isLoaded) return;
    setIsLoading(true);

    try {
      const { email, firstName, lastName } = values;

      // Start the sign-up process
      await signUp.create({
        emailAddress: email,
        firstName,
        lastName,
      });

      // Prepare email verification
      await signUp.prepareEmailAddressVerification({
        strategy: "email_code",
      });

      setEmail(email);
      setStep("otp");
      toast({
        title: "Verification Sent",
        description: "We've sent a code to your email.",
      });
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
            {step === "email" ? "Create an Account" : "Verify Email"}
          </CardTitle>
          <CardDescription className="text-center text-gray-500 dark:text-gray-400">
            {step === "email"
              ? "Get started with your free account"
              : `Enter the code sent to ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {step === "email" ? (
            <>
              <Form {...form}>
                <form
                  onSubmit={form.handleSubmit(onEmailSubmit)}
                  className="space-y-4"
                >
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="firstName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700 dark:text-gray-400">
                            First Name
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="John"
                              className="text-gray-800 dark:text-gray-200"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="lastName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-gray-700 dark:text-gray-400">
                            Last Name
                          </FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Doe"
                              className="text-gray-800 dark:text-gray-200"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
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
                              placeholder="you@example.com"
                              className="pl-10 text-gray-800 dark:text-gray-200"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="acceptTerms"
                    render={({ field }) => (
                      <FormItem className="flex items-start space-x-2 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            className="text-gray-800 dark:text-gray-200 dark:bg-gray-800 dark:border-gray-700"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-normal cursor-pointer text-gray-700 dark:text-gray-400">
                            I accept the{" "}
                            <Link
                              to="/terms"
                              className="text-gray-700 dark:text-gray-400 hover:underline font-medium"
                            >
                              Terms of Service
                            </Link>{" "}
                            and{" "}
                            <Link
                              to="/privacy"
                              className="text-gray-700 dark:text-gray-400 hover:underline font-medium"
                            >
                              Privacy Policy
                            </Link>
                          </FormLabel>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full mt-2"
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
              <SocialAuth isLoading={isLoading} mode="signup" />
            </>
          ) : (
            <VerifyEmail
              mode="signup"
              email={email}
              onBack={() => setStep("email")}
              onSuccess={() => navigate("/dashboard", { replace: true })}
            />
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <div className="text-sm text-muted-foreground text-center">
            Already have an account?{" "}
            <Link
              to="/signin"
              className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-200 font-medium transition-colors"
            >
              Sign in
            </Link>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
