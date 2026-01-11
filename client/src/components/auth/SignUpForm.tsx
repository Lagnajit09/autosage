"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
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
import { useNavigate, Link } from "react-router-dom"; // Fixed import
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
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

const SignUpSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: "You must accept the terms and conditions",
  }),
});

const OTPSchema = z.object({
  otp: z.string().min(6, { message: "OTP must be 6 characters" }),
});

export function SignUpForm() {
  const { isLoading, setIsLoading } = useLoading();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");

  const form = useForm<z.infer<typeof SignUpSchema>>({
    resolver: zodResolver(SignUpSchema),
    defaultValues: {
      email: "",
      acceptTerms: false,
    },
  });

  const otpForm = useForm<z.infer<typeof OTPSchema>>({
    resolver: zodResolver(OTPSchema),
    defaultValues: { otp: "" },
  });

  const onEmailSubmit = async (values: z.infer<typeof SignUpSchema>) => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setEmail(values.email);
      setStep("otp");
      toast({
        title: "Verification Sent",
        description: "We've sent a code to your email.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send code.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onOTPSubmit = async (values: z.infer<typeof OTPSchema>) => {
    setIsLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("Verified OTP:", values.otp, "for new account:", email);
      toast({
        title: "Account Created!",
        description: "Welcome to AutoSage.",
      });
      navigate("/dashboard");
    } catch (error) {
      toast({
        title: "Error",
        description: "Invalid code.",
        variant: "destructive",
      });
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
                              to=""
                              className="text-gray-700 dark:text-gray-400 hover:underline font-medium"
                            >
                              Terms of Service
                            </Link>{" "}
                            and{" "}
                            <Link
                              to=""
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
              <SocialAuth isLoading={isLoading} />
            </>
          ) : (
            <Form {...otpForm}>
              <form
                onSubmit={otpForm.handleSubmit(onOTPSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={otpForm.control}
                  name="otp"
                  render={({ field }) => (
                    <FormItem className="flex flex-col items-center justify-center">
                      <FormLabel className="sr-only">
                        One-Time Password
                      </FormLabel>
                      <FormControl>
                        <InputOTP maxLength={6} {...field}>
                          <InputOTPGroup className="text-gray-800 dark:text-gray-200">
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <Spinner size="sm" variant="white" className="mr-2" />
                      Verifying...
                    </div>
                  ) : (
                    "Verify & Create Account"
                  )}
                </Button>
                <Button
                  variant="link"
                  className="w-full text-xs font-normal"
                  onClick={() => setStep("email")}
                  type="button"
                >
                  Change Email
                </Button>
              </form>
            </Form>
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
