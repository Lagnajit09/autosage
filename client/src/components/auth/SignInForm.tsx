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
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Checkbox } from "..//ui/checkbox";
import { Lock, Mail, Phone } from "lucide-react";
import { SigninFormSchema } from "../../lib/form";
import { useLoading } from "../../contexts/LoadingContext";
import { Spinner } from "../ui/spinner";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { signin } from "@/lib/actions/auth";

// Create a TypeScript type from the schema
type FormValues = z.infer<typeof SigninFormSchema>;

export function SignInForm() {
  const { isLoading, setIsLoading } = useLoading();
  const navigate = useNavigate();

  // Initialize form with proper typing
  const form = useForm<FormValues>({
    resolver: zodResolver(SigninFormSchema),
    defaultValues: {
      username: "",
      password: "",
      rememberMe: false,
    },
  });

  // Form submission handler
  const onSubmit = async (values: z.infer<typeof SigninFormSchema>) => {
    // Handle registration
    setIsLoading(true);
    const { username, password } = values;

    try {
      const res = await signin({ username, password });
      if (res?.success) {
        toast({
          title: `Welcome, ${values.username}`,
          description: res.message || "Signed In successfully!",
          variant: "default",
        });
        navigate("/dashboard");
      } else {
        toast({
          title: "Failed to Sign-In!",
          description: res.message,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Failed to Sign-In!",
        description: "An unexpected error occurred!",
        variant: "destructive",
      });
      console.error(error);
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
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="username"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">Username</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <Input
                      placeholder="JohnDoe2004"
                      className="pl-10 text-gray-300"
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
              <FormItem>
                <FormLabel className="text-gray-300">Password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                    <Input
                      type="password"
                      placeholder="********"
                      className="pl-10 text-gray-300"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-between items-center">
            <FormField
              control={form.control}
              name="rememberMe"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="bg-gray-300 text-gray-900"
                    />
                  </FormControl>
                  <FormLabel className="text-sm font-normal cursor-pointer text-gray-300">
                    Remember me
                  </FormLabel>
                </FormItem>
              )}
            />
            <Link
              to=""
              className="text-sm text-purple-400 hover:text-swift-dark-purple"
            >
              Forgot password?
            </Link>
          </div>
          <Button
            type="submit"
            className="w-full bg-gray-300 text-gray-800 hover:bg-gray-200"
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <Spinner size="sm" variant="white" className="mr-2" />
                Signing in...
              </div>
            ) : (
              "Sign In"
            )}
          </Button>
        </form>
      </Form>
    </motion.div>
  );
}
