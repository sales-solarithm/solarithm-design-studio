"use client";

import React, { useState, useEffect } from "react";
import { useAuth } from "@/components/AuthGuard";
import { Dashboard } from "@/components/Dashboard";

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const { email, role, logout } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !email) {
    return null;
  }

  return (
    <Dashboard
      userRole={role || "designer"}
      lockedEmail={email}
      onUnlock={logout}
    />
  );
}
