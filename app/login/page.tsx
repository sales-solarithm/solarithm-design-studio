"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  SUPER_ADMIN_EMAILS,
  ALLOWED_ROLES,
  useAuth
} from "@/components/AuthGuard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Mail, AlertCircle, ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, email: currentAuthEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // If already authenticated in React memory, redirect directly to dashboard
  useEffect(() => {
    if (currentAuthEmail) {
      router.replace("/");
    }
  }, [currentAuthEmail, router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.toLowerCase().trim();
    if (!cleanEmail) {
      setError("Please enter your corporate email address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Owner / Super Admin bypass check
      const isOwner = SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(cleanEmail);
      if (isOwner) {
        login(cleanEmail, "owner");
        try {
          await addDoc(collection(db, "auditLogs"), {
            action: "DESIGNER_LOGIN",
            actor: cleanEmail,
            target: cleanEmail,
            details: {
              role: "owner",
              app: "Solarithm Designer's Project Sheet"
            },
            timestamp: new Date().toISOString()
          });
        } catch {}
        router.replace("/");
        return;
      }

      // 2. Query 'employees' collection in Master Database Hub
      let found = false;
      let detectedRole = "";

      try {
        const empQuery = query(
          collection(db, "employees"),
          where("email", "==", cleanEmail)
        );
        const empSnap = await getDocs(empQuery);
        if (!empSnap.empty) {
          found = true;
          const empData = empSnap.docs[0].data();
          const rawRole = (empData.role || empData.assignedRole || "").toLowerCase().trim();
          const dept = (empData.department || "").toLowerCase();
          const desig = (empData.designation || "").toLowerCase();

          if (rawRole === "owner" || rawRole === "admin") {
            detectedRole = rawRole;
          } else if (
            rawRole.includes("design") ||
            rawRole.includes("engineer") ||
            rawRole.includes("architect") ||
            dept.includes("design") ||
            dept.includes("engineer") ||
            desig.includes("design") ||
            desig.includes("engineer") ||
            desig.includes("architect")
          ) {
            detectedRole = "designer";
          } else if (rawRole) {
            detectedRole = rawRole;
          } else {
            detectedRole = "designer";
          }
        }
      } catch (empErr) {
        console.warn("Could not query employees collection:", empErr);
      }

      // 3. Fallback: Query 'users' collection
      if (!found) {
        try {
          const usersQuery = query(
            collection(db, "users"),
            where("email", "==", cleanEmail)
          );
          const userSnap = await getDocs(usersQuery);
          if (!userSnap.empty) {
            found = true;
            const userData = userSnap.docs[0].data();
            detectedRole = (userData.role || userData.assignedRole || "designer").toLowerCase().trim();
          }
        } catch (userErr) {
          console.warn("Could not query users collection:", userErr);
        }
      }

      if (!found) {
        setError(`Access Denied: The email "${cleanEmail}" was not found in the employee directory or authorized roster. Please contact your system administrator.`);
        setLoading(false);
        return;
      }

      const normalizedRole = detectedRole.toLowerCase().trim();
      if (!ALLOWED_ROLES.includes(normalizedRole) && normalizedRole !== "") {
        setError(`Access Denied: Your account (${cleanEmail}) does not have authorized Designer, Admin, or Engineering permissions.`);
        setLoading(false);
        return;
      }

      const finalRole = normalizedRole === "owner" || normalizedRole === "admin" ? normalizedRole : "designer";
      login(cleanEmail, finalRole);

      // Audit Log for secure login event
      try {
        await addDoc(collection(db, "auditLogs"), {
          action: "DESIGNER_LOGIN",
          actor: cleanEmail,
          target: cleanEmail,
          details: {
            role: finalRole,
            app: "Solarithm Designer's Project Sheet"
          },
          timestamp: new Date().toISOString()
        });
      } catch {}

      router.replace("/");
    } catch (err: any) {
      console.error("Login verification error:", err);
      setError(err.message || "Failed to verify employee credentials. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50 dark:bg-[#121212] p-4 sm:p-6 transition-colors relative">
      {/* Top Bar with Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        {/* Minimal Enterprise Brand Card */}
        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-xl border border-gray-200 dark:border-[#333333] p-6 sm:p-8">
          {/* Logo & Application Title */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 text-[#D4AF37] mb-3">
              <ShieldCheck className="w-6 h-6 text-[#D4AF37]" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Solarithm Designer Portal
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Enter your corporate email to access your engineering workspace
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3 text-rose-700 dark:text-rose-400 text-xs sm:text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-snug">{error}</p>
            </div>
          )}

          {/* Email-Only Sign In Form */}
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="designer@solarithm.com"
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-[#2A2A2A] border border-gray-300 dark:border-[#333333] rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#B89628] hover:from-[#c5a230] hover:to-[#a78620] text-black font-semibold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 mt-4 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Continue"
              )}
            </button>
          </form>
        </div>

        {/* Minimal Footer */}
        <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-4">
          Solarithm Enterprise Cloud Platform &bull; Security Enforced
        </p>
      </div>
    </div>
  );
}
