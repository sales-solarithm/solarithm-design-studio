"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Loader2, ShieldAlert, LogOut, CheckCircle2, Send } from "lucide-react";

export const SUPER_ADMIN_EMAILS = [
  "jayjalpa2002@gmail.com",
  "jay.solarithm@gmail.com"
];

export const ALLOWED_ROLES = ["designer", "design", "engineer", "admin", "owner", "architect", "employee"];

// Ephemeral in-memory session store (wiped automatically on browser refresh)
let inMemorySession = {
  email: "",
  role: ""
};

export const clearStoredEnterpriseAuth = () => {
  inMemorySession = { email: "", role: "" };
  if (typeof window !== "undefined") {
    const allKeys = [
      "lockedEmail",
      "userEmail",
      "solarithm_user_email",
      "currentUserEmail",
      "adminEmail",
      "lockedRole",
      "userRole",
      "solarithm_user_role",
      "currentUserRole",
      "cachedProjects",
      "cachedClients",
      "solarithm_projects",
      "solarithm_clients",
      "solarithm_proposals"
    ];
    allKeys.forEach((key) => {
      try {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      } catch {}
    });
  }
};

// Immediately purge any stale storage tokens upon initial load
if (typeof window !== "undefined") {
  clearStoredEnterpriseAuth();
}

export const setStoredEnterpriseAuth = (email: string, role: string) => {
  // Completely delete localStorage/sessionStorage caching mechanism.
  // Ephemeral session state is held strictly in memory.
  inMemorySession.email = email;
  inMemorySession.role = role;
};

export const getStoredEnterpriseEmail = (): string => {
  // Ephemeral in-memory only (returns empty string on page refresh)
  return inMemorySession.email;
};

export const getStoredEnterpriseRole = (): string => {
  // Ephemeral in-memory only (returns empty string on page refresh)
  return inMemorySession.role;
};

