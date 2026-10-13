"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { User, onAuthStateChanged, signOut } from "firebase/auth";
import { collection, query, where, getDocs, getDoc, doc, addDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Loader2, ShieldAlert, LogOut, CheckCircle2, Send, RefreshCw, AlertTriangle } from "lucide-react";
import { COLLECTIONS } from "@/src/config/schema";

export const SUPER_ADMIN_EMAILS = [
  "jayjalpa2002@gmail.com",
  "deepdavara23@gmail.com",
  "jay.solarithm@gmail.com"
];

export const VERIFIED_PARTNER_EMAILS = SUPER_ADMIN_EMAILS;

export const ALLOWED_ROLES = [
  "designer",
  "lead_designer",
  "lead designer",
  "design",
  "engineer",
  "admin",
  "owner",
  "architect",
  "employee"
];

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
export const SESSION_EMAIL_KEY = "solarithm_user_email";
export const SESSION_ROLE_KEY = "solarithm_user_role";
export const SESSION_UID_KEY = "solarithm_user_uid";
export const SESSION_NAME_KEY = "solarithm_user_name";
export const SESSION_TIMESTAMP_KEY = "solarithm_auth_timestamp";

// In-memory session store
let inMemorySession = {
  email: "",
  role: "",
  uid: "",
  name: ""
};

export const clearStoredEnterpriseAuth = () => {
  inMemorySession = { email: "", role: "", uid: "", name: "" };
  if (typeof window !== "undefined") {
    const allKeys = [
      SESSION_EMAIL_KEY,
      SESSION_ROLE_KEY,
      SESSION_UID_KEY,
      SESSION_NAME_KEY,
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
      "solarithm_user_name",
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
      document.cookie = `${SESSION_UID_KEY}=; path=/; max-age=0`;
      document.cookie = `${SESSION_NAME_KEY}=; path=/; max-age=0`;
    } catch {}
  }
};

export const setStoredEnterpriseAuth = (email: string, role: string, uid?: string, name?: string) => {
  const cleanEmail = (email || "").trim().toLowerCase();
  const cleanRole = (role || "designer").trim().toLowerCase();
  const cleanUid = (uid || "").trim();
  const cleanName = (name || "").trim();

  inMemorySession.email = cleanEmail;
  inMemorySession.role = cleanRole;
  inMemorySession.uid = cleanUid;
  if (cleanName) inMemorySession.name = cleanName;

  if (typeof window !== "undefined" && cleanEmail) {
    try {
      localStorage.setItem(SESSION_EMAIL_KEY, cleanEmail);
      localStorage.setItem(SESSION_ROLE_KEY, cleanRole);
      if (cleanUid) localStorage.setItem(SESSION_UID_KEY, cleanUid);
      if (cleanName) localStorage.setItem(SESSION_NAME_KEY, cleanName);
      localStorage.setItem("userEmail", cleanEmail);
      localStorage.setItem("lockedEmail", cleanEmail);
      localStorage.setItem("userRole", cleanRole);
      localStorage.setItem("lockedRole", cleanRole);
      localStorage.setItem(SESSION_TIMESTAMP_KEY, Date.now().toString());

      document.cookie = `${SESSION_EMAIL_KEY}=${encodeURIComponent(cleanEmail)}; path=/; max-age=2592000; SameSite=Lax`;
      document.cookie = `${SESSION_ROLE_KEY}=${encodeURIComponent(cleanRole)}; path=/; max-age=2592000; SameSite=Lax`;
      if (cleanUid) {
        document.cookie = `${SESSION_UID_KEY}=${encodeURIComponent(cleanUid)}; path=/; max-age=2592000; SameSite=Lax`;
      }
      if (cleanName) {
        document.cookie = `${SESSION_NAME_KEY}=${encodeURIComponent(cleanName)}; path=/; max-age=2592000; SameSite=Lax`;
      }
    } catch {}
  }
};

