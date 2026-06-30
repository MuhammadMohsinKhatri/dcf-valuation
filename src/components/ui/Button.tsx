"use client";
import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none tracking-tight",
          {
            "bg-[#0f2744] text-white hover:bg-[#1a3a5c]": variant === "primary",
            "bg-white text-gray-700 hover:bg-gray-50 border border-gray-200 hover:border-gray-300": variant === "secondary",
            "hover:bg-gray-100 text-gray-600": variant === "ghost",
            "bg-red-600 text-white hover:bg-red-700": variant === "danger",
            "h-7 px-3 text-xs": size === "sm",
            "h-9 px-4 text-sm": size === "md",
            "h-10 px-5 text-sm": size === "lg",
          },
          className
        )}
        {...props}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {children}
          </span>
        ) : children}
      </button>
    );
  }
);
Button.displayName = "Button";
