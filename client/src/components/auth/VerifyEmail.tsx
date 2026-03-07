"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useSignIn, useSignUp } from "@clerk/clerk-react";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { toast } from "@/hooks/use-toast";
import { useLoading } from "../../contexts/loading/loading-context";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";

const OTPSchema = z.object({
  otp: z.string().min(6, { message: "OTP must be 6 characters" }),
});

interface VerifyEmailProps {
  mode: "signin" | "signup";
  email: string;
  onBack: () => void;
  onSuccess: () => void;
}

export function VerifyEmail({
  mode,
  email,
  onBack,
  onSuccess,
}: VerifyEmailProps) {
  const {
    isLoaded: isSignInLoaded,
    signIn,
    setActive: setSignInActive,
  } = useSignIn();
  const {
    isLoaded: isSignUpLoaded,
    signUp,
    setActive: setSignUpActive,
  } = useSignUp();
  const { isLoading, setIsLoading } = useLoading();

  const isLoaded = mode === "signin" ? isSignInLoaded : isSignUpLoaded;

  const otpForm = useForm<z.infer<typeof OTPSchema>>({
    resolver: zodResolver(OTPSchema),
    mode: "onChange",
    defaultValues: { otp: "" },
  });

  // Handle errors from Clerk
  const handleError = (error: unknown) => {
    console.error("Clerk Error:", error);
    const msg = (error as Error).message || "An unexpected error occurred.";
    toast({
      title: "Failed to verify email!",
      description: msg,
      variant: "destructive",
    });
  };

  const onOTPSubmit = async (values: z.infer<typeof OTPSchema>) => {
    if (!isLoaded) return;
    setIsLoading(true);

    try {
      if (mode === "signin") {
        // Sign In Flow
        const result = await signIn.attemptFirstFactor({
          strategy: "email_code",
          code: values.otp,
        });

        if (result.status === "complete") {
          await setSignInActive({ session: result.createdSessionId });
          toast({
            title: "Welcome back!",
            description: "Successfully signed in.",
          });
          onSuccess();
        } else {
          console.log("Sign in status:", result.status);
          toast({
            title: "Additional verification needed",
            description: "Please complete the verification process.",
          });
        }
      } else {
        // Sign Up Flow
        const result = await signUp.attemptEmailAddressVerification({
          code: values.otp,
        });

        if (result.status === "complete") {
          await setSignUpActive({ session: result.createdSessionId });
          toast({
            title: "Account Created!",
            description: "Welcome to AutoSage.",
          });
          onSuccess();
        } else if (result.status === "missing_requirements") {
          console.log("Missing requirements:", result.missingFields);
          toast({
            title: "More Information Needed",
            description: "Please complete all required fields.",
          });
        } else {
          console.log("Sign up status:", result.status);
          toast({
            title: "Verification incomplete",
            description: "Please complete the verification process.",
          });
        }
      }
    } catch (error) {
      handleError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded || isLoading) return;
    setIsLoading(true);

    try {
      if (mode === "signin") {
        // Resend code for sign in
        await signIn.prepareFirstFactor({
          strategy: "email_code",
          emailAddressId: signIn.supportedFirstFactors?.find(
            (factor) => factor.strategy === "email_code",
          )?.emailAddressId as string,
        });
      } else {
        // Resend code for sign up
        await signUp.prepareEmailAddressVerification({
          strategy: "email_code",
        });
      }

      toast({
        title: "Code Resent",
        description: "A new verification code has been sent to your email.",
      });
    } catch (error) {
      handleError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeEmail = () => {
    otpForm.reset();
    onBack();
  };

  return (
    <Form {...otpForm}>
      <form onSubmit={otpForm.handleSubmit(onOTPSubmit)} className="space-y-4">
        <FormField
          control={otpForm.control}
          name="otp"
          render={({ field }) => (
            <FormItem className="flex flex-col items-center justify-center">
              <FormLabel className="sr-only">One-Time Password</FormLabel>
              <FormControl>
                <InputOTP
                  maxLength={6}
                  value={field.value}
                  onChange={(value) => {
                    field.onChange(value);
                    // Auto-submit when all 6 digits are entered
                    if (value.length === 6) {
                      otpForm.handleSubmit(onOTPSubmit)();
                    }
                  }}
                >
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
        <Button
          type="submit"
          disabled={isLoading || otpForm.watch("otp").length !== 6}
          className="w-full text-sm font-semibold text-white bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 border-none shadow-md transition-all hover:shadow-lg hover:-translate-y-0.5"
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <Spinner size="sm" variant="white" className="mr-2" />
              Verifying...
            </div>
          ) : (
            `Verify & ${mode === "signin" ? "Sign In" : "Create Account"}`
          )}
        </Button>
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="w-full text-sm font-semibold text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-800 border-none"
            onClick={handleResendCode}
            type="button"
            disabled={isLoading}
          >
            Resend Code
          </Button>
          <Button
            variant="outline"
            className="w-full text-sm font-semibold text-gray-800 dark:text-gray-200 bg-gray-200 dark:bg-gray-800 border-none"
            onClick={handleChangeEmail}
            type="button"
          >
            Change Email
          </Button>
        </div>
      </form>
    </Form>
  );
}