export const getStoredEnterpriseEmail = (): string => {
  if (inMemorySession.email) return inMemorySession.email;
  if (typeof window !== "undefined") {
    try {
      const stored =
        localStorage.getItem(SESSION_EMAIL_KEY) ||
        localStorage.getItem("userEmail") ||
        localStorage.getItem("lockedEmail") ||
        "";
      if (stored) return stored.trim().toLowerCase();

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
      const storedRole =
        localStorage.getItem(SESSION_ROLE_KEY) ||
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

export const getStoredEnterpriseUid = (): string => {
  if (inMemorySession.uid) return inMemorySession.uid;
  if (typeof window !== "undefined") {
    try {
      const storedUid = localStorage.getItem(SESSION_UID_KEY) || "";
      if (storedUid) return storedUid.trim();

      const match = document.cookie.match(new RegExp(`(^|;\\s*)${SESSION_UID_KEY}=([^;]*)`));
      if (match && match[2]) {
        return decodeURIComponent(match[2]).trim();
      }
    } catch {}
  }
  return "";
};

export const getStoredEnterpriseName = (): string => {
  if (inMemorySession.name) return inMemorySession.name;
  if (typeof window !== "undefined") {
    try {
      const storedName = localStorage.getItem(SESSION_NAME_KEY) || "";
      if (storedName) return storedName.trim();

      const match = document.cookie.match(new RegExp(`(^|;\\s*)${SESSION_NAME_KEY}=([^;]*)`));
      if (match && match[2]) {
        return decodeURIComponent(match[2]).trim();
      }
    } catch {}
  }
  return "";
};

/**
 * DIRECTIVE 3: Query both /users and /employees directories
 * Checks:
 * - /users (by email, personalEmailAddress, and doc ID)
 * - /employees (by email and doc ID)
 */
export async function findCorporateUserRecord(
  targetEmail: string
): Promise<{ userData: any; userUid: string } | null> {
  const cleanEmail = (targetEmail || "").trim().toLowerCase();
  if (!cleanEmail) return null;

  // 1. Direct doc ID checks
  try {
    const empDoc = await getDoc(doc(db, COLLECTIONS.EMPLOYEES, cleanEmail));
    if (empDoc.exists()) {
      return { userData: empDoc.data(), userUid: empDoc.id };
    }
  } catch {}

  try {
    const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, cleanEmail));
    if (userDoc.exists()) {
      return { userData: userDoc.data(), userUid: userDoc.id };
    }
  } catch {}

  // 2. Query /employees by email
  try {
    const empSnap = await getDocs(
      query(collection(db, COLLECTIONS.EMPLOYEES), where("email", "==", cleanEmail))
    );
    if (!empSnap.empty) {
      const d = empSnap.docs[0];
      return { userData: d.data(), userUid: d.id };
    }
  } catch {}

  // 3. Query /users by email
  try {
    const userSnap = await getDocs(
      query(collection(db, COLLECTIONS.USERS), where("email", "==", cleanEmail))
    );
    if (!userSnap.empty) {
      const d = userSnap.docs[0];
      return { userData: d.data(), userUid: d.id };
    }
  } catch {}

  // 4. Query /users by personalEmailAddress
  try {
    const personalSnap = await getDocs(
      query(collection(db, COLLECTIONS.USERS), where("personalEmailAddress", "==", cleanEmail))
    );
    if (!personalSnap.empty) {
      const d = personalSnap.docs[0];
      return { userData: d.data(), userUid: d.id };
    }
  } catch {}

  // 5. Fallback case-insensitive scan across /employees
  try {
    const allEmpsSnap = await getDocs(collection(db, COLLECTIONS.EMPLOYEES));
    for (const d of allEmpsSnap.docs) {
      const data = d.data();
      const docEmail = String(data.email || "").trim().toLowerCase();
      const docPersonal = String(data.personalEmailAddress || "").trim().toLowerCase();
      const docId = d.id.trim().toLowerCase();
      if (docEmail === cleanEmail || docPersonal === cleanEmail || docId === cleanEmail) {
        return { userData: data, userUid: d.id };
      }
    }
  } catch {}

  // 6. Fallback case-insensitive scan across /users
  try {
    const allUsersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
    for (const d of allUsersSnap.docs) {
      const data = d.data();
      const docEmail = String(data.email || "").trim().toLowerCase();
      const docPersonal = String(data.personalEmailAddress || "").trim().toLowerCase();
      const docId = d.id.trim().toLowerCase();
      if (docEmail === cleanEmail || docPersonal === cleanEmail || docId === cleanEmail) {
        return { userData: data, userUid: d.id };
      }
    }
  } catch {}

  return null;
}

/**
 * DIRECTIVE 3: Role eligibility evaluation
 * Authorize the designer if:
 * - The user's role/designation includes "designer", "design", "engineer", "architect", "lead_designer", "admin", or "owner"
 * - The user's department is "Design", "Engineering", or "Operations"
 * - accessibleApps or assignedApps includes "solarithm-design-studio", "design_studio", "solarithm_design_studio", or "all"
 * - The email ends with @solarithmdesign.com and belongs to an active corporate record
 */
export function evaluateDesignerAccess(
  userData: any,
  targetEmail: string
): { isEligible: boolean; resolvedRole: string; reason?: string } {
  const cleanEmail = (targetEmail || "").trim().toLowerCase();

  // 1. Super admin / verified partner bypass
  if (SUPER_ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(cleanEmail)) {
    return { isEligible: true, resolvedRole: "owner" };
  }

  if (!userData) {
    return {
      isEligible: false,
      resolvedRole: "",
      reason: `Access Denied: The email "${cleanEmail}" was not found in the authorized user roster. Please contact your administrator.`
    };
  }

  // Active status check
  const statusUpper = String(userData.status || "").toUpperCase().trim();
  if (["INACTIVE", "DEACTIVATED", "SUSPENDED", "TERMINATED"].includes(statusUpper)) {
    return {
      isEligible: false,
      resolvedRole: "",
      reason: `Access Denied: The account for "${cleanEmail}" is inactive or suspended.`
    };
  }

  const roleUpper = String(userData.role || "").toUpperCase().trim();
  const assignedRoleUpper = String(userData.assignedRole || "").toUpperCase().trim();
  const designationUpper = String(userData.designation || "").toUpperCase().trim();
  const departmentUpper = String(userData.department || "").toUpperCase().trim();

  // Condition 1: role or designation includes "designer", "design", "engineer", "architect", "lead_designer", "admin", or "owner"
  const hasRoleMatch = (str: string) => {
    const s = str.toUpperCase();
    return (
      s.includes("DESIGNER") ||
      s.includes("DESIGN") ||
      s.includes("ENGINEER") ||
      s.includes("ARCHITECT") ||
      s.includes("LEAD_DESIGNER") ||
      s.includes("ADMIN") ||
      s.includes("OWNER")
    );
  };
  const roleMatches = hasRoleMatch(roleUpper) || hasRoleMatch(assignedRoleUpper) || hasRoleMatch(designationUpper);

  // Condition 2: department is "Design", "Engineering", or "Operations"
  const departmentMatches =
    departmentUpper.includes("DESIGN") ||
    departmentUpper.includes("ENGINEERING") ||
    departmentUpper.includes("OPERATIONS");

  // Condition 3: accessibleApps or assignedApps includes "solarithm-design-studio", "design_studio", "solarithm_design_studio", or "all"
  const appsList = [
    ...(Array.isArray(userData.accessibleApps) ? userData.accessibleApps : []),
    ...(Array.isArray(userData.assignedApps) ? userData.assignedApps : [])
  ].map((a) => String(a || "").toLowerCase().trim());

  const appMatches =
    appsList.includes("all") ||
    appsList.includes("solarithm-design-studio") ||
    appsList.includes("design_studio") ||
    appsList.includes("solarithm_design_studio") ||
    appsList.includes("design-studio");

  // Condition 4: corporate domain check
  const isCorporateDomain = cleanEmail.endsWith("@solarithmdesign.com");

  const isEligible = roleMatches || departmentMatches || appMatches || isCorporateDomain;

  if (!isEligible) {
    return {
      isEligible: false,
      resolvedRole: "",
      reason: `Access Denied: You do not have permission to access Design Studio.`
    };
  }

  // Determine normalized role
  let resolvedRole = "designer";
  if (roleUpper.includes("OWNER") || assignedRoleUpper.includes("OWNER") || designationUpper.includes("OWNER")) {
    resolvedRole = "owner";
  } else if (roleUpper.includes("ADMIN") || assignedRoleUpper.includes("ADMIN") || departmentUpper === "ADMIN") {
    resolvedRole = designationUpper.includes("LEAD") ? "lead_designer" : "admin";
  } else if (
    designationUpper.includes("LEAD") ||
    roleUpper.includes("LEAD") ||
    assignedRoleUpper.includes("LEAD")
  ) {
    resolvedRole = "lead_designer";
  } else {
    resolvedRole = "designer";
  }

  return { isEligible: true, resolvedRole };
}

interface AuthContextType {
  user: User | { uid?: string; email: string; displayName?: string } | null;
  email: string;
  role: string;
  uid: string;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, role: string, uid?: string, officialName?: string) => Promise<void> | void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  email: "",
  role: "",
  uid: "",
  isAuthenticated: false,
  loading: false,
  login: () => {},
  logout: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Initialize auth states cleanly with default values to prevent hydration mismatch
  const [loading, setLoading] = useState<boolean>(true);
  const [email, setEmail] = useState<string>("");
  const [role, setRole] = useState<string>("");
  const [uid, setUid] = useState<string>("");
  const [user, setUser] = useState<any>(null);

  const [unauthorizedError, setUnauthorizedError] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState<boolean>(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState<boolean>(false);

  const isLoginPage = pathname === "/login";

  // Post-hydration session load (runs strictly on client after mounting)
  useEffect(() => {
    const storedEmail = getStoredEnterpriseEmail();
    const storedRole = getStoredEnterpriseRole() || "designer";
    const storedUid = getStoredEnterpriseUid();
    const storedName = getStoredEnterpriseName();

    if (storedEmail) {
      setEmail(storedEmail);
      setRole(storedRole);
      setUid(storedUid);
      setUser({
        uid: storedUid,
        email: storedEmail,
        displayName: storedName || storedEmail.split("@")[0]
      });
      setLoading(false);
    } else {
      setLoading(false);
      if (pathname !== "/login") {
        router.replace("/login");
      }
    }
  }, [pathname, router]);

  // Optional background auth listener for non-anonymous accounts
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser?.email) {
        setUser(firebaseUser);
      }
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn("Signout notice:", err);
    } finally {
      clearStoredEnterpriseAuth();
      setUser(null);
      setRole("");
      setEmail("");
      setUid("");
      setUnauthorizedError(null);
      setRequestSent(false);
      setLoading(false);
      router.replace("/login");
    }
  };

  const handleLogin = (
    authenticatedEmail: string,
    authenticatedRole: string,
    authenticatedUid?: string,
    authenticatedName?: string
  ) => {
    const cleanEmail = (authenticatedEmail || "").toLowerCase().trim();
    const cleanRole = (authenticatedRole || "designer").toLowerCase().trim();
    const cleanUid = authenticatedUid || "";
    const cleanName = (authenticatedName || "").trim();

    setStoredEnterpriseAuth(cleanEmail, cleanRole, cleanUid, cleanName);
    setEmail(cleanEmail);
    setRole(cleanRole);
    setUid(cleanUid);
    setUser({
      uid: cleanUid,
      email: cleanEmail,
      displayName: cleanName || cleanEmail.split("@")[0]
    });
    setUnauthorizedError(null);
    setLoading(false);
  };

  const handleRequestAccess = async () => {
    if (!email) return;
    setIsSubmittingRequest(true);
    try {
      await addDoc(collection(db, COLLECTIONS.APPROVALS), {
        type: "ACCESS_REQUEST",
        requestedEmail: email.toLowerCase().trim(),
        email: email.toLowerCase().trim(),
        appName: "Solarithm Design Studio",
        appId: DESIGN_STUDIO_APP_ID,
        reason: "Access authorization requested for Design Studio",
        status: "pending",
        timestamp: new Date().toISOString()
      });

      try {
        await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), {
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

  if (isLoginPage) {
    return (
      <AuthContext.Provider
        value={{
          user,
          email,
          role,
          uid,
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

  // Loading state (only shown if session is being checked and not yet determined)
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#121212] p-4 text-gray-900 dark:text-gray-100 transition-colors">
        <div className="flex flex-col items-center gap-4 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-[#D4AF37]" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Loading Solarithm Studio...</p>
            <p className="text-xs text-gray-400 mt-0.5">Initializing session workspace</p>
          </div>
        </div>
      </div>
    );
  }

  // Unauthorized Screen
  if (unauthorizedError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#121212] p-4 text-gray-900 dark:text-gray-100 transition-colors">
        <div className="bg-white dark:bg-[#1E1E1E] p-6 sm:p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-[#333333] max-w-md w-full text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-center justify-center text-rose-500">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Access Denied</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
            {unauthorizedError}
          </p>

          <div className="flex flex-col gap-2.5">
            {requestSent ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-emerald-700 dark:text-emerald-400 text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Access request submitted to Admin Console.
              </div>
            ) : (
              <button
                onClick={handleRequestAccess}
                disabled={isSubmittingRequest}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#D4AF37] hover:bg-[#B5952F] text-black text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isSubmittingRequest ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Request Designer Authorization
              </button>
            )}

            <button
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 rounded-xl border border-gray-200 dark:border-[#333333] hover:bg-gray-50 dark:hover:bg-[#252525] text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign in with another corporate email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        email,
        role,
        uid,
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
