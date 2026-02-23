import React from "react";
import type { IconType } from "react-icons";

type ButtonVariant = "primary" | "secondary" | "ghost";

interface ButtonProps {
  children: React.ReactNode;
  variant?: ButtonVariant;
  icon?: IconType;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-black hover:bg-accent-hover active:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed",
  secondary:
    "bg-[#1a1a1a] border border-border-subtle text-text-primary hover:bg-white hover:text-black disabled:opacity-40 disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-text-muted hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed",
};

export function Button({
  children,
  variant = "primary",
  icon: Icon,
  onClick,
  disabled = false,
  className = "",
}: ButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-all duration-300 cursor-pointer ${variantClasses[variant]} ${className}`}
    >
      {Icon && <Icon className="text-lg" />}
      {children}
    </button>
  );
}
