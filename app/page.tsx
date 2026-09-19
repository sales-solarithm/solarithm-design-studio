"use client";

import React from "react";
import { useAuth } from "@/components/AuthGuard";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const { email, role, logout } = useAuth();

  if (!email) {
    return null; // AuthGuard handles redirect to /login and displays loading screen
  }

  return (
    <Dashboard
      userRole={role || "designer"}
      lockedEmail={email}
      onUnlock={logout}
    />
  );
}
