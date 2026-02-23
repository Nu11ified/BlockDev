import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({
  children,
  className = "",
  onClick,
  hoverable = true,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-card rounded-card p-8 transition-all duration-500 ${
        hoverable ? "hover:bg-card-hover" : ""
      } ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
