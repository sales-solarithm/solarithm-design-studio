"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { collection, query, where, getDocs, addDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Loader2, ShieldAlert, LogOut, CheckCircle2, Send, RefreshCw, AlertTriangle } from "lucide-react";

export const SUPER_ADMIN_EMAILS = [
  "jayjalpa2002@gmail.com",
  "jay.solarithm@gmail.com"
];

export const ALLOWED_ROLES = ["designer", "design", "engineer", "admin", "owner", "architect", "employee"];

export const DESIGN_STUDIO_APP_ID = "solarithm-design-studio";
export const DESIGN_STUDIO_APP_IDS = [
  "solarithm-design-studio",
  "solarithm_design_studio",
  "design_studio",
  "design-studio"
];

export const checkHasDesignStudioAccess = (accessibleApps?: string[] | null): boolean => {
  if (!Array.isArray(accessibleApps)) return false;
  return accessibleApps.some((appId) =>
    typeof appId === "string" && (
      DESIGN_STUDIO_APP_IDS.includes(appId) ||
      DESIGN_STUDIO_APP_IDS.includes(appId.toLowerCase().trim())
    )
  );
};

// Session storage keys
const SESSION_EMAIL_KEY = "solarithm_user_email";
const SESSION_ROLE_KEY = "solarithm_user_role";
const SESSION_TIMESTAMP_KEY = "solarithm_auth_timestamp";

// In-memory session store
let inMemorySession = {
  email: "",
  role: ""
};

export const clearStoredEnterpriseAuth = () => {
  inMemorySession = { email: "", role: "" };
  if (typeof window !== "undefined") {
    const allKeys = [
      SESSION_EMAIL_KEY,
      SESSION_ROLE_KEY,
      SESSION_TIMESTAMP_KEY,
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
    try {
      document.cookie = `${SESSION_EMAIL_KEY}=; path=/; max-age=0`;
      document.cookie = `${SESSION_ROLE_KEY}=; path=/; max-age=0`;
    } catch {}
  }
};

export const setStoredEnterpriseAuth = (email: string, role: string) => {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanRole = (role || "designer").trim().toLowerCase();
  inMemorySession.email = cleanEmail;
  inMemorySession.role = cleanRole;

  if (typeof window !== "undefined" && cleanEmail) {
    try {
      localStorage.setItem(SESSION_EMAIL_KEY, cleanEmail);
      localStorage.setItem(SESSION_ROLE_KEY, cleanRole);
      localStorage.setItem("userEmail", cleanEmail);
      localStorage.setItem("lockedEmail", cleanEmail);
      localStorage.setItem("userRole", cleanRole);
      localStorage.setItem("lockedRole", cleanRole);
      localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());

      // Also set cookie for persistent browser state
      document.cookie = `${SESSION_EMAIL_KEY}=${encodeURIComponent(cleanEmail)}; path=/; max-age=2592000; SameSite=Lax`;
      document.cookie = `${SESSION_ROLE_KEY}=${encodeURIComponent(cleanRole)}; path=/; max-age=2592000; SameSite=Lax`;
    } catch {}
  }
};

export const getStoredEnterpriseEmail = (): string => {
  if (inMemorySession.email) return inMemorySession.email;
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(SESSION_EMAIL_KEY) ||
                     localStorage.getItem("userEmail") ||
                     localStorage.getItem("lockedEmail") ||
                     "";
      if (stored) return stored.trim().toLowerCase();

      // Check cookie fallback
      const match = document.cookie.match(new RegExp(`(^|;\\s*)${SESSION_EMAIL_KEY}=([^;]*)`));
      if (match && match[2]) {
        return decodeURIComponent(match[2]).trim().toLowerCase();
      }
    } catch {}
  }
  return "";
};