interface AuthContextType {
  user: User | { email: string; displayName?: string } | null;
  email: string;
  role: string;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, role: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  email: "",
  role: "",
  isAuthenticated: false,
  loading: true,
  login: () => {},
  logout: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const [user, setUser] = useState<User | { email: string; displayName?: string } | null>(null);
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [unauthorizedError, setUnauthorizedError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState<boolean>(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState<boolean>(false);

  const isLoginPage = pathname === "/login";

  useEffect(() => {
    let isMounted = true;

    const verifyEmailAccess = async (targetEmail: string, currentUserObj?: any) => {
      if (!isMounted) return;
      setLoading(true);

      const normalizedEmail = (targetEmail || "").toLowerCase().trim();
      if (!normalizedEmail) {
        clearStoredEnterpriseAuth();
        setUser(null);
        setEmail("");
        setRole("");
        setUnauthorizedError(null);
        setLoading(false);
        if (!isLoginPage) {
          router.replace("/login");
        }
        return;
      }

      setEmail(normalizedEmail);
      setUser(currentUserObj || { email: normalizedEmail, displayName: normalizedEmail.split('@')[0] });

      // 1. Owner Bypass: If email is in SUPER_ADMIN_EMAILS, immediately grant access
      const isOwnerBypass = SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(normalizedEmail);
      if (isOwnerBypass) {
        const assignedRole = "owner";
        setRole(assignedRole);
        setStoredEnterpriseAuth(normalizedEmail, assignedRole);
        setUnauthorizedError(null);
        setLoading(false);
        return;
      }

      // 2. Verify role against central employees and users collections
      try {
        let detectedRole = "";

        // Check employees collection (Master Blueprint Central Directory)
        try {
          const empQuery = query(
            collection(db, "employees"),
            where("email", "==", normalizedEmail)
          );
          const empSnap = await getDocs(empQuery);
          if (!empSnap.empty) {
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
        } catch (err) {
          console.warn("Could not query employees collection:", err);
        }

        // If not found in employees, check users collection (Mirrored auth profile)
        if (!detectedRole) {
          try {
            const usersQuery = query(
              collection(db, "users"),
              where("email", "==", normalizedEmail)
            );
            const userSnap = await getDocs(usersQuery);
            if (!userSnap.empty) {
              const userData = userSnap.docs[0].data();
              detectedRole = userData.role || userData.assignedRole || "";
            }
          } catch (err) {
            console.warn("Could not query users collection:", err);
          }
        }

        const normalizedRole = detectedRole.toLowerCase().trim();

        if (ALLOWED_ROLES.includes(normalizedRole) || (detectedRole && detectedRole.length > 0)) {
          const finalRole = normalizedRole === "owner" || normalizedRole === "admin" ? normalizedRole : "designer";
          setRole(finalRole);
          setStoredEnterpriseAuth(normalizedEmail, finalRole);
          setUnauthorizedError(null);
        } else {
          // Deny access: clear tokens and show unauthorized screen
          clearStoredEnterpriseAuth();
          setRole("");
          setUnauthorizedError(
            `Access Denied: Your account (${normalizedEmail}) does not have authorized Designer, Admin, or Owner permissions in the central database.`
          );
        }
      } catch (error) {
        console.error("Error verifying user permissions:", error);
        clearStoredEnterpriseAuth();
        setUnauthorizedError("Error verifying permissions. Please check connection or contact system administrator.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // Check stored enterprise email first (Email-only login model)
    const storedEmail = getStoredEnterpriseEmail();
    if (storedEmail) {
      verifyEmailAccess(storedEmail);
    } else {
      // Check Firebase Auth as alternative/fallback
      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        if (currentUser && currentUser.email) {
          verifyEmailAccess(currentUser.email, currentUser);
        } else {
          clearStoredEnterpriseAuth();
          setUser(null);
          setEmail("");
          setRole("");
          setUnauthorizedError(null);
          setLoading(false);
          if (!isLoginPage) {
            router.replace("/login");
          }
        }
      });
      return () => {
        isMounted = false;
        unsubscribe();
      };
    }

    return () => {
      isMounted = false;
    };
  }, [isLoginPage, router]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Signout error:", err);
    } finally {
      clearStoredEnterpriseAuth();
      setUser(null);
      setRole("");
      setEmail("");
      setUnauthorizedError(null);
      setRequestSent(false);
      router.replace("/login");
    }
  };

  const handleLogin = (authenticatedEmail: string, authenticatedRole: string) => {
    const cleanEmail = (authenticatedEmail || "").toLowerCase().trim();
    setStoredEnterpriseAuth(cleanEmail, authenticatedRole);
    setEmail(cleanEmail);
    setRole(authenticatedRole);
    setUser({ email: cleanEmail, displayName: cleanEmail.split('@')[0] });
    setUnauthorizedError(null);
    setLoading(false);
  };

  const handleRequestAccess = async () => {
    if (!email) return;
    setIsSubmittingRequest(true);
    try {
      // Dispatch authorization / password reset exception to approvals collection
      await addDoc(collection(db, "approvals"), {
        type: "PASSWORD_RESET_REQUEST",
        requestedEmail: email.toLowerCase().trim(),
        email: email.toLowerCase().trim(),
        appName: "Solarithm Designer's Project Sheet",
        appId: "designer-portal",
        reason: "Access authorization requested from Designer Portal",
        status: "pending",
        timestamp: new Date().toISOString()
      });

      // Telemetry log to auditLogs
      try {
        await addDoc(collection(db, "auditLogs"), {
          action: "ACCESS_AUTHORIZATION_REQUESTED",
          actor: email.toLowerCase().trim(),
          target: email.toLowerCase().trim(),
          details: {
            appName: "Solarithm Designer's Project Sheet",
            appId: "designer-portal",
            reason: "Access authorization requested from Designer Portal"
          },
          timestamp: new Date().toISOString()
        });
      } catch {}

      setRequestSent(true);
    } catch (err) {
      console.error("Failed to submit access request:", err);
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  // If on /login, render children directly without auth blocker
  if (isLoginPage) {
    return (
      <AuthContext.Provider
        value={{
          user,
          email,
          role,
          isAuthenticated: !!email,
          loading,
          login: handleLogin,
          logout: handleLogout
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }

  // Loading state while verifying Firebase auth
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-gray-100 transition-colors">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Verifying Authorization...</p>
            <p className="text-xs text-gray-400 mt-0.5">Connecting to Solarithm Master Security Gateway</p>
          </div>
        </div>
      </div>
    );
  }

  // If unauthorized error
  if (unauthorizedError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#121212] p-4 text-gray-900 dark:text-gray-100 transition-colors">
        <div className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-2xl shadow-xl border border-rose-200 dark:border-rose-900/40 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 flex items-center justify-center text-rose-500">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Access Restricted</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
            {unauthorizedError}
          </p>

          {requestSent ? (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400 text-xs flex items-center gap-2 text-left">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Authorization request dispatched to Admin Console. An administrator will review your account.</span>
            </div>
          ) : (
            <button
              onClick={handleRequestAccess}
              disabled={isSubmittingRequest}
              className="w-full mb-3 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
            >
              {isSubmittingRequest ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              Request Admin Approval
            </button>
          )}

          <div className="flex flex-col gap-2">
            <button
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-900 dark:bg-[#2A2A2A] hover:bg-gray-800 dark:hover:bg-[#333333] text-white text-sm font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign in with another account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // If not logged in and not on login page, render nothing while redirect occurs
  if (!email && !isLoginPage) {
    return null;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        email,
        role,
        isAuthenticated: !!email,
        loading,
        login: handleLogin,
        logout: handleLogout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
