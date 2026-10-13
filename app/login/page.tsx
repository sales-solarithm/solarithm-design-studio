"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  SUPER_ADMIN_EMAILS,
  DESIGN_STUDIO_APP_ID,
  clearStoredEnterpriseAuth,
  useAuth,
  findCorporateUserRecord,
  evaluateDesignerAccess
} from "@/components/AuthGuard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Mail, AlertCircle, ShieldCheck } from "lucide-react";
import { COLLECTIONS } from "@/src/config/schema";

export default function LoginPage() {
  const router = useRouter();
  const { login, email: currentAuthEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (currentAuthEmail) {
      router.replace("/");
    }
  }, [currentAuthEmail, router]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Please enter your corporate email address.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // 1. Super Admin / Verified Partner bypass check
      const isOwner = SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(normalizedEmail);
      if (isOwner) {
        await login(normalizedEmail, "owner", "");
        try {
          await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), {
            action: "DESIGNER_LOGIN",
            actor: normalizedEmail,
            target: normalizedEmail,
            details: {
              role: "owner",
              app: "Solarithm Design Studio",
              appId: DESIGN_STUDIO_APP_ID
            },
            timestamp: new Date().toISOString()
          });
        } catch {}
        router.replace("/");
        return;
      }

      // 2. Query both /users and /employees directories (Directive 3)
      const record = await findCorporateUserRecord(normalizedEmail);

      if (!record) {
        clearStoredEnterpriseAuth();
        setError(`Access Denied: The email "${normalizedEmail}" was not found in the authorized user roster. Please contact your system administrator.`);
        setLoading(false);
        return;
      }

      // 3. Evaluate designer role eligibility
      const evalResult = evaluateDesignerAccess(record.userData, normalizedEmail);

      if (!evalResult.isEligible) {
        clearStoredEnterpriseAuth();
        setError(evalResult.reason || "Access Denied: You do not have permission to access Design Studio.");
        setLoading(false);
        return;
      }

      const finalRole = evalResult.resolvedRole;
      const userDoc = record.userData || {};
      const officialName = userDoc.name || userDoc.displayName || userDoc.fullName || userDoc.employeeName;
      if (officialName && typeof window !== "undefined") {
        localStorage.setItem("solarithm_user_name", officialName.trim());
      }
      await login(normalizedEmail, finalRole, record.userUid, officialName ? officialName.trim() : undefined);

      // Audit Log for secure login event
      try {
        await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), {
          action: "DESIGNER_LOGIN",
          actor: normalizedEmail,
          target: normalizedEmail,
          details: {
            role: finalRole,
            uid: record.userUid,
            app: "Solarithm Design Studio",
            appId: DESIGN_STUDIO_APP_ID,
            designation: record.userData.designation || "",
            department: record.userData.department || ""
          },
          timestamp: new Date().toISOString()
        });
      } catch {}

      router.replace("/");
    } catch (err: any) {
      console.error("Login verification error:", err);
      clearStoredEnterpriseAuth();
      setError(err?.message || "Failed to verify employee credentials. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-50 dark:bg-[#121212] p-4 sm:p-6 transition-colors relative">
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-xl border border-gray-200 dark:border-[#333333] p-6 sm:p-8">
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

          {error && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 flex items-start gap-3 text-rose-700 dark:text-rose-400 text-xs sm:text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-snug">{error}</p>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">
                Corporate Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. prathamsolanke.19@solarithmdesign.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#252525] border border-gray-300 dark:border-[#404040] rounded-xl text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#D4AF37] focus:border-transparent transition-all"
                  autoComplete="email"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#B5952F] text-black font-semibold text-sm transition-colors shadow-md disabled:opacity-50 cursor-pointer mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying Designer Credentials...
                </>
              ) : (
                "Continue to Studio Workspace"
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-gray-100 dark:border-[#2C2C2C] text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Only authorized Solarithm design & engineering personnel may access this workspace.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
