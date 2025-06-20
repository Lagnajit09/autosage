"use client";

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

import { Mail, Lock, User } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Checkbox } from "../ui/checkbox";
import { SignupFormSchema } from "../../lib/form";
// import signup from "@/app/lib/actions/signup";
import { useLoading } from "../../contexts/LoadingContext";
import { Spinner } from "../ui/spinner";
import { Link } from "react-router-dom";

export function SignUpForm() {
  const { isLoading, setIsLoading } = useLoading();

  // Initialize form
  const form = useForm<z.infer<typeof SignupFormSchema>>({
    resolver: zodResolver(SignupFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
    },
  });

  // Form submission handler
  const onSubmit = async () => {
    // Handle registration
    setIsLoading(true);
    // const { name, email, phone, password } = values;
    // try {
    //   const res = await signup(name, email, phone, password);
    //   if (res?.ok) {
    //     const user = await signIn("credentials", {
    //       ...values,
    //       redirect: false,
    //     });
    //   } else {
    //     if (res.status === 400) {
    //       toast({
    //         title: "Failed to Create Account!",
    //         description: "An account with this Email or Phone already exists.",
    //         variant: "destructive",
    //       });
    //       return;
    //     }
    //     throw new Error(res.message);
    //   }
    // } catch (error: any) {
    //   toast({
    //     title: "Failed to Create Account!",
    //     description: "An error occured!",
    //     variant: "destructive",
    //   });
    //   console.error(error);
    //   return;
    // } finally {
    //   setIsLoading(false);
    // }
    // toast({
    //   title: `Welcome, ${name}`,
    //   description: "Account created successfully!",
    //   variant: "default",
    // });
    // router.push("/email-confirmation");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="text-gray-300">
                <FormLabel>Username</FormLabel>
                <FormControl>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                    <Input
                      placeholder="John Doe"
                      className="pl-10"
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
            name="email"
            render={({ field }) => (
              <FormItem className="text-gray-300">
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                    <Input
                      placeholder="you@example.com"
                      className="pl-10"
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
            name="password"
            render={({ field }) => (
              <FormItem className="text-gray-300">
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                    <Input
                      type="password"
                      placeholder="********"
                      className="pl-10"
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
            name="confirmPassword"
            render={({ field }) => (
              <FormItem className="text-gray-300">
                <FormLabel>Confirm Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                    <Input
                      type="password"
                      placeholder="********"
                      className="pl-10"
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
              <FormItem className="flex items-start space-x-2 space-y-0 text-gray-300">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="bg-white text-gray-800"
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel className="text-sm font-normal cursor-pointer">
                    I accept the{" "}
                    <Link to="" className="text-swift-purple hover:underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link to="" className="text-swift-purple hover:underline">
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
            className="w-full bg-gray-300 text-gray-800 hover:bg-gray-200 mt-2"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <Spinner size="sm" variant="white" className="mr-2" />
                Creating Account...
              </div>
            ) : (
              "Create Account"
            )}
          </Button>
        </form>
      </Form>
    </motion.div>
  );
}