export const getStoredEnterpriseRole = (): string => {
  if (inMemorySession.role) return inMemorySession.role;
  if (typeof window !== "undefined") {
    try {
      const storedRole = localStorage.getItem(SESSION_ROLE_KEY) ||
                         localStorage.getItem("userRole") ||
                         localStorage.getItem("lockedRole") ||
                         "";
      if (storedRole) return storedRole.trim().toLowerCase();

      const match = document.cookie.match(new RegExp(`(^|;\\s*)${SESSION_ROLE_KEY}=([^;]*)`));
      if (match && match[2]) {
        return decodeURIComponent(match[2]).trim().toLowerCase();
      }
    } catch {}
  }
  return "designer";
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
  const loadingRef = useRef(loading);
  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);
  const [unauthorizedError, setUnauthorizedError] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState<boolean>(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState<boolean>(false);
  const [showLongWaitNotice, setShowLongWaitNotice] = useState<boolean>(false);

  const isLoginPage = pathname === "/login";
  const activeVerificationRef = useRef<string>("");

  const verifyEmailAccess = useCallback(async (targetEmail: string, currentUserObj?: any) => {
    const normalizedEmail = (targetEmail || "").toLowerCase().trim();
    if (!normalizedEmail) {
      clearStoredEnterpriseAuth();
      setUser(null);
      setEmail("");
      setRole("");
      setUnauthorizedError(null);
      setGatewayError(null);
      setLoading(false);
      if (!isLoginPage) {
        router.replace("/login");
      }
      return;
    }

    activeVerificationRef.current = normalizedEmail;
    setLoading(true);
    setGatewayError(null);
    setUnauthorizedError(null);
    setEmail(normalizedEmail);
    setUser(currentUserObj || { email: normalizedEmail, displayName: normalizedEmail.split("@")[0] });

    // 1. Owner Bypass: If email is in SUPER_ADMIN_EMAILS, immediately grant access without network wait
    const isOwnerBypass = SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(normalizedEmail);
    if (isOwnerBypass) {
      const assignedRole = "owner";
      setRole(assignedRole);
      setStoredEnterpriseAuth(normalizedEmail, assignedRole);
      setLoading(false);
      return;
    }

    // 2. Query 'users' collection with a strict 4.5-second timeout limit
    try {
      const usersQuery = query(
        collection(db, "users"),
        where("email", "==", normalizedEmail)
      );

      // Race Firestore query against a 4.5-second timeout
      const queryPromise = getDocs(usersQuery);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("GATEWAY_TIMEOUT")), 4500)
      );

      const querySnapshot = await Promise.race([queryPromise, timeoutPromise]);

      // Check if another verification superseded this one
      if (activeVerificationRef.current !== normalizedEmail) return;

      if (querySnapshot.empty) {
        clearStoredEnterpriseAuth();
        setUser(null);
        setEmail("");
        setRole("");
        setUnauthorizedError(
          `Access Denied: The email "${normalizedEmail}" was not found in the authorized user roster. Please contact your administrator.`
        );
        setLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0]?.data();
      const accessibleApps: string[] = Array.isArray(userDoc?.accessibleApps) ? userDoc.accessibleApps : [];

      const hasAccess = checkHasDesignStudioAccess(accessibleApps);

      if (!hasAccess) {
        // Explicitly unassigned to Design Studio - deny entry immediately
        clearStoredEnterpriseAuth();
        setUser(null);
        setEmail("");
        setRole("");
        setUnauthorizedError("Access Denied: You do not have permission to access Design Studio.");
        setLoading(false);
        return;
      }

      const rawRole = (userDoc?.role || userDoc?.assignedRole || "designer").toLowerCase().trim();
      const finalRole = rawRole === "owner" || rawRole === "admin" ? rawRole : "designer";

      setRole(finalRole);
      setStoredEnterpriseAuth(normalizedEmail, finalRole);
      setUnauthorizedError(null);
      setGatewayError(null);
      setLoading(false);
    } catch (error: any) {
      if (activeVerificationRef.current !== normalizedEmail) return;

      console.warn("Security Gateway check delayed or encountered an issue:", error?.message || error);

      // 3. Fallback: If gateway check timed out or failed, check if active session exists in localStorage
      const cachedEmail = getStoredEnterpriseEmail();
      const cachedRole = getStoredEnterpriseRole();

      if (cachedEmail === normalizedEmail && cachedRole) {
        console.info(`[AuthGuard] Restoring verified active session for ${normalizedEmail} (Role: ${cachedRole})`);
        setRole(cachedRole);
        setUnauthorizedError(null);
        setGatewayError(null);
        setLoading(false);
        return;
      }

      // If no valid active session was cached, stop spinning and show explicit retry error screen
      setLoading(false);
      setGatewayError(
        error?.message === "GATEWAY_TIMEOUT"
          ? "Connection to Solarithm Master Security Gateway timed out. High network latency or firewall restrictions may be delaying verification."
          : "Unable to verify credentials with Security Gateway. Please check your network connection."
      );
    }
  }, [isLoginPage, router]);

  useEffect(() => {
    let isMounted = true;

    // Timer to alert user if gateway check is taking unusually long
    const waitTimer = setTimeout(() => {
      if (isMounted && loadingRef.current && !isLoginPage) {
        setShowLongWaitNotice(true);
      }
    }, 3500);

    const storedEmail = getStoredEnterpriseEmail();
    if (storedEmail) {
      const verifyTimer = setTimeout(() => {
        if (isMounted) {
          verifyEmailAccess(storedEmail);
        }
      }, 0);
      return () => {
        isMounted = false;
        clearTimeout(waitTimer);
        clearTimeout(verifyTimer);
      };
    } else {
      // Check Firebase Auth as fallback
      let authResolved = false;
      const authTimeout = setTimeout(() => {
        if (!authResolved && isMounted) {
          setLoading(false);
          if (!isLoginPage) {
            router.replace("/login");
          }
        }
      }, 3500);

      const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
        authResolved = true;
        clearTimeout(authTimeout);
        if (!isMounted) return;

        if (currentUser && currentUser.email) {
          verifyEmailAccess(currentUser.email, currentUser);
        } else {
          clearStoredEnterpriseAuth();
          setUser(null);
          setEmail("");
          setRole("");
          setUnauthorizedError(null);
          setGatewayError(null);
          setLoading(false);
          if (!isLoginPage) {
            router.replace("/login");
          }
        }
      });

      return () => {
        isMounted = false;
        clearTimeout(waitTimer);
        clearTimeout(authTimeout);
        unsubscribe();
      };
    }

    return () => {
      isMounted = false;
      clearTimeout(waitTimer);
    };
  }, [isLoginPage, router, verifyEmailAccess]);

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
      setGatewayError(null);
      setRequestSent(false);
      router.replace("/login");
    }
  };

  const handleLogin = (authenticatedEmail: string, authenticatedRole: string) => {
    const cleanEmail = (authenticatedEmail || "").toLowerCase().trim();
    setStoredEnterpriseAuth(cleanEmail, authenticatedRole);
    setEmail(cleanEmail);
    setRole(authenticatedRole);
    setUser({ email: cleanEmail, displayName: cleanEmail.split("@")[0] });
    setUnauthorizedError(null);
    setGatewayError(null);
    setLoading(false);
  };

  const handleBypassWithActiveSession = () => {
    const cachedEmail = getStoredEnterpriseEmail();
    const cachedRole = getStoredEnterpriseRole() || "designer";
    if (cachedEmail) {
      setEmail(cachedEmail);
      setRole(cachedRole);
      setUser({ email: cachedEmail, displayName: cachedEmail.split("@")[0] });
      setLoading(false);
      setGatewayError(null);
    } else {
      router.replace("/login");
    }
  };

  const handleRequestAccess = async () => {
    if (!email) return;
    setIsSubmittingRequest(true);
    try {
      await addDoc(collection(db, "approvals"), {
        type: "PASSWORD_RESET_REQUEST",
        requestedEmail: email.toLowerCase().trim(),
        email: email.toLowerCase().trim(),
        appName: "Solarithm Design Studio",
        appId: DESIGN_STUDIO_APP_ID,
        reason: "Access authorization requested for Design Studio",
        status: "pending",
        timestamp: new Date().toISOString()
      });

      try {
        await addDoc(collection(db, "auditLogs"), {
          action: "ACCESS_AUTHORIZATION_REQUESTED",
          actor: email.toLowerCase().trim(),
          target: email.toLowerCase().trim(),
          details: {
            appName: "Solarithm Design Studio",
            appId: DESIGN_STUDIO_APP_ID,
            reason: "Access authorization requested for Design Studio"
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

  // Gateway Connection Error Screen with Retry
  if (gatewayError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#121212] p-4 text-gray-900 dark:text-gray-100 transition-colors">
        <div className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-2xl shadow-xl border border-amber-300 dark:border-amber-700/50 max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-[#D4AF37]">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Gateway Connection Issue</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
            {gatewayError}
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                const target = email || getStoredEnterpriseEmail();
                if (target) verifyEmailAccess(target);
                else router.replace("/login");
              }}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#B5952F] text-black text-sm font-semibold transition-colors shadow-sm cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Retry Connection
            </button>

            {getStoredEnterpriseEmail() && (
              <button
                onClick={handleBypassWithActiveSession}
                className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#333333] text-gray-800 dark:text-gray-200 text-sm font-medium transition-colors cursor-pointer"
              >
                Proceed with Active Session
              </button>
            )}

            <button
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-gray-200 dark:border-[#333333] hover:bg-gray-50 dark:hover:bg-[#252525] text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign in with another account
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state with long wait notice & fallback button
  if (loading) {
    const hasCachedSession = !!getStoredEnterpriseEmail();

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#121212] p-4 text-gray-900 dark:text-gray-100 transition-colors">
        <div className="flex flex-col items-center gap-4 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Verifying Authorization...</p>
            <p className="text-xs text-gray-400 mt-0.5">Connecting to Solarithm Master Security Gateway</p>
          </div>

          {showLongWaitNotice && (
            <div className="mt-4 p-4 rounded-xl bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333333] shadow-sm w-full animate-fade-in">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Security Gateway response is taking longer than usual.
              </p>
              <div className="flex flex-col gap-2">
                {hasCachedSession && (
                  <button
                    onClick={handleBypassWithActiveSession}
                    className="w-full py-2 px-3 bg-[#D4AF37] hover:bg-[#B5952F] text-black text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Enter Workspace with Cached Session
                  </button>
                )}
                <button
                  onClick={() => {
                    const target = email || getStoredEnterpriseEmail();
                    if (target) verifyEmailAccess(target);
                  }}
                  className="w-full py-1.5 px-3 bg-gray-100 dark:bg-[#2A2A2A] hover:bg-gray-200 dark:hover:bg-[#333333] text-gray-700 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry Gateway Check
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // If unauthorized error (Access Restricted)
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
              className="w-full mb-3 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-black text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
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
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-900 dark:bg-[#2A2A2A] hover:bg-gray-800 dark:hover:bg-[#333333] text-white text-sm font-medium transition-colors cursor-pointer"
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
