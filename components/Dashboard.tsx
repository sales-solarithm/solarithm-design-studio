"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc,
  updateDoc, 
  serverTimestamp, 
  addDoc, 
  getDocs, 
  Timestamp 
} from "firebase/firestore";
import { 
  LogOut, 
  LayoutDashboard, 
  Clock, 
  FileEdit, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Check, 
  Folders, 
  Search, 
  PenTool, 
  Menu, 
  Download, 
  FileText, 
  Eye,
  PlusCircle,
  Lock,
  ShieldAlert,
  ArrowUpRight,
  Trash2,
  Plus,
  Sparkles,
  AlertTriangle,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Calendar
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import ThemeToggle from "./ThemeToggle";
import { sanitizeFirestorePayload } from "@/lib/firestoreSanitizer";
import { 
  COLLECTIONS, 
  CANONICAL_PROJECT_STATUS,
  CANONICAL_STATUS_LIST,
  CANONICAL_STATUS_LABELS,
  normalizeProjectStatus,
  PROJECT_FIELDS, 
  CLIENT_STATUS,
  resolveProjectDate,
  formatCapacity,
  formatNumericMetric,
  validateDeliverableFile,
  isDesignerRestrictedField,
  deriveClientCodePrefix,
  generateProjectCode,
  safeStringIdentifier
} from "@/src/config/schema";

type Project = {
  id: string;
  projectNumber?: string;
  srNumber: string;
  srNo?: number | string;
  projectName: string;
  clientName: string;
  clientId?: string;
  scopeOfWork: string;
  subService?: string;
  projectSector?: string;
  pricingCategory?: string;
  plantCapacity: number | string | null;
  capacityUnit?: string;
  location?: string;
  projectDate: string;
  date?: string;
  salesPerson: string;
  designerEmail: string;
  assignedScopes?: Record<string, any> | Array<any>;
  phases?: Record<string, {
    phaseName?: string;
    designerEmail?: string;
    designerName?: string;
    status?: string;
    completedAt?: any;
    deliverableUrl?: string;
    commissionEligible?: boolean;
  }>;
  assignedPhases?: string[];
  status: string;
  updatedAt: any;
  createdAt?: any;
  projectValue?: number;
  hasPendingChange?: boolean;
};

type ChangeRequest = {
  id: string;
  projectId: string;
  projectNumber: string;
  clientName: string;
  fieldToChange: string;
  currentValue: any;
  requestedValue: any;
  reason: string;
  requestedBy: string;
  status: string;
  createdAt: any;
};

const STATUS_OPTIONS = CANONICAL_STATUS_LIST;

const STATUS_LABELS: Record<string, string> = {
  ...CANONICAL_STATUS_LABELS,
  'ASSIGNED': 'Assigned',
  'IN_PROGRESS': 'In Progress',
  'SUBMITTED': 'Submitted',
  'UNDER_REVIEW': 'Under Review',
  'REVISION_REQUESTED': 'Revision Requested',
  'APPROVED': 'Approved',
  'COMPLETED': 'Completed',
  'not_started': 'Assigned',
  'in_progress': 'In Progress',
  'pending_design_approval': 'Submitted',
  'design_approved': 'Approved',
  'required_data_pending': 'Under Review',
  'in_revision': 'Revision Requested',
  'in_verification': 'Under Review',
  'delayed': 'In Progress',
  'completed': 'Completed'
};

export const safeFormatDistanceToNow = (rawDate: any): string => {
  if (!rawDate) return "Just now";
  try {
    let dateObj: Date | null = null;
    
    if (typeof rawDate?.toDate === 'function') {
      dateObj = rawDate.toDate();
    } else if (typeof rawDate?.toMillis === 'function') {
      dateObj = new Date(rawDate.toMillis());
    } else if (typeof rawDate?.seconds === 'number') {
      dateObj = new Date(rawDate.seconds * 1000);
    } else if (rawDate instanceof Date) {
      dateObj = rawDate;
    } else if (typeof rawDate === 'string' || typeof rawDate === 'number') {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) {
        dateObj = parsed;
      }
    }
    
    if (!dateObj || isNaN(dateObj.getTime())) {
      return "Recently";
    }
    
    return formatDistanceToNow(dateObj, { addSuffix: true });
  } catch {
    return "Recently";
  }
};

/**
 * Standardized Date Resolution (PRJ-02):
 * Priority: projectDate -> date -> createdAt -> updatedAt
 */
export const getProjectDateTimestamp = (project: any): number => {
  return resolveProjectDate(project).timestamp;
};

export const getProjectDateObj = (project: any): Date | null => {
  const d = resolveProjectDate(project).dateObj;
  if (!d || isNaN(d.getTime())) return null;
  return d;
};

// Master engineering taxonomy mapping for known canonical forms and raw database keys
export const MASTER_SCOPE_TAXONOMY: Record<string, string> = {
  pipecalculation: "PIPE CALCULATION",
  pipe_calculation: "PIPE CALCULATION",
  detaildesign: "DETAIL DESIGN",
  detail_design: "DETAIL DESIGN",
  galayout: "GA LAYOUT",
  ga_layout: "GA LAYOUT",
  ifpprocess: "IFP PROCESS",
  ifp_process: "IFP PROCESS",
  ceilayouts: "CEI LAYOUTS",
  cei_layouts: "CEI LAYOUTS",
  ceig: "CEIG",
  ceigapprovals: "CEIG Approvals",
  ceig_approvals: "CEIG Approvals",
  ifp: "IFP",
  ifppackage: "IFP Package",
  pvsyst: "PVsyst",
  predesign: "Pre-Design",
  pre_design: "Pre-Design",
  postdesign: "Post-Design",
  post_design: "Post-Design",
  detailedengineering: "Detailed Engineering",
  detailed_engineering: "Detailed Engineering",
  singlelinediagram: "Single Line Diagram (SLD)",
  sld: "Single Line Diagram (SLD)",
  billofmaterials: "Bill of Materials (BOM)",
  bom: "Bill of Materials (BOM)",
  permitpackage: "Permit Package",
  permit_package: "Permit Package",
  pestamping: "PE Stamping",
  pe_stamping: "PE Stamping",
  asbuilt: "As-Built Drawing",
  as_built: "As-Built Drawing",
  asbuiltdrawing: "As-Built Drawing",
  interconnection: "Interconnection Study",
  interconnectionstudy: "Interconnection Study",
  standarddesign: "Standard Design",
  standard_design: "Standard Design"
};

// Known technical acronyms and mixed-case terms that should maintain strict casing
export const KNOWN_PRESERVED_WORDS: Record<string, string> = {
  pvsyst: "PVsyst",
  ceig: "CEIG",
  cei: "CEI",
  ifp: "IFP",
  ga: "GA",
  sld: "SLD",
  bom: "BOM",
  pe: "PE",
  kw: "kW",
  mw: "MW",
  dc: "DC",
  ac: "AC"
};

export const toTitleCase = (str: string) => {
  if (!str) return str;
  // If already uppercase acronym or short term like CEIG/SLD/IFP, preserve it
  if (str === str.toUpperCase() && str.length <= 4 && !str.includes(' ')) return str;
  return str.split(/([\s-]+)/).map(part => {
    if (part === ' ' || part === '-' || !part) return part;
    const lower = part.toLowerCase();
    if (KNOWN_PRESERVED_WORDS[lower]) return KNOWN_PRESERVED_WORDS[lower];
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join('');
};

export const normalizeEmail = (email: string | null | undefined): string => {
  return (email || "").toLowerCase().trim();
};

export const normalizeStr = (str: string | null | undefined): string => {
  return (str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, "");
};

/**
 * Resolves a single scope string to its canonical Admin Console / engineering label.
 */
export const resolveSingleScope = (
  scopeStr: string,
  scopesCatalog?: { name: string }[],
  rulesCatalog?: any[]
): string => {
  if (!scopeStr) return "";
  const trimmed = scopeStr.trim();
  if (!trimmed) return "";

  // 1. Check exact match in Firestore scopes collection (canonical labels from Admin Console)
  if (scopesCatalog && Array.isArray(scopesCatalog)) {
    const exact = scopesCatalog.find(s => s?.name && s.name.trim() === trimmed);
    if (exact) return exact.name.trim();
  }

  // 2. Fallback Taxonomy Resolution: Match against master scope list fetched from Firestore by normalizing
  const normalizedKey = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (scopesCatalog && Array.isArray(scopesCatalog)) {
    const matched = scopesCatalog.find(
      s => s?.name && s.name.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey
    );
    if (matched) return matched.name.trim();
  }

  // 3. Check against pricing rules catalog
  if (rulesCatalog && Array.isArray(rulesCatalog)) {
    const ruleMatch = rulesCatalog.find(
      r => r?.scope && r.scope.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedKey
    );
    if (ruleMatch) return ruleMatch.scope.trim();
  }

  // 4. Check known master taxonomy dictionary
  if (MASTER_SCOPE_TAXONOMY[normalizedKey]) {
    return MASTER_SCOPE_TAXONOMY[normalizedKey];
  }

  // 5. If it's already an uppercase phrase with spaces (e.g., "PIPE CALCULATION", "DETAIL DESIGN"), keep as-is
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 2 && !trimmed.includes('_')) {
    return trimmed;
  }

  // 6. If snake_case, replace underscores with spaces
  let formatted = trimmed.replace(/_/g, ' ');

  // 7. If camelCase without spaces (e.g., "pipeCalculation"), insert space before uppercase letters
  formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');

  // 8. Strict Word Boundary Title Casing with Delimiter Preservation (spaces and hyphens)
  const words = formatted.split(/([\s-]+)/);
  const titleCased = words.map(w => {
    if (w === ' ' || w === '-' || !w.trim()) return w;
    const wLower = w.toLowerCase();
    if (KNOWN_PRESERVED_WORDS[wLower]) {
      return KNOWN_PRESERVED_WORDS[wLower];
    }
    if (w === w.toUpperCase() && w.length >= 2 && !wLower.includes('the') && !wLower.includes('and')) {
      return w;
    }
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join('');

  return titleCased;
};

/**
 * High-fidelity scope formatter preserving compound scopes with '+' or ',',
 * ensuring clean spacing around delimiters and canonical labels from the Admin Console.
 */
export const formatScopeDisplay = (
  scopeStr: string | null | undefined,
  scopesCatalog?: { name: string }[],
  rulesCatalog?: any[]
): string => {
  if (!scopeStr || scopeStr === "—") return "—";

  // Handle compound scopes with '+' (Directive 2.3: preserve proper spacing around delimiters)
  if (scopeStr.includes('+')) {
    return scopeStr
      .split('+')
      .map(part => resolveSingleScope(part, scopesCatalog, rulesCatalog))
      .filter(Boolean)
      .join(' + ');
  }

  // Handle compound scopes with ','
  if (scopeStr.includes(',')) {
    return scopeStr
      .split(',')
      .map(part => resolveSingleScope(part, scopesCatalog, rulesCatalog))
      .filter(Boolean)
      .join(', ');
  }

  return resolveSingleScope(scopeStr, scopesCatalog, rulesCatalog);
};

/**
 * Returns a standardized Firestore key for a given scope
 * e.g., "PVsyst" -> "pvsyst", "Pre-Design" -> "preDesign", "Permit Package" -> "permit_package"
 */
export const getScopeKey = (scopeName: string): string => {
  const lower = (scopeName || "").toLowerCase().trim();
  if (lower.includes("pvsyst")) return "pvsyst";
  if (lower.includes("pre-design") || lower.includes("predesign")) return "preDesign";
  if (lower.includes("permit")) return "permit_package";
  if (lower.includes("detailed")) return "detailed_engineering";
  if (lower.includes("ceig")) return "ceig";
  if (lower.includes("ifp")) return "ifp";
  if (lower.includes("sld") || lower.includes("single line")) return "sld";
  if (lower.includes("bom") || lower.includes("bill of materials")) return "bom";
  if (lower.includes("pe stamp") || lower.includes("stamping")) return "pe_stamping";
  if (lower.includes("as-built") || lower.includes("as built")) return "as_built";
  if (lower.includes("interconnection")) return "interconnection";
  return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || "scope";
};

/**
 * Formats scope keys/slugs into high-fidelity human readable engineering titles
 */
export const formatScopeName = (
  scopeKeyOrName: string,
  scopesCatalog?: any,
  rulesCatalog?: any
): string => {
  if (!scopeKeyOrName) return "";
  const safeScopes = Array.isArray(scopesCatalog) ? scopesCatalog : undefined;
  const safeRules = Array.isArray(rulesCatalog) ? rulesCatalog : undefined;
  return formatScopeDisplay(scopeKeyOrName, safeScopes, safeRules);
};

/**
 * Directive 4: Format staff for designer select dropdowns
 * Matches staff whose role or designation is 'DESIGNER', 'LEAD_DESIGNER', or 'OWNER'.
 * Formats company partners as Full Name (Partner / Designer).
 */
export const formatDesignerOption = (
  person: { email: string; name?: string; role?: string },
  isCurrentUser = false
): string => {
  const roleUpper = (person.role || "").toUpperCase();
  const displayName = person.name && person.name.toLowerCase() !== person.email.toLowerCase()
    ? person.name
    : person.email;
  const isPartner = roleUpper === "OWNER" || roleUpper.includes("OWNER") || roleUpper.includes("PARTNER");

  if (isPartner) {
    return `${displayName} (Partner / Designer)${isCurrentUser ? " (You)" : ""}`;
  }
  return `${displayName} (${person.email})${isCurrentUser ? " (You)" : ""}`;
};

/**
 * Extracts all historical scopes and their assigned specialists for a project
 */
export const getAllProjectScopes = (
  project: Project | null | undefined
): { scope: string; designerEmail: string; key: string }[] => {
  if (!project) return [];
  const results: { scope: string; designerEmail: string; key: string }[] = [];
  const rawAssignedScopes = project.assignedScopes;

  if (rawAssignedScopes && typeof rawAssignedScopes === "object") {
    if (Array.isArray(rawAssignedScopes)) {
      rawAssignedScopes.forEach((item, idx) => {
        if (typeof item === "string") {
          results.push({ scope: formatScopeName(item), designerEmail: project.designerEmail || "N/A", key: `arr_${idx}` });
        } else if (item && typeof item === "object") {
          const email = item.designerEmail || item.email || item.assignedTo || item.userEmail || item.assignedDesigner || project.designerEmail || "N/A";
          const title = item.scope || item.scopeName || item.name || item.phase || item.title || "Scope";
          results.push({ scope: formatScopeName(title), designerEmail: email, key: `arr_${idx}` });
        }
      });
    } else {
      for (const [scopeKey, scopeVal] of Object.entries(rawAssignedScopes)) {
        if (typeof scopeVal === "string") {
          results.push({ scope: formatScopeName(scopeKey), designerEmail: scopeVal, key: scopeKey });
        } else if (scopeVal && typeof scopeVal === "object") {
          const valObj = scopeVal as Record<string, any>;
          const email = valObj.designerEmail || valObj.email || valObj.assignedTo || valObj.userEmail || valObj.assignedDesigner || project.designerEmail || "N/A";
          const title = valObj.scope || valObj.scopeName || valObj.name || scopeKey;
          results.push({ scope: formatScopeName(title), designerEmail: email, key: scopeKey });
        }
      }
    }
  }

  // Fallback for legacy projects
  if (results.length === 0) {
    if (project.scopeOfWork) {
      const parts = project.scopeOfWork.split(",").map(s => s.trim()).filter(Boolean);
      parts.forEach((p, idx) => {
        results.push({ scope: formatScopeName(p), designerEmail: project.designerEmail || "N/A", key: `legacy_${idx}` });
      });
    } else {
      results.push({ scope: "Pre-Design", designerEmail: project.designerEmail || "N/A", key: "legacy_default" });
    }
  }

  return results;
};

/**
 * Extracts the specific scopes assigned to a designer from the project's assignedScopes object.
 * Returns an array of scope names/keys strictly assigned to this designer.
 */
export const getDesignerAssignedScopes = (
  project: Project | null | undefined,
  designerEmail: string
): string[] => {
  if (!project || !designerEmail) return [];
  const targetEmail = normalizeEmail(designerEmail);
  const matchedScopes: string[] = [];

  const rawAssignedScopes = project.assignedScopes;

  if (rawAssignedScopes && typeof rawAssignedScopes === "object") {
    if (Array.isArray(rawAssignedScopes)) {
      // If array of scope items
      for (const item of rawAssignedScopes) {
        if (typeof item === "string") {
          matchedScopes.push(formatScopeName(item));
        } else if (item && typeof item === "object") {
          const itemEmail = normalizeEmail(
            item.designerEmail || item.email || item.assignedTo || item.userEmail || item.assignedDesigner
          );
          if (itemEmail === targetEmail) {
            const scopeTitle = item.scope || item.scopeName || item.name || item.phase || item.title;
            if (scopeTitle) matchedScopes.push(formatScopeName(scopeTitle));
          }
        }
      }
    } else {
      // If object/dictionary of { [scopeName]: designerEmail | scopeDetails }
      for (const [scopeKey, scopeVal] of Object.entries(rawAssignedScopes)) {
        if (typeof scopeVal === "string") {
          if (normalizeEmail(scopeVal) === targetEmail) {
            matchedScopes.push(formatScopeName(scopeKey));
          }
        } else if (scopeVal && typeof scopeVal === "object") {
          const valObj = scopeVal as Record<string, any>;
          const valEmail = normalizeEmail(
            valObj.designerEmail || valObj.email || valObj.assignedTo || valObj.userEmail || valObj.assignedDesigner
          );
          if (valEmail === targetEmail) {
            matchedScopes.push(formatScopeName(valObj.scope || valObj.scopeName || valObj.name || scopeKey));
          }
        }
      }
    }
  }

  // If no scopes found in assignedScopes, check phase mapping if available
  if (matchedScopes.length === 0 && project.phases && typeof project.phases === "object") {
    for (const [phaseKey, phaseVal] of Object.entries(project.phases)) {
      if (phaseVal && typeof phaseVal === "object") {
        if (normalizeEmail(phaseVal.designerEmail) === targetEmail) {
          matchedScopes.push(formatScopeName(phaseVal.phaseName || phaseKey));
        }
      }
    }
  }

  // Fallback for legacy projects where assignedScopes was not defined
  if (matchedScopes.length === 0 && !rawAssignedScopes) {
    if (normalizeEmail(project.designerEmail) === targetEmail) {
      if (project.scopeOfWork) {
        const parts = project.scopeOfWork.split(",").map(s => s.trim()).filter(Boolean);
        return parts.length > 0 ? parts.map(p => formatScopeName(p)) : [formatScopeName(project.scopeOfWork)];
      }
    }
  }

  return Array.from(new Set(matchedScopes));
};

/**
 * Checks whether a designer is assigned to at least one scope, module, phase, or designer field within the project.
 * Strictly evaluates against targetEmail (no owner/admin bypass).
 */
export const isDesignerAssignedToProject = (
  project: Project | any,
  designerEmail: string,
  _isOwnerOrAdmin: boolean = false
): boolean => {
  if (!project || !designerEmail) return false;
  const targetEmail = normalizeEmail(designerEmail);
  if (!targetEmail) return false;

  // 1. Direct designerEmail matching
  if (normalizeEmail(project.designerEmail) === targetEmail) return true;

  // 2. assignedScopes matching:
  // - If object: check if any value or nested designerEmail equals targetEmail (e.g. assignedScopes.preDesign === targetEmail)
  // - If array: check each item's designerEmail or string
  const rawAssignedScopes = project.assignedScopes;
  if (rawAssignedScopes && typeof rawAssignedScopes === "object") {
    if (Array.isArray(rawAssignedScopes)) {
      const match = rawAssignedScopes.some(item => {
        if (!item) return false;
        if (typeof item === "string") return normalizeEmail(item) === targetEmail;
        if (typeof item === "object") {
          const itemEmail = normalizeEmail(
            item.designerEmail || item.email || item.assignedTo || item.userEmail || item.assignedDesigner
          );
          return itemEmail === targetEmail;
        }
        return false;
      });
      if (match) return true;
    } else {
      for (const [, scopeVal] of Object.entries(rawAssignedScopes)) {
        if (!scopeVal) continue;
        if (typeof scopeVal === "string") {
          if (normalizeEmail(scopeVal) === targetEmail) return true;
        } else if (typeof scopeVal === "object") {
          const valObj = scopeVal as Record<string, any>;
          const valEmail = normalizeEmail(
            valObj.designerEmail || valObj.email || valObj.assignedTo || valObj.userEmail || valObj.assignedDesigner
          );
          if (valEmail === targetEmail) return true;
        }
      }
    }
  }

  // 3. modules matching:
  // - If array: check if any module has m.assignedDesignerEmail === targetEmail or m.designerEmail === targetEmail
  if (Array.isArray(project.modules)) {
    const moduleMatch = project.modules.some((m: any) => {
      if (!m) return false;
      if (typeof m === "string") return normalizeEmail(m) === targetEmail;
      if (typeof m === "object") {
        return (
          normalizeEmail(m.assignedDesignerEmail) === targetEmail ||
          normalizeEmail(m.designerEmail) === targetEmail ||
          normalizeEmail(m.email) === targetEmail ||
          normalizeEmail(m.assignedTo) === targetEmail ||
          normalizeEmail(m.assignedDesigner) === targetEmail
        );
      }
      return false;
    });
    if (moduleMatch) return true;
  }

  // 4. phases matching:
  // - If object: check if any phase has ph.designerEmail === targetEmail
  if (project.phases && typeof project.phases === "object") {
    if (Array.isArray(project.phases)) {
      const phaseArrMatch = project.phases.some((ph: any) => {
        if (!ph) return false;
        if (typeof ph === "string") return normalizeEmail(ph) === targetEmail;
        return (
          normalizeEmail(ph.designerEmail) === targetEmail ||
          normalizeEmail(ph.email) === targetEmail
        );
      });
      if (phaseArrMatch) return true;
    } else {
      for (const [, ph] of Object.entries(project.phases)) {
        if (!ph) continue;
        if (typeof ph === "string") {
          if (normalizeEmail(ph) === targetEmail) return true;
        } else if (typeof ph === "object") {
          const phObj = ph as Record<string, any>;
          if (
            normalizeEmail(phObj.designerEmail) === targetEmail ||
            normalizeEmail(phObj.email) === targetEmail ||
            normalizeEmail(phObj.assignedTo) === targetEmail
          ) {
            return true;
          }
        }
      }
    }
  }

  // 5. assignedPhases matching:
  // - If array: check if it includes targetEmail
  if (Array.isArray(project.assignedPhases)) {
    const assignedPhasesMatch = project.assignedPhases.some((e: any) => {
      if (!e) return false;
      if (typeof e === "string") return normalizeEmail(e) === targetEmail;
      if (typeof e === "object") {
        return normalizeEmail(e.designerEmail || e.email || e.designer) === targetEmail;
      }
      return false;
    });
    if (assignedPhasesMatch) return true;
  }

  return false;
};

const getStatusColor = (status: string) => {
  const canonical = normalizeProjectStatus(status);
  switch (canonical) {
    case CANONICAL_PROJECT_STATUS.ASSIGNED:
      return "px-2.5 py-1 rounded text-xs font-semibold border text-center text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30";
    case CANONICAL_PROJECT_STATUS.IN_PROGRESS:
      return "px-2.5 py-1 rounded text-xs font-semibold border text-center text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30";
    case CANONICAL_PROJECT_STATUS.SUBMITTED:
      return "px-2.5 py-1 rounded text-xs font-semibold border text-center text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30";
    case CANONICAL_PROJECT_STATUS.UNDER_REVIEW:
      return "px-2.5 py-1 rounded text-xs font-semibold border text-center text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-500/10 border-purple-200 dark:border-purple-500/30";
    case CANONICAL_PROJECT_STATUS.REVISION_REQUESTED:
      return "px-2.5 py-1 rounded text-xs font-semibold border text-center text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/30";
    case CANONICAL_PROJECT_STATUS.APPROVED:
    case CANONICAL_PROJECT_STATUS.COMPLETED:
      return "px-2.5 py-1 rounded text-xs font-semibold border text-center text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30";
    default:
      return "px-2.5 py-1 rounded text-xs font-semibold border text-center text-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-500/10 border-gray-200 dark:border-gray-500/30";
  }
};

export function Dashboard({ userRole, lockedEmail, onUnlock }: { userRole?: string, lockedEmail: string, onUnlock: () => void }) {
  // DIRECTIVE 4: Track initialized auth state to prevent Firestore listener crashes
  const [currentUser, setCurrentUser] = useState<User | null>(() => auth.currentUser);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setCurrentUser(u);
    });
    return () => unsub();
  }, []);

  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [projectSubTab, setProjectSubTab] = useState<'assigned' | 'my'>('assigned');
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [rawScopes, setRawScopes] = useState<any[]>([]);
  const [rawPackages, setRawPackages] = useState<any[]>([]);
  const [pricingRules, setPricingRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState("");
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [activeTab, setActiveTab] = useState("dashboard");
  
  // Project Details Modal State
  const [detailsProject, setDetailsProject] = useState<Project | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [changeField, setChangeField] = useState("plantCapacity");
  const [changeValue, setChangeValue] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Transfer state
  const [designersList, setDesignersList] = useState<{ email: string; name?: string }[]>([]);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferProject, setTransferProject] = useState<Project | null>(null);
  const [targetDesignerEmail, setTargetDesignerEmail] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  // Export Design Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportProject, setExportProject] = useState<Project | null>(null);
  const [exportType, setExportType] = useState<"solar_layout" | "single_line_diagram" | "complete_package">("solar_layout");
  const [isExporting, setIsExporting] = useState(false);

  // Add Project Modal State
  const [isAddProjectModalOpen, setIsAddProjectModalOpen] = useState(false);
  const [approvedClients, setApprovedClients] = useState<{id: string, name: string, salesPersonEmail: string, pricingCategory: string}[]>([]);

  // Pure dynamic Admin Console scopes & packages (from /scopes, /packages, /pricingRules)
  const scopesData = useMemo(() => {
    const rawItems: any[] = [...rawScopes, ...rawPackages, ...pricingRules];
    const dedupedMap = new Map<string, { name: string; subServices: string[]; modules?: any[]; [key: string]: any }>();

    rawItems.forEach((item) => {
      if (!item) return;

      // Filter out deleted/inactive items
      if (item.active === false || item.status === 'inactive' || item.status === 'deleted') {
        return;
      }

      // Extract the exact scope label from item
      const rawLabel = item.name || item.packageName || item.title || item.label || item.scopeName || item.scope;
      if (!rawLabel || typeof rawLabel !== 'string' || !rawLabel.trim()) {
        return;
      }
      const label = rawLabel.trim();

      // Extract sub-services or modules
      let subServices: string[] = [];
      const rawSubs = item.subServices || item.subService || item.modules;
      if (Array.isArray(rawSubs)) {
        rawSubs.forEach((sub: any) => {
          const sName = typeof sub === 'string' ? sub.trim() : (sub?.name || sub?.title || sub?.label || '');
          if (sName && typeof sName === 'string' && sName.trim()) {
            subServices.push(sName.trim());
          }
        });
      } else if (typeof rawSubs === 'string' && rawSubs.trim()) {
        subServices.push(rawSubs.trim());
      }

      // Deduplicate scopes case-insensitively: if two entries have the same letters, keep one entry and preserve its exact Admin Console name
      const lowerKey = label.toLowerCase();
      if (!dedupedMap.has(lowerKey)) {
        dedupedMap.set(lowerKey, {
          name: label, // Exact, verbatim Admin Console name
          subServices: Array.from(new Set(subServices)),
          modules: Array.isArray(item.modules) ? item.modules : [],
          ...item
        });
      } else {
        const existing = dedupedMap.get(lowerKey)!;
        const mergedSub = Array.from(new Set([...existing.subServices, ...subServices]));
        existing.subServices = mergedSub;
        if (Array.isArray(item.modules) && item.modules.length > 0) {
          existing.modules = Array.from(new Set([...(existing.modules || []), ...item.modules]));
        }
      }
    });

    // Sort the resulting list alphabetically
    return Array.from(dedupedMap.values()).sort((a, b) => 
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [rawScopes, rawPackages, pricingRules]);
  const [newProject, setNewProject] = useState({
    clientId: "",
    clientName: "",
    projectName: "",
    plantCapacity: "",
    capacityUnit: "kW",
    scopeOfWork: "",
    subService: "",
    location: "",
    projectDate: new Date().toISOString().split('T')[0]
  });
  const [isAddingProject, setIsAddingProject] = useState(false);

  // Deduplication & Split-Scope Upgrade States
  const [existingProjectsForDedupe, setExistingProjectsForDedupe] = useState<Project[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState({ name: "", location: "", plantCapacity: "" });
  const [allAssigneesList, setAllAssigneesList] = useState<{ email: string; name?: string; role?: string }[]>([]);
  
  // Scope Upgrade Modal States
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [upgradeProject, setUpgradeProject] = useState<Project | null>(null);
  const [newScopesList, setNewScopesList] = useState<{ scope: string; designerEmail: string; subService?: string }[]>([]);
  const [selectedScopeToAdd, setSelectedScopeToAdd] = useState("");
  const [customScopeName, setCustomScopeName] = useState("");
  const [selectedDesignerForScope, setSelectedDesignerForScope] = useState("");
  const [selectedSubServiceForScope, setSelectedSubServiceForScope] = useState("");
  const [isSavingUpgrade, setIsSavingUpgrade] = useState(false);

  // Column Header Filter States
  const [filterClient, setFilterClient] = useState("");
  const [filterScope, setFilterScope] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterChangeRequest, setFilterChangeRequest] = useState("all");
  const [filterDateYear, setFilterDateYear] = useState("");
  const [filterDateMonth, setFilterDateMonth] = useState("");
  const [openFilterHeader, setOpenFilterHeader] = useState<string | null>(null);
  const [clientSearchInFilter, setClientSearchInFilter] = useState("");
  const filterMenuRef = useRef<HTMLDivElement | null>(null);

  // Pagination states (default 15 per page)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Close filter popovers when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target as Node)) {
        setOpenFilterHeader(null);
      }
    };
    if (openFilterHeader) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openFilterHeader]);

  // Track filter changes to automatically reset pagination to first page
  const [prevFilterKey, setPrevFilterKey] = useState("");
  const currentFilterKey = `${searchQuery}_${filterClient}_${filterScope}_${filterStatus}_${filterChangeRequest}_${filterDateYear}_${filterDateMonth}_${projectSubTab}`;
  if (currentFilterKey !== prevFilterKey) {
    setPrevFilterKey(currentFilterKey);
    setCurrentPage(1);
  }

  const user = auth.currentUser;
  const [userName, setUserName] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("solarithm_user_name") || "";
    }
    return "";
  });

  useEffect(() => {
    if (!lockedEmail) return;
    const fetchOfficialName = async () => {
      try {
        const normEmail = lockedEmail.toLowerCase().trim();

        // 1. Check /users collection from Admin Console
        const usersSnap = await getDocs(
          query(collection(db, COLLECTIONS.USERS), where("email", "==", normEmail))
        );
        if (!usersSnap.empty) {
          const u = usersSnap.docs[0].data();
          const officialName = u.name || u.displayName || u.fullName || u.employeeName;
          if (officialName) {
            setUserName(officialName.trim());
            localStorage.setItem("solarithm_user_name", officialName.trim());
            return;
          }
        }

        // 2. Check /employees directory from Admin Console
        const empSnap = await getDocs(
          query(collection(db, COLLECTIONS.EMPLOYEES), where("email", "==", normEmail))
        );
        if (!empSnap.empty) {
          const emp = empSnap.docs[0].data();
          const officialName = emp.name || emp.displayName || emp.fullName || emp.employeeName;
          if (officialName) {
            setUserName(officialName.trim());
            localStorage.setItem("solarithm_user_name", officialName.trim());
            return;
          }
        }
      } catch (err) {
        console.warn("Notice: Error fetching official name:", err);
      }
    };

    fetchOfficialName();
  }, [lockedEmail]);

  // Derive active/completed projects list using client-side filter to prevent disappearing on status change
  const activeProjectsList = projectsList.filter(p => normalizeProjectStatus(p.status) !== CANONICAL_PROJECT_STATUS.COMPLETED);
  const completedProjectsList = projectsList.filter(p => normalizeProjectStatus(p.status) === CANONICAL_PROJECT_STATUS.COMPLETED);

  // Compute computed active-tab project display
  const projects = projectSubTab === 'assigned' ? activeProjectsList : completedProjectsList;

  // Derive unique clients for column filter
  const uniqueClients = useMemo(() => {
    const set = new Set<string>();
    projects.forEach(p => {
      if (p.clientName) set.add(toTitleCase(p.clientName.trim()));
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [projects]);

  const filteredUniqueClients = useMemo(() => {
    if (!clientSearchInFilter.trim()) return uniqueClients;
    const q = clientSearchInFilter.toLowerCase();
    return uniqueClients.filter(c => c.toLowerCase().includes(q));
  }, [uniqueClients, clientSearchInFilter]);

  // Derive unique scopes for column filter
  const uniqueScopes = useMemo(() => {
    const set = new Set<string>();
    // Add scopes from master Admin Console catalog
    if (Array.isArray(scopesData)) {
      scopesData.forEach(s => {
        if (s?.name) set.add(s.name);
      });
    }
    projects.forEach(p => {
      if (p.scopeOfWork) {
        // Split by comma or plus
        p.scopeOfWork.split(/[,+]/).forEach(s => {
          const t = s.trim();
          if (t && t !== "—") set.add(t);
        });
      }
    });
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [projects, scopesData]);

  // Derive available years from projects
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    const currentYear = new Date().getFullYear().toString();
    set.add(currentYear);
    projects.forEach(p => {
      const d = getProjectDateObj(p);
      if (d) set.add(d.getFullYear().toString());
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [projects]);

  const monthOptions = useMemo(() => [
    { value: "", label: "All Months" },
    { value: "0", label: "January" },
    { value: "1", label: "February" },
    { value: "2", label: "March" },
    { value: "3", label: "April" },
    { value: "4", label: "May" },
    { value: "5", label: "June" },
    { value: "6", label: "July" },
    { value: "7", label: "August" },
    { value: "8", label: "September" },
    { value: "9", label: "October" },
    { value: "10", label: "November" },
    { value: "11", label: "December" }
  ], []);

  const statusFilterOptions = useMemo(() => [
    { value: "", label: "All Statuses" },
    { value: CANONICAL_PROJECT_STATUS.ASSIGNED, label: "Assigned" },
    { value: CANONICAL_PROJECT_STATUS.IN_PROGRESS, label: "In Progress" },
    { value: CANONICAL_PROJECT_STATUS.SUBMITTED, label: "Submitted" },
    { value: CANONICAL_PROJECT_STATUS.UNDER_REVIEW, label: "Under Review" },
    { value: CANONICAL_PROJECT_STATUS.REVISION_REQUESTED, label: "Revision Requested" },
    { value: CANONICAL_PROJECT_STATUS.APPROVED, label: "Approved" },
    { value: CANONICAL_PROJECT_STATUS.COMPLETED, label: "Completed" }
  ], []);

  const changeRequestOptions = useMemo(() => [
    { value: "all", label: "All Change Requests" },
    { value: "yes", label: "Has Change Request (Yes)" },
    { value: "no", label: "No Change Request (No)" },
    { value: "pending", label: "Pending Review" }
  ], []);

  // Filter and strictly sort descending (newest projects on top)
  const filteredProjects = useMemo(() => {
    // 1. Sort strictly descending by project date (priority: projectDate -> date -> createdAt -> updatedAt)
    const sorted = [...projects].sort((a, b) => {
      const diff = getProjectDateTimestamp(b) - getProjectDateTimestamp(a);
      if (diff !== 0) return diff;
      return (b.projectNumber || b.srNumber || "").localeCompare(a.projectNumber || a.srNumber || "");
    });

    return sorted.filter((project) => {
      // Top search filter
      if (searchQuery) {
        const queryStr = searchQuery.toLowerCase();
        const clientName = (project.clientName || "").toLowerCase();
        const projectNumber = (project.projectNumber || "").toLowerCase();
        const projectName = (project.projectName || "").toLowerCase();
        const matchesSearch = clientName.includes(queryStr) || projectNumber.includes(queryStr) || projectName.includes(queryStr);
        if (!matchesSearch) return false;
      }

      // Column Header Filter: Client Name
      if (filterClient) {
        const pClient = normalizeStr(project.clientName);
        if (pClient !== normalizeStr(filterClient)) {
          return false;
        }
      }

      // Column Header Filter: Scope
      if (filterScope) {
        const designerScopes = getDesignerAssignedScopes(project, lockedEmail);
        const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'lead_designer';
        const displayedScope = isOwnerOrAdmin
          ? (project.scopeOfWork || "")
          : (designerScopes.length > 0 ? designerScopes.join(", ") : (project.scopeOfWork || ""));
        
        const normFilter = filterScope.toLowerCase();
        const scopeMatches = 
          displayedScope.toLowerCase().includes(normFilter) ||
          (project.scopeOfWork && project.scopeOfWork.toLowerCase().includes(normFilter)) ||
          designerScopes.some(s => s.toLowerCase().includes(normFilter));
        
        if (!scopeMatches) return false;
      }

      // Column Header Filter: Status
      if (filterStatus) {
        const pCanonical = normalizeProjectStatus(project.status);
        if (pCanonical !== filterStatus) {
          return false;
        }
      }

      // Column Header Filter: Change Request
      if (filterChangeRequest && filterChangeRequest !== "all") {
        if (filterChangeRequest === "yes" && !project.hasPendingChange) {
          return false;
        }
        if (filterChangeRequest === "no" && project.hasPendingChange) {
          return false;
        }
        if (filterChangeRequest === "pending" && !project.hasPendingChange) {
          return false;
        }
      }

      // Column Header Filter: Date (Month & Year)
      if (filterDateYear || filterDateMonth !== "") {
        const d = getProjectDateObj(project);
        if (!d) return false;
        if (filterDateYear && d.getFullYear().toString() !== filterDateYear) {
          return false;
        }
        if (filterDateMonth !== "" && d.getMonth().toString() !== filterDateMonth) {
          return false;
        }
      }

      return true;
    });
  }, [
    projects,
    searchQuery,
    filterClient,
    filterScope,
    filterStatus,
    filterChangeRequest,
    filterDateYear,
    filterDateMonth,
    lockedEmail,
    userRole
  ]);

  const isAnyFilterActive = Boolean(
    searchQuery ||
    filterClient ||
    filterScope ||
    filterStatus ||
    (filterChangeRequest && filterChangeRequest !== "all") ||
    filterDateYear ||
    filterDateMonth !== ""
  );

  const resetAllFilters = () => {
    setSearchQuery("");
    setFilterClient("");
    setFilterScope("");
    setFilterStatus("");
    setFilterChangeRequest("all");
    setFilterDateYear("");
    setFilterDateMonth("");
    setOpenFilterHeader(null);
    setClientSearchInFilter("");
    setCurrentPage(1);
  };

  // Pagination calculation
  const totalItems = filteredProjects.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalItems);
  const paginatedProjects = filteredProjects.slice(startIndex, endIndex);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    if (safePage <= 3) {
      pages.push(1, 2, 3, 4, '...', totalPages);
    } else if (safePage >= totalPages - 2) {
      pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } else {
      pages.push(1, '...', safePage - 1, safePage, safePage + 1, '...', totalPages);
    }
    return pages;
  }, [totalPages, safePage]);

  // Pure dynamic list of Admin Console scopes (alphabetical, verbatim names from Admin Console)
  const dynamicScopes = useMemo<string[]>(() => {
    return scopesData.map(s => s.name);
  }, [scopesData]);

  const availableSubServices = useMemo(() => {
    if (!newProject.scopeOfWork) return [];
    const set = new Set<string>();
    const selectedScopeLower = newProject.scopeOfWork.toLowerCase().trim();

    // From scopesData (maps scopeDoc.subServices || scopeDoc.modules)
    if (Array.isArray(scopesData)) {
      const scopeDoc = scopesData.find(
        (s: any) => s?.name && s.name.toLowerCase().trim() === selectedScopeLower
      );
      if (scopeDoc) {
        const subs = scopeDoc.subServices || scopeDoc.modules;
        if (Array.isArray(subs)) {
          subs.forEach((sub: any) => {
            const subName = typeof sub === 'string' ? sub.trim() : (sub?.name || sub?.title || sub?.label || "");
            if (subName && typeof subName === 'string' && subName.trim()) {
              set.add(subName.trim());
            }
          });
        }
      }
    }

    // From pricingRules
    if (Array.isArray(pricingRules)) {
      pricingRules.forEach((rule: any) => {
        const ruleScope = (rule?.scope || rule?.name || "").toLowerCase().trim();
        if (ruleScope === selectedScopeLower) {
          if (rule?.subService && typeof rule.subService === 'string' && rule.subService.trim()) {
            set.add(rule.subService.trim());
          }
          if (Array.isArray(rule?.subServices)) {
            rule.subServices.forEach((sub: any) => {
              if (typeof sub === 'string' && sub.trim()) set.add(sub.trim());
            });
          }
        }
      });
    }

    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [newProject.scopeOfWork, scopesData, pricingRules]);

  const availableUpgradeSubServices = useMemo(() => {
    if (!selectedScopeToAdd || selectedScopeToAdd === "CUSTOM") return [];
    const set = new Set<string>();
    const selectedScopeLower = selectedScopeToAdd.toLowerCase().trim();

    if (Array.isArray(scopesData)) {
      const scopeDoc = scopesData.find(
        (s: any) => s?.name && s.name.toLowerCase().trim() === selectedScopeLower
      );
      if (scopeDoc) {
        const subs = scopeDoc.subServices || scopeDoc.modules;
        if (Array.isArray(subs)) {
          subs.forEach((sub: any) => {
            const subName = typeof sub === 'string' ? sub.trim() : (sub?.name || sub?.title || sub?.label || "");
            if (subName && typeof subName === 'string' && subName.trim()) {
              set.add(subName.trim());
            }
          });
        }
      }
    }
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [selectedScopeToAdd, scopesData]);

  // Synchronize catalog of all projects from Firestore for real-time deduplication checking
  useEffect(() => {
    if (!isAddProjectModalOpen) return;
    const unsub = onSnapshot(collection(db, COLLECTIONS.PROJECTS), (snap) => {
      const projs = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as Project[];
      setExistingProjectsForDedupe(projs);
    }, (err) => {
      console.error("Error fetching projects for deduplication:", err);
    });
    return () => unsub();
  }, [isAddProjectModalOpen]);

  // Debounced input search for project name, site address & plant capacity
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch({
        name: newProject.projectName,
        location: newProject.location,
        plantCapacity: newProject.plantCapacity
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [newProject.projectName, newProject.location, newProject.plantCapacity]);

  // Deduplication engine: triggers ONLY when all 4 fields match simultaneously:
  // 1. Client match (clientId or clientName)
  // 2. Project Name exact match (trimmed, case-insensitive)
  // 3. Plant Capacity exact match (exact numerical equality)
  // 4. Location / Site Address match (trimmed, case-insensitive)
  const duplicateProject = useMemo(() => {
    const enteredName = (debouncedSearch.name || "").trim().toLowerCase();
    const enteredLoc = (debouncedSearch.location || "").trim().toLowerCase();
    const enteredCapStr = (debouncedSearch.plantCapacity || "").trim();
    const selClientId = newProject.clientId;

    // Must have non-empty values for client, project name, plant capacity, and location
    if (!selClientId || !enteredName || !enteredLoc || !enteredCapStr) {
      return null;
    }

    const enteredCapacity = Number(enteredCapStr);
    if (isNaN(enteredCapacity) || enteredCapacity < 0) {
      return null;
    }

    const selectedClient = approvedClients.find(c => c.id === selClientId);
    const selectedClientNameNorm = normalizeStr(selectedClient?.name);

    for (const p of existingProjectsForDedupe) {
      // 1. Client Match: Check clientId or normalized clientName match
      const pClientId = p.clientId || "";
      const pClientNameNorm = normalizeStr(p.clientName);
      const isClientMatch = (pClientId && pClientId === selClientId) || 
                            (selectedClientNameNorm && pClientNameNorm === selectedClientNameNorm);
      if (!isClientMatch) continue;

      // 2. Project Name Match: Exact match (trimmed, case-insensitive)
      const pName = (p.projectName || "").trim().toLowerCase();
      if (pName !== enteredName) continue;

      // 3. Plant Capacity Match: Exact numerical equality
      const pCapacity = Number(p.plantCapacity);
      if (isNaN(pCapacity) || pCapacity !== enteredCapacity) continue;

      // 4. Location / Site Address Match: Normalized or trimmed case-insensitive match
      const pLoc = (p.location || "").trim().toLowerCase();
      const isLocMatch = pLoc === enteredLoc || normalizeStr(p.location) === normalizeStr(debouncedSearch.location);
      if (!isLocMatch) continue;

      // All 4 criteria matched simultaneously
      return p;
    }

    return null;
  }, [debouncedSearch, newProject.clientId, approvedClients, existingProjectsForDedupe]);

  // Live preview of auto-generated project code and serial number (Directive 3)
  const previewProjectCode = useMemo(() => {
    if (!newProject.clientId) return null;
    const client = approvedClients.find(c => c.id === newProject.clientId);
    if (!client) return null;
    const prefix = deriveClientCodePrefix(client.name);
    const d = newProject.projectDate ? new Date(`${newProject.projectDate}T12:00:00`) : new Date();
    const targetYear = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
    const targetMonth = isNaN(d.getTime()) ? String(new Date().getMonth() + 1).padStart(2, '0') : String(d.getMonth() + 1).padStart(2, '0');
    const ymStr = `${targetYear}-${targetMonth}`;

    let maxSeq = 0;
    const allKnown = [...projectsList, ...existingProjectsForDedupe];
    allKnown.forEach(p => {
      const pNum = p.projectNumber || p.srNumber || "";
      if (pNum.includes(ymStr)) {
        const match = pNum.match(/-(\d+)$/);
        if (match) {
          const seq = parseInt(match[1], 10);
          if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
        }
      }
      if (typeof p.srNo === 'number' && (p.date || p.projectDate || "").startsWith(ymStr)) {
        if (p.srNo > maxSeq) maxSeq = p.srNo;
      }
    });

    const nextSeq = maxSeq + 1;
    return generateProjectCode(prefix, d, nextSeq);
  }, [newProject.clientId, newProject.projectDate, approvedClients, projectsList, existingProjectsForDedupe]);

  const handleOpenUpgradeModal = (project: Project) => {
    setUpgradeProject(project);
    setNewScopesList([]);
    setSelectedScopeToAdd("");
    setCustomScopeName("");
    setSelectedDesignerForScope(auth.currentUser?.email || lockedEmail);
    setSelectedSubServiceForScope("");
    setIsAddProjectModalOpen(false);
    setIsDetailsModalOpen(false);
    setIsUpgradeModalOpen(true);
  };

  const handleAddScopeToUpgrade = () => {
    const scopeName = selectedScopeToAdd === "CUSTOM" ? customScopeName.trim() : selectedScopeToAdd.trim();
    if (!scopeName) {
      showToast("Please select or enter a scope name.");
      return;
    }
    const designerEmail = selectedDesignerForScope || auth.currentUser?.email || lockedEmail;
    if (!designerEmail) {
      showToast("Please assign a designer to this scope.");
      return;
    }

    // Check if this scope is already in historical scopes
    const historical = getAllProjectScopes(upgradeProject);
    const proposedScope = scopeName;
    if (historical.some(h => (h.scope || "").toLowerCase().trim() === proposedScope.toLowerCase().trim())) {
      showToast(`The scope "${proposedScope}" is already an assigned historical scope.`);
      return;
    }

    // Check if already in staged list
    if (newScopesList.some(s => (s.scope || "").toLowerCase().trim() === proposedScope.toLowerCase().trim())) {
      showToast(`The scope "${proposedScope}" is already added in this upgrade session.`);
      return;
    }

    setNewScopesList(prev => [
      ...prev,
      {
        scope: proposedScope,
        designerEmail: normalizeEmail(designerEmail),
        subService: selectedSubServiceForScope ? selectedSubServiceForScope.trim() : undefined
      }
    ]);

    setSelectedScopeToAdd("");
    setCustomScopeName("");
    setSelectedSubServiceForScope("");
    showToast(`Added ${proposedScope} to upgrade package.`);
  };

  const handleRemoveScopeFromUpgrade = (index: number) => {
    setNewScopesList(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upgradeProject) return;

    if (newScopesList.length === 0) {
      showToast("Please add at least one new scope to upgrade.");
      return;
    }

    setIsSavingUpgrade(true);

    try {
      const updatePayload: Record<string, any> = {
        [PROJECT_FIELDS.UPDATED_AT]: serverTimestamp(),
      };

      // Ensure historical scopes are preserved in assignedScopes map for legacy projects without assignedScopes
      if (!upgradeProject.assignedScopes) {
        const historicalKey = getScopeKey(upgradeProject.scopeOfWork || "preDesign");
        const historicalDesigner = upgradeProject.designerEmail || lockedEmail;
        updatePayload[`assignedScopes.${historicalKey}`] = historicalDesigner;
      }

      // CRITICAL DATABASE RULE:
      // Append new scopes to the existing assignedScopes object in Firestore using dot-notation merge.
      // E.g., updatePayload['assignedScopes.pvsyst'] = 'newDesigner@email.com'
      // It must never overwrite or delete the historical scopes and their assigned designers.
      const newScopeTitles: string[] = [];
      for (const item of newScopesList) {
        const scopeKey = getScopeKey(item.scope);
        updatePayload[`assignedScopes.${scopeKey}`] = item.designerEmail;
        newScopeTitles.push(item.scope.trim());
      }

      // Append new scope names to the high-level scopeOfWork string
      const currentScopesStr = upgradeProject.scopeOfWork || "";
      const currentScopesArr = currentScopesStr
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
      const mergedScopes = Array.from(new Set([...currentScopesArr, ...newScopeTitles]));
      updatePayload[PROJECT_FIELDS.SCOPE_OF_WORK] = mergedScopes.join(", ");

      // Execute update in Firestore with existence verification guard
      const projRef = doc(db, COLLECTIONS.PROJECTS, upgradeProject.id);
      const projSnap = await getDoc(projRef);
      if (!projSnap.exists()) {
        showToast("Error: Project document does not exist in database.");
        return;
      }
      await updateDoc(projRef, sanitizeFirestorePayload(updatePayload));

      // Add audit log entry
      try {
        await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), sanitizeFirestorePayload({
          action: "PROJECT_SCOPE_UPGRADE",
          actor: auth.currentUser?.email || lockedEmail,
          timestamp: serverTimestamp(),
          details: {
            projectId: upgradeProject.id,
            projectNumber: upgradeProject.projectNumber || upgradeProject.srNumber || "N/A",
            clientName: upgradeProject.clientName || "N/A",
            addedScopes: newScopesList.map(s => ({
              scope: s.scope,
              scopeKey: getScopeKey(s.scope),
              designerEmail: s.designerEmail,
              subService: s.subService || null
            })),
            previousScopeOfWork: currentScopesStr,
            newScopeOfWork: mergedScopes.join(", ")
          }
        }));
      } catch (logErr) {
        console.warn("Could not write audit log for upgrade:", logErr);
      }

      showToast(`Successfully upgraded project with ${newScopesList.length} new scope(s)!`);
      setIsUpgradeModalOpen(false);
      setUpgradeProject(null);
      setNewScopesList([]);
    } catch (error) {
      console.error("Error upgrading project scopes:", error);
      showToast("Error upgrading project scope. Please try again.");
    } finally {
      setIsSavingUpgrade(false);
    }
  };

  useEffect(() => {
    // Attach Firestore snapshot listeners when lockedEmail is verified
    if (!lockedEmail) return;

    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'lead_designer';

    // Phase 1 Split-Scope Data Filtering:
    // Update the Firestore query and frontend filter so the designer only sees projects
    // where their email is assigned to at least one scope within the assignedScopes object.
    const projectsQ = query(collection(db, COLLECTIONS.PROJECTS));

    const unsubscribeProjects = onSnapshot(projectsQ, async (snapshot) => {
      let projData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Project[];

      // Filter so the logged-in designer only sees projects where their email is assigned
      // (Even if the user has owner or admin role, Designer Studio view strictly displays assigned projects)
      projData = projData.filter(project => isDesignerAssignedToProject(project, lockedEmail, false));
      
      projData.sort((a, b) => {
        const diff = getProjectDateTimestamp(b) - getProjectDateTimestamp(a);
        if (diff !== 0) return diff;
        return (b.projectNumber || b.srNumber || "").localeCompare(a.projectNumber || a.srNumber || "");
      });
      
      try {
        const pendingSnap = await getDocs(
          query(
            collection(db, COLLECTIONS.CHANGE_REQUESTS),
            where("status", "==", "pending")
          )
        );
        const pendingRequestsDocs = pendingSnap.docs;
        const projectsWithPending = projData.map(project => ({
          ...project,
          hasPendingChange: pendingRequestsDocs.some(req => req.data().projectId === project.id)
        }));
        setProjectsList(projectsWithPending);
      } catch (error) {
        console.error("Error fetching pending requests:", error);
        setProjectsList(projData.map(p => ({ ...p, hasPendingChange: false })));
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching projects:", error);
      setProjectsList([]);
      setLoading(false);
    });

    const crQuery = isOwnerOrAdmin
      ? query(collection(db, COLLECTIONS.CHANGE_REQUESTS))
      : query(
          collection(db, COLLECTIONS.CHANGE_REQUESTS),
          where("requestedBy", "==", lockedEmail)
        );

    const unsubscribeCRs = onSnapshot(crQuery, (snapshot) => {
      const crData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChangeRequest[];
      
      const parseCRTime = (raw: any): number => {
        if (!raw) return 0;
        try {
          if (typeof raw?.toMillis === 'function') {
            const ms = raw.toMillis();
            return isNaN(ms) ? 0 : ms;
          }
          if (typeof raw?.toDate === 'function') {
            const ms = raw.toDate().getTime();
            return isNaN(ms) ? 0 : ms;
          }
          if (typeof raw?.seconds === 'number') {
            return isNaN(raw.seconds) ? 0 : raw.seconds * 1000;
          }
          if (raw instanceof Date) {
            const ms = raw.getTime();
            return isNaN(ms) ? 0 : ms;
          }
          if (typeof raw === 'number') {
            return isNaN(raw) ? 0 : raw;
          }
          if (typeof raw === 'string') {
            const ms = new Date(raw).getTime();
            return isNaN(ms) ? 0 : ms;
          }
        } catch {}
        return 0;
      };

      crData.sort((a, b) => {
        const timeA = parseCRTime(a.createdAt);
        const timeB = parseCRTime(b.createdAt);
        return timeB - timeA;
      });
      
      setChangeRequests(crData);
    }, (error) => {
      console.error("Error fetching change requests:", error);
      setChangeRequests([]);
    });

    // Real-time listener for /scopes collection
    const unsubscribeScopes = onSnapshot(collection(db, COLLECTIONS.SCOPES), (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRawScopes(items);
    }, (error) => {
      console.error("Error fetching scopes:", error);
      setRawScopes([]);
    });

    // Real-time listener for /packages collection
    const unsubscribePackages = onSnapshot(collection(db, "packages"), (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRawPackages(items);
    }, (error) => {
      console.error("Error fetching packages:", error);
      setRawPackages([]);
    });

    const fetchDesigners = async () => {
      try {
        const uniqueDesignersMap = new Map<string, { email: string; name?: string; role?: string }>();
        
        // Helper to register designer record ensuring email deduplication and case normalization
        const registerPerson = (person: { email: string; name?: string; role?: string }) => {
          const cleanEmail = normalizeEmail(person.email);
          if (!cleanEmail) return;
          const existing = uniqueDesignersMap.get(cleanEmail);
          if (!existing) {
            uniqueDesignersMap.set(cleanEmail, {
              email: person.email.trim(),
              name: person.name?.trim() || person.email.trim(),
              role: person.role?.trim() || ""
            });
          } else {
            // Keep the record with the most complete name/role
            if ((!existing.name || existing.name.toLowerCase() === existing.email.toLowerCase()) && person.name && person.name.toLowerCase() !== person.email.toLowerCase()) {
              existing.name = person.name.trim();
            }
            if (!existing.role && person.role) {
              existing.role = person.role.trim();
            }
          }
        };

        // 1. Primary: employees collection (central directory in Master Blueprint)
        try {
          const empSnap = await getDocs(collection(db, COLLECTIONS.EMPLOYEES));
          if (!empSnap.empty) {
            empSnap.docs.forEach(d => {
              const data = d.data();
              registerPerson({
                email: data.email || "",
                name: data.name || data.displayName || data.email || "",
                role: data.role || data.assignedRole || data.designation || data.department || ""
              });
            });
          }
        } catch (e) {
          console.warn("Could not query employees for designers", e);
        }

        // 2. Query users collection to ensure all staff, owners, and partners are included
        try {
          const snap = await getDocs(collection(db, COLLECTIONS.USERS));
          snap.docs.forEach(d => {
            const data = d.data();
            registerPerson({
              email: data.email || "",
              name: data.name || data.displayName || data.email || "",
              role: data.role || data.assignedRole || data.designation || ""
            });
          });
        } catch (e) {
          console.warn("Could not query users for designers", e);
        }

        const normalizedLockedEmail = normalizeEmail(lockedEmail);

        // Directive 4: Match staff whose role or designation is 'DESIGNER', 'LEAD_DESIGNER', or 'OWNER'
        const isEligibleStaff = (roleStr: string) => {
          const r = (roleStr || "").toUpperCase().trim();
          return (
            r === "DESIGNER" ||
            r === "LEAD_DESIGNER" ||
            r === "OWNER" ||
            r.includes("DESIGNER") ||
            r.includes("LEAD_DESIGNER") ||
            r.includes("OWNER") ||
            r.includes("PARTNER") ||
            r.includes("ENGINEER") ||
            r.includes("ARCHITECT")
          );
        };

        // Filter peer designers for transfer project dropdown
        const peerDesigners: { email: string; name?: string; role?: string }[] = [];
        uniqueDesignersMap.forEach((u, cleanEmail) => {
          if (cleanEmail === normalizedLockedEmail) return;
          if (isEligibleStaff(u.role || "")) {
            peerDesigners.push(u);
          }
        });
        setDesignersList(peerDesigners);

        // Populate full assignees list for split-scope assignments including current user
        const allAssignees: { email: string; name?: string; role?: string }[] = [];
        // Ensure current user is at the top exactly once
        if (normalizedLockedEmail) {
          const self = uniqueDesignersMap.get(normalizedLockedEmail);
          allAssignees.push({
            email: lockedEmail.trim(),
            name: self?.name || auth.currentUser?.displayName || "You",
            role: self?.role || "designer"
          });
        }

        uniqueDesignersMap.forEach((u, cleanEmail) => {
          if (cleanEmail !== normalizedLockedEmail) {
            allAssignees.push(u);
          }
        });
        setAllAssigneesList(allAssignees);
      } catch (err) {
        console.error("Error fetching designers", err);
        setDesignersList([]);
        setAllAssigneesList([{ email: lockedEmail, name: "You", role: "designer" }]);
      }
    };
    fetchDesigners();

    const fetchClients = async () => {
      try {
        const q = query(
          collection(db, COLLECTIONS.CLIENTS),
          where("status", "==", CLIENT_STATUS.APPROVED)
        );
        const snap = await getDocs(q);
        const clientsMap = new Map<string, any>();
        snap.docs.forEach(d => {
          const data = d.data();
          const id = d.id;
          if (!clientsMap.has(id)) {
            clientsMap.set(id, {
              id: id,
              name: data.companyName || data.contactPerson || "Unknown Client",
              salesPersonEmail: data.salesPersonEmail || "",
              pricingCategory: data.pricingCategory || "T1"
            });
          }
        });
        setApprovedClients(Array.from(clientsMap.values()));
      } catch (err) {
        console.error("Error fetching clients", err);
        setApprovedClients([]);
      }
    };
    fetchClients();

    const unsubscribePricingRules = onSnapshot(collection(db, "pricingRules"), (snapshot) => {
      const rules = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setPricingRules(rules);
    }, (error) => {
      console.error("Error fetching pricing rules:", error);
      setPricingRules([]);
    });

    return () => {
      unsubscribeProjects();
      unsubscribeCRs();
      unsubscribeScopes();
      unsubscribePackages();
      unsubscribePricingRules();
    };
  }, [lockedEmail, userRole]);

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'lead_designer';
    const project = activeProjectsList.concat(completedProjectsList).find(p => p.id === projectId);
    const isAssigned = project && isDesignerAssignedToProject(project, lockedEmail, isOwnerOrAdmin);

    if (!project || !isAssigned) {
      showToast("Unauthorized: You can only edit your assigned projects or module phases.");
      return;
    }

    const canonicalStatus = normalizeProjectStatus(newStatus);

    try {
      // Guard write: verify project document existence before committing update
      const projectRef = doc(db, COLLECTIONS.PROJECTS, projectId);
      const projectSnap = await getDoc(projectRef);
      if (!projectSnap.exists()) {
        showToast("Error: Project document does not exist in database.");
        return;
      }

      await updateDoc(projectRef, sanitizeFirestorePayload({
        [PROJECT_FIELDS.STATUS]: canonicalStatus,
        [PROJECT_FIELDS.UPDATED_AT]: serverTimestamp()
      }));

      // Audit Trail logging for design completions and milestone status updates
      if (canonicalStatus === CANONICAL_PROJECT_STATUS.COMPLETED || canonicalStatus === CANONICAL_PROJECT_STATUS.APPROVED) {
        try {
          const myScopes = getDesignerAssignedScopes(project, lockedEmail);
          const activeScopeLabel = myScopes.length > 0 ? myScopes.join(", ") : (project.scopeOfWork || "Design Phase");

          await addDoc(collection(db, "auditLogs"), sanitizeFirestorePayload({
            action: canonicalStatus === CANONICAL_PROJECT_STATUS.COMPLETED ? "DESIGN_COMPLETED" : "DESIGN_APPROVED",
            actor: lockedEmail,
            target: project.projectName || project.projectNumber || project.srNumber || projectId,
            details: {
              projectId: project.id,
              projectNumber: project.projectNumber || project.srNumber || "N/A",
              clientName: project.clientName || "N/A",
              scopeOfWork: activeScopeLabel,
              subService: project.subService || "N/A",
              moduleMilestone: activeScopeLabel,
              commissionMilestoneLocked: canonicalStatus === CANONICAL_PROJECT_STATUS.COMPLETED,
              plantCapacity: formatCapacity(project.plantCapacity, project.capacityUnit || "kW"),
              previousStatus: project.status,
              newStatus: canonicalStatus
            },
            timestamp: new Date().toISOString()
          }));
        } catch (auditErr) {
          console.warn("Could not log status update to auditLogs:", auditErr);
        }
      }

      showToast(`Status updated to ${STATUS_LABELS[canonicalStatus] || canonicalStatus}`);
    } catch (error) {
      console.error("Error updating status:", error);
      showToast("Error updating status");
    }
  };

  const handleExportDesign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportProject) return;
    setIsExporting(true);

    const exportLabels: Record<string, string> = {
      solar_layout: "Solar Plant Layout (DWG/PDF Specs)",
      single_line_diagram: "Single-Line Diagram (SLD)",
      complete_package: "Complete Engineering & Design Package"
    };

    const typeLabel = exportLabels[exportType] || "Solar Plant Layout";
    const myScopes = getDesignerAssignedScopes(exportProject, lockedEmail);
    const activeExportScope = myScopes.length > 0 ? myScopes.join(", ") : (exportProject.scopeOfWork || typeLabel);

    try {
      // 1. Audit Trail: Log completed design export strictly according to Master Database Blueprint
      await addDoc(collection(db, "auditLogs"), sanitizeFirestorePayload({
        action: "DESIGN_EXPORT_COMPLETED",
        actor: lockedEmail,
        target: exportProject.projectName || exportProject.projectNumber || exportProject.srNumber || exportProject.id,
        details: {
          exportType: typeLabel,
          projectId: exportProject.id,
          projectNumber: exportProject.projectNumber || exportProject.srNumber || "N/A",
          clientName: exportProject.clientName || "N/A",
          scopeOfWork: activeExportScope,
          subService: exportProject.subService || "N/A",
          moduleMilestone: activeExportScope,
          commissionMilestoneLocked: true,
          plantCapacity: formatCapacity(exportProject.plantCapacity, exportProject.capacityUnit || "kW"),
          designerEmail: exportProject.designerEmail || lockedEmail,
          format: "Technical Engineering Specification"
        },
        timestamp: new Date().toISOString()
      }));

      const exportFileName = `${(exportProject.projectNumber || exportProject.projectName || "solar_design").replace(/[^a-zA-Z0-9_-]/g, "_")}_${exportType}.json`;
      const validation = validateDeliverableFile(exportFileName);
      if (!validation.valid) {
        showToast(validation.error || "Invalid file format");
        return;
      }

      // 2. Generate and trigger download of the design export package
      const fileData = {
        title: `Solarithm Engineering Specification - ${typeLabel}`,
        exportType: typeLabel,
        projectId: exportProject.id,
        projectNumber: exportProject.projectNumber || exportProject.srNumber || "N/A",
        clientName: exportProject.clientName || "N/A",
        projectName: exportProject.projectName || "N/A",
        scopeOfWork: activeExportScope,
        subService: exportProject.subService || "N/A",
        plantCapacity: formatCapacity(exportProject.plantCapacity, exportProject.capacityUnit || "kW"),
        designerEmail: exportProject.designerEmail || lockedEmail,
        status: normalizeProjectStatus(exportProject.status),
        exportedAt: new Date().toISOString(),
        solarithmHub: "solarithm-master"
      };

      const blob = new Blob([JSON.stringify(fileData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = exportFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Exported ${typeLabel} & logged to audit trail`);
      setIsExportModalOpen(false);
      setExportProject(null);
    } catch (err) {
      console.error("Failed to export design:", err);
      showToast("Error exporting design package");
    } finally {
      setIsExporting(false);
    }
  };

  const submitChangeRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !changeValue || !changeReason || !lockedEmail) return;

    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'lead_designer';
    const isAssigned = isDesignerAssignedToProject(selectedProject, lockedEmail, isOwnerOrAdmin);

    if (!isAssigned) {
      showToast("Unauthorized: You can only submit requests for your own projects or assigned scopes.");
      return;
    }

    // RBAC: Designers are strictly restricted from modifying financial settlements, commission matrices, or owner settings
    if (!isOwnerOrAdmin && isDesignerRestrictedField(changeField)) {
      showToast("Access Denied: Designers cannot modify financial settlements, commission matrices, or pricing rules.");
      return;
    }

    try {
      let currentValue = (selectedProject as any)[changeField];
      if (changeField === 'scopeOfWork') {
        const myScopes = getDesignerAssignedScopes(selectedProject, lockedEmail);
        if (myScopes.length > 0) {
          currentValue = myScopes.join(", ");
        }
      }
      
      await addDoc(collection(db, COLLECTIONS.CHANGE_REQUESTS), sanitizeFirestorePayload({
        projectId: selectedProject.id || "",
        projectNumber: (selectedProject as any).projectNumber || "N/A",
        clientName: toTitleCase((selectedProject as any).clientName || "N/A"),
        fieldToChange: changeField || "",
        currentValue: currentValue !== undefined && currentValue !== null ? currentValue : null,
        requestedValue: changeValue !== undefined && changeValue !== null ? changeValue : null,
        reason: changeReason || "",
        requestedBy: lockedEmail || "",
        status: 'pending',
        createdAt: serverTimestamp()
      }));

      setIsModalOpen(false);
      setSelectedProject(null);
      setChangeValue("");
      setChangeReason("");
      showToast("Change Request sent to Admin");
    } catch (error) {
      console.error("Error submitting change request:", error);
      showToast("Error submitting request");
    }
  };

  const handleTransferProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferProject || !targetDesignerEmail) return;
    setIsTransferring(true);

    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'lead_designer';
    const targetEmailClean = normalizeEmail(targetDesignerEmail);
    const sourceEmailClean = normalizeEmail(lockedEmail);

    try {
      const updateData: Record<string, any> = {
        [PROJECT_FIELDS.DESIGNER_EMAIL]: targetEmailClean,
        [PROJECT_FIELDS.UPDATED_AT]: serverTimestamp()
      };

      // Ensure split-scope consistency: transfer assigned scopes belonging to this designer
      if (transferProject.assignedScopes && typeof transferProject.assignedScopes === 'object') {
        if (Array.isArray(transferProject.assignedScopes)) {
          updateData.assignedScopes = transferProject.assignedScopes.map((item: any) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const itemEmail = normalizeEmail(item.designerEmail || item.email || item.assignedTo);
              if (itemEmail === sourceEmailClean || isOwnerOrAdmin) {
                return { ...item, designerEmail: targetEmailClean, email: targetEmailClean };
              }
            }
            return item;
          });
        } else {
          for (const [scopeKey, scopeVal] of Object.entries(transferProject.assignedScopes)) {
            if (typeof scopeVal === 'string') {
              if (normalizeEmail(scopeVal) === sourceEmailClean || isOwnerOrAdmin) {
                updateData[`assignedScopes.${scopeKey}`] = targetEmailClean;
              }
            } else if (scopeVal && typeof scopeVal === 'object') {
              const valEmail = normalizeEmail((scopeVal as any).designerEmail || (scopeVal as any).email);
              if (valEmail === sourceEmailClean || isOwnerOrAdmin) {
                updateData[`assignedScopes.${scopeKey}.designerEmail`] = targetEmailClean;
              }
            }
          }
        }
      }

      const projRef = doc(db, COLLECTIONS.PROJECTS, transferProject.id);
      const projSnap = await getDoc(projRef);
      if (!projSnap.exists()) {
        showToast("Error: Project document does not exist in database.");
        return;
      }

      await updateDoc(projRef, sanitizeFirestorePayload(updateData));

      // Audit log entry
      try {
        await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), sanitizeFirestorePayload({
          action: "PROJECT_TRANSFERRED",
          actor: lockedEmail,
          target: transferProject.projectName || transferProject.projectNumber || transferProject.id,
          details: {
            projectId: transferProject.id,
            projectNumber: transferProject.projectNumber || transferProject.srNumber || "N/A",
            clientName: transferProject.clientName || "N/A",
            fromDesigner: lockedEmail,
            toDesigner: targetEmailClean,
            transferredAt: new Date().toISOString()
          },
          timestamp: serverTimestamp()
        }));
      } catch (logErr) {
        console.warn("Could not log project transfer to auditLogs:", logErr);
      }

      showToast(`Project successfully transferred to ${targetEmailClean}`);
      setIsTransferModalOpen(false);
      setTransferProject(null);
      setTargetDesignerEmail("");
    } catch (error) {
      console.error("Error transferring project:", error);
      showToast("Error transferring project");
    } finally {
      setIsTransferring(false);
    }
  };

  const submitNewProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.clientId) {
      showToast("Please select a client.");
      return;
    }

    if (duplicateProject) {
      showToast("Duplicate project detected. Please use 'Upgrade Project'.");
      return;
    }

    setIsAddingProject(true);
    
    try {
      const selectedClient = approvedClients.find(c => c.id === newProject.clientId);
      const clientName = selectedClient ? selectedClient.name : "Unknown Client";
      const salesPersonEmail = selectedClient ? selectedClient.salesPersonEmail : "";
      const currentEmail = auth.currentUser?.email || lockedEmail;
      const initialScopeKey = getScopeKey(newProject.scopeOfWork || "preDesign");

      const selectedDate = newProject.projectDate || new Date().toISOString().split('T')[0];
      const projectDateObj = new Date(`${selectedDate}T12:00:00`);
      const projectTimestamp = Timestamp.fromDate(projectDateObj);

      // Directive 3: Calculate next sequential serial number (srNo) and formatted project code
      const targetYear = isNaN(projectDateObj.getTime()) ? new Date().getFullYear() : projectDateObj.getFullYear();
      const targetMonth = isNaN(projectDateObj.getTime()) ? String(new Date().getMonth() + 1).padStart(2, '0') : String(projectDateObj.getMonth() + 1).padStart(2, '0');
      const ymStr = `${targetYear}-${targetMonth}`;

      let maxSeq = 0;
      // 1. Inspect all in-memory projects
      const allKnown = [...projectsList, ...existingProjectsForDedupe];
      allKnown.forEach(p => {
        const pNum = p.projectNumber || p.srNumber || "";
        if (pNum.includes(ymStr)) {
          const match = pNum.match(/-(\d+)$/);
          if (match) {
            const seq = parseInt(match[1], 10);
            if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
          }
        }
        if (typeof p.srNo === 'number' && (p.date || p.projectDate || "").startsWith(ymStr)) {
          if (p.srNo > maxSeq) maxSeq = p.srNo;
        }
      });

      // 2. Real-time query to Firestore projects collection to guard against race conditions
      try {
        const snap = await getDocs(collection(db, COLLECTIONS.PROJECTS));
        snap.docs.forEach(docSnap => {
          const dData = docSnap.data();
          const pNum = dData.projectNumber || dData.srNumber || "";
          if (pNum.includes(ymStr)) {
            const match = pNum.match(/-(\d+)$/);
            if (match) {
              const seq = parseInt(match[1], 10);
              if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
            }
          }
          if (typeof dData.srNo === 'number' && (dData.date || dData.projectDate || "").startsWith(ymStr)) {
            if (dData.srNo > maxSeq) maxSeq = dData.srNo;
          }
        });
      } catch (err) {
        console.warn("Could not query projects collection for max seq", err);
      }

      const nextSrNo = maxSeq + 1;
      const clientPrefix = deriveClientCodePrefix(clientName);
      const { projectNumber: generatedProjectNumber } = generateProjectCode(clientPrefix, projectDateObj, nextSrNo);

      const projData = {
        [PROJECT_FIELDS.CLIENT_ID]: newProject.clientId,
        [PROJECT_FIELDS.CLIENT_NAME]: toTitleCase(clientName),
        [PROJECT_FIELDS.PROJECT_NAME]: toTitleCase(newProject.projectName),
        [PROJECT_FIELDS.PROJECT_NUMBER]: generatedProjectNumber,
        [PROJECT_FIELDS.SR_NUMBER]: generatedProjectNumber,
        [PROJECT_FIELDS.SR_NO]: nextSrNo,
        [PROJECT_FIELDS.PLANT_CAPACITY]: Number(newProject.plantCapacity),
        [PROJECT_FIELDS.CAPACITY_UNIT]: newProject.capacityUnit,
        [PROJECT_FIELDS.SCOPE_OF_WORK]: newProject.scopeOfWork.trim(),
        [PROJECT_FIELDS.SUB_SERVICE]: newProject.subService ? newProject.subService.trim() : "",
        [PROJECT_FIELDS.LOCATION]: toTitleCase(newProject.location),
        [PROJECT_FIELDS.DESIGNER_EMAIL]: currentEmail,
        assignedScopes: {
          [initialScopeKey]: currentEmail
        },
        [PROJECT_FIELDS.SALES_PERSON_EMAIL]: salesPersonEmail,
        [PROJECT_FIELDS.STATUS]: CANONICAL_PROJECT_STATUS.ASSIGNED,
        date: selectedDate,
        projectDate: selectedDate,
        [PROJECT_FIELDS.CREATED_AT]: projectTimestamp,
        [PROJECT_FIELDS.UPDATED_AT]: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, COLLECTIONS.PROJECTS), sanitizeFirestorePayload(projData));
      
      const createdProjectObj: Project = {
        id: docRef.id,
        ...projData,
        hasPendingChange: false
      } as any;
      setProjectsList((prev) => [createdProjectObj, ...prev.filter(p => p.id !== docRef.id)]);
      
      showToast(`Project ${generatedProjectNumber} created successfully!`);
      setIsAddProjectModalOpen(false);
      setNewProject({
        clientId: "",
        clientName: "",
        projectName: "",
        plantCapacity: "",
        capacityUnit: "kW",
        scopeOfWork: "",
        subService: "",
        location: "",
        projectDate: new Date().toISOString().split('T')[0]
      });
    } catch (error) {
      console.error("Error adding project:", error);
      showToast("Error adding project.");
    } finally {
      setIsAddingProject(false);
    }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  const totalProjects = activeProjectsList.length + completedProjectsList.length;
  const pendingProjects = activeProjectsList.filter(p => {
    const s = normalizeProjectStatus(p.status);
    return s === CANONICAL_PROJECT_STATUS.ASSIGNED || s === CANONICAL_PROJECT_STATUS.SUBMITTED;
  }).length;
  const inProgressProjects = activeProjectsList.filter(p => {
    const s = normalizeProjectStatus(p.status);
    return s === CANONICAL_PROJECT_STATUS.IN_PROGRESS || s === CANONICAL_PROJECT_STATUS.UNDER_REVIEW || s === CANONICAL_PROJECT_STATUS.REVISION_REQUESTED;
  }).length;
  const completedProjects = completedProjectsList.length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#121212] transition-colors duration-200">
        <div className="w-8 h-8 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full flex flex-col font-sans bg-gray-50 dark:bg-[#121212] text-gray-900 dark:text-gray-200 transition-colors duration-200">
      {/* Top Header */}
      <header className="w-full max-w-full bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white px-4 sm:px-6 py-3.5 sm:py-4 shadow-sm sticky top-0 z-30 flex justify-between items-center border-b-4 border-[#D4AF37] transition-colors duration-200">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {/* Mobile Hamburger Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 dark:border-[#333333] hover:border-[#D4AF37]/50 text-gray-700 dark:text-gray-300 hover:text-[#D4AF37] transition-colors flex-shrink-0"
            aria-label="Toggle mobile menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-amber-50 dark:bg-[#2A2A2A] rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 border border-amber-200/60 dark:border-[#333333]">
            <PenTool className="w-5 h-5 sm:w-6 sm:h-6 text-[#D4AF37]" />
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-base sm:text-xl font-bold text-gray-900 dark:text-white tracking-wider">SOLARITHM</span>
              <span className="text-base sm:text-xl font-bold text-[#D4AF37]">Design Studio</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 hidden sm:block truncate">Technical workspace for solar design, engineering, and scope execution.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 text-sm flex-shrink-0">
          <ThemeToggle />
          <div className="hidden lg:flex flex-col items-end">
            <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-semibold tracking-wider">
              {userRole === 'owner' ? 'Owner / Production Admin' : userRole === 'admin' ? 'Admin' : userRole === 'lead_designer' ? 'Lead Designer' : 'Designer'}
            </span>
            <span className="text-[#D4AF37] font-medium leading-none">{lockedEmail}</span>
          </div>
          <button 
            onClick={onUnlock}
            className="flex items-center gap-1.5 sm:gap-2 bg-[#D4AF37] hover:bg-[#B5952F] text-black font-semibold px-3 sm:px-4 py-1.5 sm:py-2 rounded-md transition-colors text-xs sm:text-sm shadow-sm"
            title="Sign out of Designer Studio"
          >
            <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Mobile Slide-Out Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/60 dark:bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[82vw] bg-white dark:bg-[#1E1E1E] border-r border-gray-200 dark:border-[#333333] shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-gray-200 dark:border-[#333333] flex items-center justify-between bg-gray-50 dark:bg-[#121212]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-50 dark:bg-[#2A2A2A] rounded-lg flex items-center justify-center border border-amber-200/60 dark:border-[#333333]">
                  <PenTool className="w-5 h-5 text-[#D4AF37]" />
                </div>
                <div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white tracking-wider">SOLARITHM</span>
                  <p className="text-[10px] text-[#D4AF37] font-semibold">Design Studio</p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-[#2A2A2A] transition-colors"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Info Badge in Mobile Drawer */}
            <div className="p-4 border-b border-gray-200 dark:border-[#333333] bg-gray-100/60 dark:bg-[#1a1a1a]">
              <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-semibold tracking-wider">Active Designer</span>
              <p className="text-sm font-medium text-[#D4AF37] truncate mt-0.5">{lockedEmail}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white dark:bg-[#2A2A2A] text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-[#333333] uppercase">
                  {userRole === 'lead_designer' ? 'Lead Designer' : (userRole || 'Designer')}
                </span>
              </div>
            </div>

            {/* Navigation Items (auto-close when clicked) */}
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Navigation</p>
              <nav className="space-y-1.5">
                <button
                  onClick={() => {
                    setActiveTab('dashboard');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                    activeTab === 'dashboard'
                      ? 'bg-amber-50 dark:bg-[#2A2A2A] text-[#D4AF37] border-l-4 border-[#D4AF37]'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2A2A2A]'
                  }`}
                >
                  <LayoutDashboard className="w-5 h-5" />
                  Dashboard
                </button>
                <button
                  onClick={() => {
                    setActiveTab('changeRequests');
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-base font-medium transition-colors ${
                    activeTab === 'changeRequests'
                      ? 'bg-amber-50 dark:bg-[#2A2A2A] text-[#D4AF37] border-l-4 border-[#D4AF37]'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2A2A2A]'
                  }`}
                >
                  <FileEdit className="w-5 h-5" />
                  <span>My Change Requests</span>
                  {changeRequests.some(r => r.status === 'pending') && (
                    <span className="ml-auto bg-[#D4AF37] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {changeRequests.filter(r => r.status === 'pending').length}
                    </span>
                  )}
                </button>
              </nav>
            </div>

            {/* Drawer Bottom Actions */}
            <div className="p-4 border-t border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#121212]">
              <button 
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onUnlock();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-semibold bg-[#D4AF37] hover:bg-[#B5952F] text-black rounded-xl transition-colors shadow-sm"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex w-full max-w-full flex-1 overflow-hidden">
        {/* Desktop Sidebar Navigation */}
        <aside className="w-64 bg-white dark:bg-[#1E1E1E] shadow-sm z-10 hidden md:block flex-shrink-0 border-r border-gray-200 dark:border-[#333333] transition-colors duration-200">
          <div className="p-6">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">Menu</p>
            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3 text-base font-medium transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-amber-50 dark:bg-[#2A2A2A] text-[#D4AF37] border-r-4 border-[#D4AF37]'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2A2A2A] border-r-4 border-transparent'
                }`}
              >
                <LayoutDashboard className="w-5 h-5" />
                Dashboard
              </button>
              <button
                onClick={() => setActiveTab('changeRequests')}
                className={`w-full flex items-center gap-3 px-4 py-3 text-base font-medium transition-colors ${
                  activeTab === 'changeRequests'
                    ? 'bg-amber-50 dark:bg-[#2A2A2A] text-[#D4AF37] border-r-4 border-[#D4AF37]'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-[#2A2A2A] border-r-4 border-transparent'
                }`}
              >
                <FileEdit className="w-5 h-5" />
                My Change Requests
                {changeRequests.some(r => r.status === 'pending') && (
                  <span className="ml-auto bg-[#D4AF37] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {changeRequests.filter(r => r.status === 'pending').length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-full bg-gray-50 dark:bg-[#121212] overflow-y-auto px-4 sm:px-6 md:px-8 py-5 sm:py-6 flex flex-col min-w-0 transition-colors duration-200">
          {activeTab === 'dashboard' && (
            <div className="w-full max-w-full space-y-8 flex-1">
              {/* Welcome Section */}
              <div>
                <h2 className="text-2xl font-sans font-bold text-gray-900 dark:text-white">
                  {getGreeting()}, {userName || toTitleCase(lockedEmail.split('@')[0].replace(/[._0-9]+/g, ' ').trim()) || "Designer"} 👋
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Here is your project overview for today.</p>
              </div>

              {/* Quick Stats */}
              <section className="w-full max-w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-[#1E1E1E] p-4 sm:p-5 rounded-xl border border-gray-200 dark:border-[#333333] flex items-center justify-between shadow-sm transition-colors duration-200">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Total Projects</p>
                    <p className="text-2xl sm:text-3xl font-sans font-bold text-gray-900 dark:text-white">{totalProjects}</p>
                  </div>
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-amber-50 dark:bg-[#2A2A2A] rounded-full flex items-center justify-center text-[#D4AF37]">
                    <Folders className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                </div>
                <div className="bg-white dark:bg-[#1E1E1E] p-4 sm:p-5 rounded-xl border border-gray-200 dark:border-[#333333] flex items-center justify-between shadow-sm transition-colors duration-200">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Pending/Not Started</p>
                    <p className="text-2xl sm:text-3xl font-sans font-bold text-gray-900 dark:text-white">{pendingProjects}</p>
                  </div>
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-blue-50 dark:bg-[#2A2A2A] rounded-full flex items-center justify-center text-blue-500 dark:text-blue-400">
                    <Clock className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                </div>
                <div className="bg-white dark:bg-[#1E1E1E] p-4 sm:p-5 rounded-xl border border-gray-200 dark:border-[#333333] flex items-center justify-between shadow-sm transition-colors duration-200">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">In Progress/Revision</p>
                    <p className="text-2xl sm:text-3xl font-sans font-bold text-gray-900 dark:text-white">{inProgressProjects}</p>
                  </div>
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-amber-50 dark:bg-[#2A2A2A] rounded-full flex items-center justify-center text-amber-500 dark:text-amber-400">
                    <FileEdit className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                </div>
                <div className="bg-white dark:bg-[#1E1E1E] p-4 sm:p-5 rounded-xl border border-gray-200 dark:border-[#333333] flex items-center justify-between shadow-sm transition-colors duration-200">
                  <div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Completed</p>
                    <p className="text-2xl sm:text-3xl font-sans font-bold text-gray-900 dark:text-white">{completedProjects}</p>
                  </div>
                  <div className="w-11 h-11 sm:w-12 sm:h-12 bg-emerald-50 dark:bg-[#2A2A2A] rounded-full flex items-center justify-center text-emerald-500 dark:text-emerald-400">
                    <CheckCircle2 className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                </div>
              </section>

              {/* Project List */}
              <section className="w-full max-w-full bg-white dark:bg-[#1E1E1E] rounded-xl border border-gray-200 dark:border-[#333333] overflow-hidden shadow-sm transition-colors duration-200">
                {/* Search & Action Bar */}
                <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-[#333333] bg-white dark:bg-[#1E1E1E] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 transition-colors duration-200">
                  <div className="relative w-full sm:max-w-md flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400">
                        <Search className="w-4 h-4" />
                      </span>
                      <input
                        type="text"
                        placeholder="Search by client, project number, or site..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-8 py-2 text-sm bg-gray-50 dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-lg focus:ring-0 focus-within:border-[#D4AF37] focus:border-[#D4AF37] outline-none transition-all placeholder-gray-400 dark:placeholder-gray-500 shadow-sm"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery("")}
                          className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {isAnyFilterActive && (
                      <button
                        onClick={resetAllFilters}
                        className="px-2.5 py-2 text-xs font-semibold text-[#D4AF37] hover:text-[#B5952F] bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors flex items-center gap-1.5 flex-shrink-0 cursor-pointer"
                        title="Reset all active filters"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Reset Filters</span>
                      </button>
                    )}
                  </div>
                  <button 
                    onClick={() => setIsAddProjectModalOpen(true)}
                    className="w-full sm:w-auto bg-[#D4AF37] hover:bg-[#B5952F] text-black font-semibold py-2 px-4 rounded-md shadow-sm transition-colors text-sm flex items-center justify-center gap-2 flex-shrink-0 cursor-pointer"
                  >
                    <span>+ Add Project</span>
                  </button>
                </div>

                {/* Active Filter Chips Bar */}
                {isAnyFilterActive && (
                  <div className="px-4 sm:px-6 py-2.5 bg-amber-500/5 dark:bg-[#181818] border-b border-gray-200 dark:border-[#333333] flex flex-wrap items-center justify-between gap-2 text-xs transition-colors">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-500 dark:text-gray-400 font-semibold flex items-center gap-1">
                        <Filter className="w-3 h-3 text-[#D4AF37]" /> Active:
                      </span>
                      {searchQuery && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-[#2A2A2A] border border-gray-200 dark:border-[#333333] text-gray-800 dark:text-gray-200 shadow-xs">
                          <span>Search: &ldquo;{searchQuery}&rdquo;</span>
                          <button onClick={() => setSearchQuery("")} className="hover:text-rose-500 cursor-pointer ml-0.5"><X className="w-3 h-3" /></button>
                        </span>
                      )}
                      {filterClient && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-[#2A2A2A] border border-amber-500/40 text-gray-800 dark:text-gray-200 shadow-xs">
                          <span>Client: <strong className="text-[#D4AF37]">{toTitleCase(filterClient)}</strong></span>
                          <button onClick={() => setFilterClient("")} className="hover:text-rose-500 cursor-pointer ml-0.5"><X className="w-3 h-3" /></button>
                        </span>
                      )}
                      {filterScope && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-[#2A2A2A] border border-amber-500/40 text-gray-800 dark:text-gray-200 shadow-xs">
                          <span>Scope: <strong className="text-[#D4AF37]">{formatScopeDisplay(filterScope, scopesData, pricingRules)}</strong></span>
                          <button onClick={() => setFilterScope("")} className="hover:text-rose-500 cursor-pointer ml-0.5"><X className="w-3 h-3" /></button>
                        </span>
                      )}
                      {filterStatus && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-[#2A2A2A] border border-amber-500/40 text-gray-800 dark:text-gray-200 shadow-xs">
                          <span>Status: <strong className="text-[#D4AF37]">{STATUS_LABELS[filterStatus] || toTitleCase(filterStatus)}</strong></span>
                          <button onClick={() => setFilterStatus("")} className="hover:text-rose-500 cursor-pointer ml-0.5"><X className="w-3 h-3" /></button>
                        </span>
                      )}
                      {filterChangeRequest && filterChangeRequest !== "all" && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-[#2A2A2A] border border-amber-500/40 text-gray-800 dark:text-gray-200 shadow-xs">
                          <span>CR: <strong className="text-[#D4AF37]">{filterChangeRequest === 'yes' ? 'Yes' : filterChangeRequest === 'no' ? 'No' : 'Pending'}</strong></span>
                          <button onClick={() => setFilterChangeRequest("all")} className="hover:text-rose-500 cursor-pointer ml-0.5"><X className="w-3 h-3" /></button>
                        </span>
                      )}
                      {(filterDateMonth !== "" || filterDateYear) && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white dark:bg-[#2A2A2A] border border-amber-500/40 text-gray-800 dark:text-gray-200 shadow-xs">
                          <span>Date: <strong className="text-[#D4AF37]">{filterDateMonth !== "" ? monthOptions.find(m => m.value === filterDateMonth)?.label : ""} {filterDateYear || ""}</strong></span>
                          <button onClick={() => { setFilterDateMonth(""); setFilterDateYear(""); }} className="hover:text-rose-500 cursor-pointer ml-0.5"><X className="w-3 h-3" /></button>
                        </span>
                      )}
                    </div>

                    <button
                      onClick={resetAllFilters}
                      className="text-xs text-[#D4AF37] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Clear All
                    </button>
                  </div>
                )}

                <div className="border-b border-gray-200 dark:border-[#333333] bg-white dark:bg-[#1E1E1E] flex items-center px-4 sm:px-6 overflow-x-auto scrollbar-none transition-colors duration-200">
                  <div className="flex gap-4 sm:gap-6 whitespace-nowrap">
                    <button
                      onClick={() => setProjectSubTab('assigned')}
                      className={`py-3.5 sm:py-4 text-base sm:text-lg font-sans font-bold border-b-2 transition-colors relative cursor-pointer ${
                        projectSubTab === 'assigned'
                          ? 'border-[#D4AF37] text-gray-900 dark:text-white'
                          : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      Assigned Projects ({activeProjectsList.length})
                    </button>
                    <button
                      onClick={() => setProjectSubTab('my')}
                      className={`py-3.5 sm:py-4 text-base sm:text-lg font-sans font-bold border-b-2 transition-colors relative cursor-pointer ${
                        projectSubTab === 'my'
                          ? 'border-[#D4AF37] text-gray-900 dark:text-white'
                          : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      Completed Projects ({completedProjectsList.length})
                    </button>
                  </div>
                </div>
                
                {filteredProjects.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center">
                    <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-gray-300 dark:text-[#333333] mx-auto mb-4" />
                    <h4 className="text-base sm:text-lg font-medium text-gray-800 dark:text-gray-200">
                      {isAnyFilterActive ? 'No matching projects found' : (projectSubTab === 'assigned' ? 'No projects assigned yet' : 'No completed projects yet')}
                    </h4>
                    <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto mt-1">
                      {isAnyFilterActive 
                        ? 'Try clearing active column filters or adjusting your search keyword.' 
                        : (projectSubTab === 'assigned' 
                            ? 'New projects from the Sales team will appear here automatically.' 
                            : 'Projects that you mark as COMPLETED will appear here.')}
                    </p>
                    {isAnyFilterActive && (
                      <button
                        onClick={resetAllFilters}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#D4AF37] hover:bg-[#B5952F] text-black text-xs font-bold rounded-lg shadow-sm transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset All Filters
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm min-w-[1100px]">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-[#333333] text-gray-600 dark:text-gray-400 text-xs uppercase font-semibold bg-gray-50/80 dark:bg-[#1A1A1A] select-none">
                          <th className="px-5 py-3.5 font-semibold">SR. NO</th>

                          {/* CLIENT NAME + Filter Popover */}
                          <th className="px-5 py-3.5 font-semibold relative">
                            <div className="flex items-center gap-1.5">
                              <span>CLIENT NAME</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenFilterHeader(openFilterHeader === 'client' ? null : 'client');
                                }}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  filterClient ? 'text-[#D4AF37] bg-amber-500/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#2A2A2A]'
                                }`}
                                title="Filter by Client Name"
                              >
                                <Filter className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {openFilterHeader === 'client' && (
                              <div
                                ref={filterMenuRef}
                                className="absolute left-2 top-full mt-1.5 w-64 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333333] rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs"
                              >
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 dark:border-[#333333]">
                                  <span className="font-semibold text-gray-900 dark:text-white">Filter Client</span>
                                  {filterClient && (
                                    <button
                                      onClick={() => setFilterClient('')}
                                      className="text-[11px] text-[#D4AF37] hover:underline font-semibold"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  placeholder="Search clients..."
                                  value={clientSearchInFilter}
                                  onChange={(e) => setClientSearchInFilter(e.target.value)}
                                  className="w-full px-2.5 py-1.5 mb-2 bg-gray-50 dark:bg-[#121212] border border-gray-200 dark:border-[#333333] rounded-md text-xs text-gray-900 dark:text-white outline-none focus:border-[#D4AF37]"
                                />
                                <div className="max-h-48 overflow-y-auto space-y-0.5">
                                  <button
                                    onClick={() => {
                                      setFilterClient('');
                                      setOpenFilterHeader(null);
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                                      !filterClient ? 'bg-amber-500/10 text-[#D4AF37] font-semibold' : 'hover:bg-gray-100 dark:hover:bg-[#2A2A2A] text-gray-700 dark:text-gray-300'
                                    }`}
                                  >
                                    <span>All Clients ({uniqueClients.length})</span>
                                    {!filterClient && <Check className="w-3.5 h-3.5" />}
                                  </button>
                                  {filteredUniqueClients.map((client, idx) => (
                                    <button
                                      key={`filter-client-${client}-${idx}`}
                                      onClick={() => {
                                        setFilterClient(client);
                                        setOpenFilterHeader(null);
                                      }}
                                      className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors truncate ${
                                        filterClient.toLowerCase() === client.toLowerCase()
                                          ? 'bg-amber-500/10 text-[#D4AF37] font-semibold'
                                          : 'hover:bg-gray-100 dark:hover:bg-[#2A2A2A] text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      <span className="truncate">{client}</span>
                                      {filterClient.toLowerCase() === client.toLowerCase() && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </th>

                          <th className="px-5 py-3.5 font-semibold">PROJECT NAME</th>
                          <th className="px-5 py-3.5 font-semibold">PLANT CAPACITY</th>

                          {/* SCOPE + Filter Popover */}
                          <th className="px-5 py-3.5 font-semibold relative">
                            <div className="flex items-center gap-1.5">
                              <span>SCOPE</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenFilterHeader(openFilterHeader === 'scope' ? null : 'scope');
                                }}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  filterScope ? 'text-[#D4AF37] bg-amber-500/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#2A2A2A]'
                                }`}
                                title="Filter by Engineering Scope"
                              >
                                <Filter className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {openFilterHeader === 'scope' && (
                              <div
                                ref={filterMenuRef}
                                className="absolute left-2 top-full mt-1.5 w-64 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333333] rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs"
                              >
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 dark:border-[#333333]">
                                  <span className="font-semibold text-gray-900 dark:text-white">Filter Scope</span>
                                  {filterScope && (
                                    <button
                                      onClick={() => setFilterScope('')}
                                      className="text-[11px] text-[#D4AF37] hover:underline font-semibold"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                                <div className="max-h-56 overflow-y-auto space-y-0.5">
                                  <button
                                    onClick={() => {
                                      setFilterScope('');
                                      setOpenFilterHeader(null);
                                    }}
                                    className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                                      !filterScope ? 'bg-amber-500/10 text-[#D4AF37] font-semibold' : 'hover:bg-gray-100 dark:hover:bg-[#2A2A2A] text-gray-700 dark:text-gray-300'
                                    }`}
                                  >
                                    <span>All Scopes</span>
                                    {!filterScope && <Check className="w-3.5 h-3.5" />}
                                  </button>
                                  {uniqueScopes.map((scope, idx) => (
                                    <button
                                      key={`filter-scope-${scope}-${idx}`}
                                      onClick={() => {
                                        setFilterScope(scope);
                                        setOpenFilterHeader(null);
                                      }}
                                      className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors truncate ${
                                        filterScope.toLowerCase() === scope.toLowerCase()
                                          ? 'bg-amber-500/10 text-[#D4AF37] font-semibold'
                                          : 'hover:bg-gray-100 dark:hover:bg-[#2A2A2A] text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      <span className="truncate">{scope}</span>
                                      {filterScope.toLowerCase() === scope.toLowerCase() && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </th>

                          <th className="px-5 py-3.5 font-semibold">SUB SERVICE</th>

                          {/* DATE + Filter (Month & Year Popover) */}
                          <th className="px-5 py-3.5 font-semibold relative">
                            <div className="flex items-center gap-1.5">
                              <span>DATE</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenFilterHeader(openFilterHeader === 'date' ? null : 'date');
                                }}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  filterDateMonth !== "" || filterDateYear ? 'text-[#D4AF37] bg-amber-500/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#2A2A2A]'
                                }`}
                                title="Filter by Month & Year"
                              >
                                <Filter className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {openFilterHeader === 'date' && (
                              <div
                                ref={filterMenuRef}
                                className="absolute left-2 top-full mt-1.5 w-64 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333333] rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs"
                              >
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 dark:border-[#333333]">
                                  <span className="font-semibold text-gray-900 dark:text-white">Filter Date</span>
                                  {(filterDateMonth !== "" || filterDateYear) && (
                                    <button
                                      onClick={() => {
                                        setFilterDateMonth('');
                                        setFilterDateYear('');
                                      }}
                                      className="text-[11px] text-[#D4AF37] hover:underline font-semibold"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                                <div className="space-y-3">
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                                      Year
                                    </label>
                                    <select
                                      value={filterDateYear}
                                      onChange={(e) => setFilterDateYear(e.target.value)}
                                      className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-[#121212] border border-gray-200 dark:border-[#333333] rounded-md text-xs text-gray-900 dark:text-white outline-none focus:border-[#D4AF37]"
                                    >
                                      <option value="">All Years</option>
                                      {availableYears.map((yr, idx) => (
                                        <option key={`filter-yr-${yr}-${idx}`} value={yr}>{yr}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                                      Month
                                    </label>
                                    <select
                                      value={filterDateMonth}
                                      onChange={(e) => setFilterDateMonth(e.target.value)}
                                      className="w-full px-2.5 py-1.5 bg-gray-50 dark:bg-[#121212] border border-gray-200 dark:border-[#333333] rounded-md text-xs text-gray-900 dark:text-white outline-none focus:border-[#D4AF37]"
                                    >
                                      {monthOptions.map((m, idx) => (
                                        <option key={`filter-m-${m.value}-${idx}`} value={m.value}>{m.label}</option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="pt-2 border-t border-gray-200 dark:border-[#333333] flex justify-end">
                                    <button
                                      onClick={() => setOpenFilterHeader(null)}
                                      className="px-3 py-1 bg-[#D4AF37] text-black text-xs font-semibold rounded hover:bg-[#B5952F] transition-colors cursor-pointer"
                                    >
                                      Apply
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )}
                          </th>

                          {/* STATUS + Filter Popover */}
                          <th className="px-5 py-3.5 font-semibold relative">
                            <div className="flex items-center gap-1.5">
                              <span>STATUS</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenFilterHeader(openFilterHeader === 'status' ? null : 'status');
                                }}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  filterStatus ? 'text-[#D4AF37] bg-amber-500/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#2A2A2A]'
                                }`}
                                title="Filter by Status"
                              >
                                <Filter className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {openFilterHeader === 'status' && (
                              <div
                                ref={filterMenuRef}
                                className="absolute left-2 top-full mt-1.5 w-60 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333333] rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs"
                              >
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 dark:border-[#333333]">
                                  <span className="font-semibold text-gray-900 dark:text-white">Filter Status</span>
                                  {filterStatus && (
                                    <button
                                      onClick={() => setFilterStatus('')}
                                      className="text-[11px] text-[#D4AF37] hover:underline font-semibold"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                                <div className="max-h-56 overflow-y-auto space-y-0.5">
                                  {statusFilterOptions.map((st, idx) => (
                                    <button
                                      key={`filter-status-${st.value}-${idx}`}
                                      onClick={() => {
                                        setFilterStatus(st.value);
                                        setOpenFilterHeader(null);
                                      }}
                                      className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                                        filterStatus.toLowerCase() === st.value.toLowerCase()
                                          ? 'bg-amber-500/10 text-[#D4AF37] font-semibold'
                                          : 'hover:bg-gray-100 dark:hover:bg-[#2A2A2A] text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      <span>{st.label}</span>
                                      {filterStatus.toLowerCase() === st.value.toLowerCase() && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </th>

                          {/* CHANGE REQUEST + Filter Popover */}
                          <th className="px-5 py-3.5 font-semibold relative">
                            <div className="flex items-center gap-1.5">
                              <span>CHANGE REQUEST</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenFilterHeader(openFilterHeader === 'cr' ? null : 'cr');
                                }}
                                className={`p-1 rounded transition-colors cursor-pointer ${
                                  filterChangeRequest && filterChangeRequest !== 'all' ? 'text-[#D4AF37] bg-amber-500/20' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-[#2A2A2A]'
                                }`}
                                title="Filter by Change Request"
                              >
                                <Filter className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {openFilterHeader === 'cr' && (
                              <div
                                ref={filterMenuRef}
                                className="absolute right-0 top-full mt-1.5 w-56 bg-white dark:bg-[#1E1E1E] border border-gray-200 dark:border-[#333333] rounded-xl shadow-2xl p-3 z-50 normal-case font-normal text-xs"
                              >
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-200 dark:border-[#333333]">
                                  <span className="font-semibold text-gray-900 dark:text-white">Change Request</span>
                                  {filterChangeRequest !== 'all' && (
                                    <button
                                      onClick={() => setFilterChangeRequest('all')}
                                      className="text-[11px] text-[#D4AF37] hover:underline font-semibold"
                                    >
                                      Clear
                                    </button>
                                  )}
                                </div>
                                <div className="space-y-0.5">
                                  {changeRequestOptions.map((opt, idx) => (
                                    <button
                                      key={`filter-cr-${opt.value}-${idx}`}
                                      onClick={() => {
                                        setFilterChangeRequest(opt.value);
                                        setOpenFilterHeader(null);
                                      }}
                                      className={`w-full text-left px-2.5 py-1.5 rounded flex items-center justify-between transition-colors ${
                                        filterChangeRequest === opt.value
                                          ? 'bg-amber-500/10 text-[#D4AF37] font-semibold'
                                          : 'hover:bg-gray-100 dark:hover:bg-[#2A2A2A] text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      <span>{opt.label}</span>
                                      {filterChangeRequest === opt.value && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </th>

                          <th className="px-5 py-3.5 font-semibold text-right">ACTIONS</th>
                        </tr>
                      </thead>
                      
                      <tbody className="divide-y divide-gray-100 dark:divide-[#2A2A2A]">
                        {paginatedProjects.map((project, pIdx) => {
                          const designerScopes = getDesignerAssignedScopes(project, lockedEmail);
                          const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'lead_designer';
                          const displayedScope = isOwnerOrAdmin
                            ? (project.scopeOfWork || "—")
                            : (designerScopes.length > 0 ? designerScopes.join(", ") : (project.scopeOfWork || "—"));

                          return (
                          <tr key={`project-${project.id || pIdx}`} className="hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors border-b border-gray-100 dark:border-[#2A2A2A]">
                            <td className="px-5 py-4 align-top">
                              <button
                                onClick={() => {
                                  setDetailsProject(project);
                                  setIsDetailsModalOpen(true);
                                }}
                                className="text-left group cursor-pointer focus:outline-none"
                                title="Click to view project details and assigned scope"
                              >
                                <span className="text-base font-medium text-gray-900 dark:text-gray-200 group-hover:text-[#D4AF37] break-words underline-offset-2 group-hover:underline flex items-center gap-1">
                                  {project.projectNumber || "N/A"}
                                </span>
                              </button>
                              <div className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate">{safeFormatDistanceToNow(project.updatedAt || project.createdAt)}</span>
                              </div>
                            </td>
                            
                            <td className="px-5 py-4 align-top pr-2">
                              <button
                                onClick={() => {
                                  setDetailsProject(project);
                                  setIsDetailsModalOpen(true);
                                }}
                                className="text-left group cursor-pointer focus:outline-none"
                                title="Click to view project details"
                              >
                                <p className="font-semibold text-gray-900 dark:text-gray-200 text-base break-words group-hover:text-[#D4AF37]">
                                  {toTitleCase(project[PROJECT_FIELDS.CLIENT_NAME] || 'Unknown Client')}
                                </p>
                              </button>
                            </td>
                            
                            <td className="px-5 py-4 align-top pr-2">
                              <p className="text-base text-gray-600 dark:text-gray-400 break-words">{toTitleCase(project[PROJECT_FIELDS.PROJECT_NAME] || '-')}</p>
                            </td>
                            
                            <td className="px-5 py-4 align-top">
                              <span className="text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-[#2A2A2A] px-2 py-1 rounded text-sm font-medium inline-block w-fit">
                                {formatCapacity(project.plantCapacity, project.capacityUnit || "kW")}
                              </span>
                            </td>
                            
                            <td className="px-5 py-4 align-top pr-2">
                              <p className="text-base text-gray-800 dark:text-gray-200 line-clamp-2" title={formatScopeDisplay(displayedScope, scopesData, pricingRules)}>
                                {formatScopeDisplay(displayedScope, scopesData, pricingRules)}
                              </p>
                            </td>
                            
                            <td className="px-5 py-4 align-top pr-2">
                              <p className="text-base text-gray-800 dark:text-gray-200 break-words">{toTitleCase(project.subService || "—")}</p>
                            </td>
                            
                            <td className="px-5 py-4 align-top whitespace-nowrap">
                              <p className="text-sm text-gray-700 dark:text-gray-200">
                                {(() => {
                                  const d = getProjectDateObj(project);
                                  if (!d || isNaN(d.getTime())) return 'N/A';
                                  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                })()}
                              </p>
                            </td>
                            
                            <td className="px-5 py-4 align-top">
                              <select
                                value={normalizeProjectStatus(project.status)}
                                onChange={(e) => handleStatusChange(project.id, e.target.value)}
                                className={`text-sm font-medium rounded-md px-3 py-2 border border-gray-300 dark:border-[#333333] appearance-none cursor-pointer outline-none focus:ring-0 w-full ${getStatusColor(project.status)}`}
                              >
                                <option value={CANONICAL_PROJECT_STATUS.ASSIGNED} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Assigned</option>
                                <option value={CANONICAL_PROJECT_STATUS.IN_PROGRESS} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">In Progress</option>
                                <option value={CANONICAL_PROJECT_STATUS.SUBMITTED} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Submitted</option>
                                <option value={CANONICAL_PROJECT_STATUS.UNDER_REVIEW} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Under Review</option>
                                <option value={CANONICAL_PROJECT_STATUS.REVISION_REQUESTED} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Revision Requested</option>
                                <option value={CANONICAL_PROJECT_STATUS.APPROVED} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Approved</option>
                                <option value={CANONICAL_PROJECT_STATUS.COMPLETED} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Completed</option>
                              </select>
                            </td>

                            <td className="px-5 py-4 align-top">
                              <span className={`text-sm font-semibold px-2.5 py-1 rounded-md border inline-block text-center w-16 ${
                                project.hasPendingChange 
                                  ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30' 
                                  : 'bg-gray-100 dark:bg-[#2A2A2A] text-gray-700 dark:text-gray-200 border-gray-200 dark:border-[#333333]'
                              }`}>
                                {project.hasPendingChange ? "Yes" : "No"}
                              </span>
                            </td>
                            
                            <td className="px-5 py-4 align-top pl-2">
                              <div className="flex flex-row gap-2 justify-end items-center">
                                <button
                                  onClick={() => {
                                    setDetailsProject(project);
                                    setIsDetailsModalOpen(true);
                                  }}
                                  className="text-xs font-medium text-[#D4AF37] border border-amber-500/30 hover:bg-amber-50 dark:hover:bg-[#2A2A2A] px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap bg-white dark:bg-transparent cursor-pointer flex items-center gap-1.5"
                                  title="View Project Details & Scope of Work"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  View Details
                                </button>

                                <button
                                  onClick={() => {
                                    setSelectedProject(project);
                                    setChangeField("plantCapacity");
                                    setChangeValue("");
                                    setChangeReason("");
                                    setIsModalOpen(true);
                                  }}
                                  className="text-xs font-medium text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-[#333333] hover:bg-gray-100 dark:hover:bg-[#2A2A2A] px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap bg-white dark:bg-transparent cursor-pointer"
                                >
                                  Request Change
                                </button>

                                <button
                                  onClick={() => {
                                    setTransferProject(project);
                                    setTargetDesignerEmail("");
                                    setIsTransferModalOpen(true);
                                  }}
                                  className="text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-50 dark:hover:bg-[#2A2A2A] px-2.5 py-1.5 rounded-md transition-colors whitespace-nowrap bg-white dark:bg-transparent cursor-pointer"
                                >
                                  Transfer Project
                                </button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Pagination Bar */}
                    {filteredProjects.length > 0 && (
                      <div className="px-4 sm:px-6 py-3.5 border-t border-gray-200 dark:border-[#333333] bg-gray-50/70 dark:bg-[#1A1A1A] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600 dark:text-gray-400 select-none">
                        <div className="flex items-center gap-3">
                          <span>
                            Showing <strong className="text-gray-900 dark:text-white">{startIndex + 1}</strong> to <strong className="text-gray-900 dark:text-white">{endIndex}</strong> of <strong className="text-gray-900 dark:text-white">{totalItems}</strong> projects
                          </span>
                          <div className="hidden sm:flex items-center gap-1.5 pl-3 border-l border-gray-200 dark:border-[#333333]">
                            <span>Per page:</span>
                            <select
                              value={pageSize}
                              onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setCurrentPage(1);
                              }}
                              className="bg-white dark:bg-[#2A2A2A] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded px-2 py-1 outline-none text-xs cursor-pointer"
                            >
                              <option value={10}>10</option>
                              <option value={15}>15</option>
                              <option value={25}>25</option>
                              <option value={50}>50</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-2">
                          <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={safePage === 1}
                            className="px-2.5 py-1.5 rounded border border-gray-200 dark:border-[#333333] bg-white dark:bg-[#2A2A2A] hover:bg-gray-100 dark:hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-gray-200 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Previous Page"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Prev</span>
                          </button>

                          {/* Page Numbers */}
                          <div className="flex items-center gap-1">
                            {pageNumbers.map((p, idx) => (
                              typeof p === 'number' ? (
                                <button
                                  key={idx}
                                  onClick={() => setCurrentPage(p)}
                                  className={`w-7 h-7 rounded text-xs font-semibold flex items-center justify-center transition-colors cursor-pointer ${
                                    safePage === p
                                      ? 'bg-[#D4AF37] text-black shadow-sm font-bold'
                                      : 'border border-gray-200 dark:border-[#333333] bg-white dark:bg-[#2A2A2A] text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#333333]'
                                  }`}
                                >
                                  {p}
                                </button>
                              ) : (
                                <span key={idx} className="px-1 text-gray-400">...</span>
                              )
                            ))}
                          </div>

                          <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={safePage === totalPages}
                            className="px-2.5 py-1.5 rounded border border-gray-200 dark:border-[#333333] bg-white dark:bg-[#2A2A2A] hover:bg-gray-100 dark:hover:bg-[#333333] disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-gray-200 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Next Page"
                          >
                            <span className="hidden sm:inline">Next</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}

          {activeTab === 'changeRequests' && (
            <div className="w-full max-w-full space-y-8 flex-1">
              <div>
                <h2 className="text-2xl font-sans font-bold text-gray-900 dark:text-white">My Change Requests</h2>
                <p className="text-gray-600 dark:text-gray-400 mt-1">Track the status of your modification requests.</p>
              </div>

              <section className="w-full max-w-full bg-white dark:bg-[#1E1E1E] rounded-xl border border-gray-200 dark:border-[#333333] overflow-hidden shadow-sm transition-colors duration-200">
                {changeRequests.length === 0 ? (
                  <div className="p-12 text-center">
                    <FileEdit className="w-12 h-12 text-gray-300 dark:text-[#333333] mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-800 dark:text-gray-200">No requests yet</h4>
                    <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-1">You haven&apos;t submitted any change requests for your projects.</p>
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm min-w-[760px]">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-[#333333] text-gray-600 dark:text-gray-400 text-sm uppercase font-semibold bg-gray-50/60 dark:bg-transparent">
                          <th className="px-6 py-4 font-semibold">Project Number</th>
                          <th className="px-6 py-4 font-semibold">Field to Change</th>
                          <th className="px-6 py-4 font-semibold">Current Value</th>
                          <th className="px-6 py-4 font-semibold">Requested Value</th>
                          <th className="px-6 py-4 font-semibold">Reason</th>
                          <th className="px-6 py-4 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-[#2A2A2A]">
                        {changeRequests.map((req, rIdx) => (
                          <tr key={`cr-${req.id || rIdx}`} className="hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors border-b border-gray-100 dark:border-[#2A2A2A]">
                            <td className="px-6 py-4 align-middle">
                              <span className="text-base font-medium text-gray-900 dark:text-gray-200 break-words">{req.projectNumber}</span>
                              <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5 truncate max-w-[150px]">{toTitleCase(req.clientName)}</p>
                            </td>
                            <td className="px-6 py-4 align-middle font-medium text-gray-900 dark:text-gray-200 text-base">{toTitleCase(req.fieldToChange)}</td>
                            <td className="px-6 py-4 align-middle text-gray-500 dark:text-gray-400 line-through text-base">{req.currentValue !== null && req.currentValue !== undefined ? toTitleCase(String(req.currentValue)) : 'N/A'}</td>
                            <td className="px-6 py-4 align-middle text-emerald-600 dark:text-emerald-400 font-medium text-base">{req.requestedValue !== null && req.requestedValue !== undefined ? toTitleCase(String(req.requestedValue)) : ''}</td>
                            <td className="px-6 py-4 align-middle text-gray-600 dark:text-gray-400 text-sm max-w-xs truncate" title={req.reason}>
                              {req.reason}
                            </td>
                            <td className="px-6 py-4 align-middle">
                              {req.status === 'pending' && <span className="text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30 px-2.5 py-1 rounded-md text-sm font-semibold">Pending</span>}
                              {req.status === 'approved' && <span className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30 px-2.5 py-1 rounded-md text-sm font-semibold">Approved</span>}
                              {req.status === 'rejected' && (
                                <div className="group relative inline-block">
                                  <span className="text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30 px-2.5 py-1 rounded-md text-sm font-semibold cursor-help">Rejected</span>
                                  {(req as any).rejectionReason && (
                                    <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-48 bg-gray-900 dark:bg-[#1A1A1A] text-white text-sm p-2 rounded shadow-lg z-10">
                                      {(req as any).rejectionReason}
                                    </div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* Footer */}
          <footer className="mt-auto pt-8 pb-4">
            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
              © 2026 Solarithm. All Rights Reserved. Unauthorized replication prohibited.
            </p>
          </footer>
        </main>
      </div>

      {/* Project Details Modal */}
      {isDetailsModalOpen && detailsProject && (() => {
        const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'lead_designer';
        const assignedScopesList = getDesignerAssignedScopes(detailsProject, lockedEmail);
        
        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
            <div className="bg-white dark:bg-[#1E1E1E] rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border-t-4 border-[#D4AF37] max-h-[92vh] flex flex-col border border-gray-200 dark:border-transparent transition-colors">
              <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-200 dark:border-[#333333] flex justify-between items-center bg-gray-50 dark:bg-[#121212] flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-[#D4AF37]">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-sans font-bold text-gray-900 dark:text-white">
                      Project Details
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {detailsProject.projectNumber || "N/A"} • {toTitleCase(detailsProject.clientName || "Client")}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors p-1 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 sm:p-6 space-y-5 overflow-y-auto">
                {/* 1. SCOPE OF WORK SECTION - STRICTLY DISPLAY ONLY THE SPECIFIC SCOPES ASSIGNED TO DESIGNER */}
                <div className="bg-amber-500/5 dark:bg-[#252525] p-4 rounded-xl border border-amber-500/20 dark:border-amber-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <PenTool className="w-4 h-4 text-[#D4AF37]" />
                      <h4 className="text-sm font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                        Scope of Work
                      </h4>
                    </div>
                    {!isOwnerOrAdmin && (
                      <span className="text-[11px] font-semibold text-[#D4AF37] bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                        Assigned to You
                      </span>
                    )}
                  </div>

                  {!isOwnerOrAdmin ? (
                    // Strictly display ONLY the specific scopes assigned to this designer
                    <div className="space-y-2 mt-3">
                      {assignedScopesList.length > 0 ? (
                        assignedScopesList.map((scopeItem, idx) => (
                          <div
                            key={idx}
                            className="bg-white dark:bg-[#1E1E1E] p-3 rounded-lg border border-gray-200 dark:border-[#333333] flex items-center justify-between"
                          >
                            <div className="flex items-center gap-2.5">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block">
                                    Primary Task
                                  </span>
                                  <span className="text-[10px] font-semibold text-[#D4AF37] bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                    Your Scope
                                  </span>
                                </div>
                                <span className="text-sm font-bold text-gray-900 dark:text-white">
                                  {formatScopeDisplay(scopeItem, scopesData, pricingRules)}
                                </span>
                              </div>
                            </div>
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-[#2A2A2A] px-2.5 py-1 rounded">
                              {detailsProject.subService ? toTitleCase(detailsProject.subService) : "Active Deliverable"}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="bg-white dark:bg-[#1E1E1E] p-3 rounded-lg border border-gray-200 dark:border-[#333333] flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide block">
                                  Primary Task
                                </span>
                                <span className="text-[10px] font-semibold text-[#D4AF37] bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                  Your Scope
                                </span>
                              </div>
                              <span className="text-sm font-bold text-gray-900 dark:text-white">
                                {formatScopeDisplay(detailsProject.scopeOfWork || "Design Engineering", scopesData, pricingRules)}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-[#2A2A2A] px-2.5 py-1 rounded">
                            {detailsProject.subService ? toTitleCase(detailsProject.subService) : "Active Deliverable"}
                          </span>
                        </div>
                      )}
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2 italic">
                        Note: You only view milestones and deliverables for scopes assigned to you. Other scopes within this project package are managed separately by other specialists.
                      </p>
                    </div>
                  ) : (
                    // For Owner / Admin: show comprehensive split-scope mapping
                    <div className="space-y-2 mt-3">
                      <div className="bg-white dark:bg-[#1E1E1E] p-3 rounded-lg border border-gray-200 dark:border-[#333333]">
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">All Project Scopes</p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5">
                          {formatScopeDisplay(detailsProject.scopeOfWork || "—", scopesData, pricingRules)}
                        </p>
                      </div>
                      {detailsProject.assignedScopes && typeof detailsProject.assignedScopes === 'object' && (
                        <div className="bg-white dark:bg-[#1E1E1E] p-3 rounded-lg border border-gray-200 dark:border-[#333333] space-y-1.5">
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wider">
                            Scope Allocations
                          </p>
                          {Object.entries(detailsProject.assignedScopes).map(([sKey, sVal], sIdx) => {
                            const designer = typeof sVal === 'string' ? sVal : (sVal?.designerEmail || sVal?.email || 'Unassigned');
                            const isMyScope = normalizeEmail(designer) === normalizeEmail(lockedEmail);
                            return (
                              <div key={sIdx} className="flex justify-between items-center text-xs py-1 border-b border-gray-100 dark:border-[#2A2A2A] last:border-none">
                                <span className="font-medium text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                  {formatScopeDisplay(sKey, scopesData, pricingRules)}
                                  {isMyScope && (
                                    <span className="text-[10px] font-semibold text-[#D4AF37] bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">
                                      Your Scope
                                    </span>
                                  )}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400 font-mono text-[11px]">{designer}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 2. PROJECT GENERAL INFORMATION */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="bg-gray-50 dark:bg-[#252525] p-3 rounded-lg border border-gray-200 dark:border-[#333333]">
                    <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">Project Number</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5 block">
                      {detailsProject.projectNumber || "N/A"}
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-[#252525] p-3 rounded-lg border border-gray-200 dark:border-[#333333]">
                    <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">Plant Capacity</span>
                    <span className="text-sm font-semibold text-[#D4AF37] mt-0.5 block">
                      {formatCapacity(detailsProject.plantCapacity, detailsProject.capacityUnit || "kW")}
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-[#252525] p-3 rounded-lg border border-gray-200 dark:border-[#333333]">
                    <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">Market Sector</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5 block">
                      {toTitleCase(detailsProject.projectSector || "Commercial")}
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-[#252525] p-3 rounded-lg border border-gray-200 dark:border-[#333333]">
                    <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">Client Name</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5 block">
                      {toTitleCase(detailsProject.clientName || "—")}
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-[#252525] p-3 rounded-lg border border-gray-200 dark:border-[#333333]">
                    <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">Project Name / Site</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5 block">
                      {toTitleCase(detailsProject.projectName || "—")}
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-[#252525] p-3 rounded-lg border border-gray-200 dark:border-[#333333]">
                    <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">Sub-Service</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5 block">
                      {toTitleCase(detailsProject.subService || "—")}
                    </span>
                  </div>

                  <div className="bg-gray-50 dark:bg-[#252525] p-3 rounded-lg border border-gray-200 dark:border-[#333333]">
                    <span className="text-xs text-gray-500 dark:text-gray-400 block font-medium">Sales Representative</span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white mt-0.5 block truncate">
                      {detailsProject.salesPerson || "Sales Team"}
                    </span>
                  </div>
                </div>

                {/* 3. STATUS SELECTOR */}
                <div className="bg-gray-50 dark:bg-[#252525] p-4 rounded-xl border border-gray-200 dark:border-[#333333]">
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
                    Current Milestone Status
                  </label>
                  <select
                    value={normalizeProjectStatus(detailsProject.status)}
                    onChange={(e) => {
                      const canonical = normalizeProjectStatus(e.target.value);
                      handleStatusChange(detailsProject.id, canonical);
                      setDetailsProject({ ...detailsProject, status: canonical });
                    }}
                    className={`w-full text-sm font-medium rounded-md px-3 py-2.5 border border-gray-300 dark:border-[#333333] cursor-pointer outline-none focus:ring-0 ${getStatusColor(detailsProject.status)}`}
                  >
                    <option value={CANONICAL_PROJECT_STATUS.ASSIGNED} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Assigned</option>
                    <option value={CANONICAL_PROJECT_STATUS.IN_PROGRESS} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">In Progress</option>
                    <option value={CANONICAL_PROJECT_STATUS.SUBMITTED} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Submitted</option>
                    <option value={CANONICAL_PROJECT_STATUS.UNDER_REVIEW} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Under Review</option>
                    <option value={CANONICAL_PROJECT_STATUS.REVISION_REQUESTED} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Revision Requested</option>
                    <option value={CANONICAL_PROJECT_STATUS.APPROVED} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Approved</option>
                    <option value={CANONICAL_PROJECT_STATUS.COMPLETED} className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Completed</option>
                  </select>
                </div>
              </div>

              {/* Modal Footer / Actions */}
              <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-gray-200 dark:border-[#333333] bg-gray-50 dark:bg-[#121212] flex flex-wrap items-center justify-between gap-2.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium border border-gray-300 dark:border-[#333333] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-md transition-colors cursor-pointer"
                >
                  Close
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenUpgradeModal(detailsProject);
                    }}
                    className="px-3.5 py-2 text-xs sm:text-sm font-semibold bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40 rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-4 h-4" />
                    Upgrade Scope
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProject(detailsProject);
                      setChangeField("plantCapacity");
                      setChangeValue("");
                      setChangeReason("");
                      setIsDetailsModalOpen(false);
                      setIsModalOpen(true);
                    }}
                    className="px-3.5 py-2 text-xs sm:text-sm font-medium border border-gray-300 dark:border-[#333333] hover:bg-gray-100 dark:hover:bg-[#2A2A2A] text-gray-700 dark:text-gray-200 rounded-md transition-colors cursor-pointer"
                  >
                    Request Change
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setExportProject(detailsProject);
                      setExportType("solar_layout");
                      setIsDetailsModalOpen(false);
                      setIsExportModalOpen(true);
                    }}
                    className="px-4 py-2 text-xs sm:text-sm font-medium bg-[#D4AF37] hover:bg-[#B5952F] text-black font-semibold rounded-md transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Download className="w-4 h-4" />
                    Export Deliverable
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Change Request Modal */}
      {isModalOpen && selectedProject && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border-t-4 border-[#D4AF37] max-h-[92vh] flex flex-col border border-gray-200 dark:border-transparent transition-colors">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-200 dark:border-[#333333] flex justify-between items-center bg-gray-50 dark:bg-[#121212] flex-shrink-0">
              <h3 className="text-base sm:text-lg font-sans font-bold text-gray-900 dark:text-white">Request Change</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={submitChangeRequest} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Project</label>
                <input 
                  type="text" 
                  value={`${(selectedProject as any).projectNumber} - ${(selectedProject as any).clientName}`} 
                  disabled 
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-[#2A2A2A] border border-gray-200 dark:border-[#333333] rounded-md text-gray-600 dark:text-gray-200 text-xs sm:text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Field to Change</label>
                <select 
                  value={changeField}
                  onChange={(e) => {
                    setChangeField(e.target.value);
                    setChangeValue("");
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md focus:ring-0 focus-within:border-[#D4AF37] focus:border-[#D4AF37] outline-none text-xs sm:text-sm"
                >
                  <option value="plantCapacity">Plant Capacity (kW)</option>
                  <option value="scopeOfWork">Scope of Work</option>
                  <option value="subService">Sub-Service</option>
                  <option value="projectName">Project Name</option>
                  <option value="clientName">Client Name</option>
                  <option value="projectDate">Project Date</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Current Value</label>
                  <input 
                    type="text" 
                    value={(selectedProject as any)[changeField] || "N/A"} 
                    disabled 
                    className="w-full px-3 py-2 bg-gray-100 dark:bg-[#2A2A2A] border border-gray-200 dark:border-[#333333] rounded-md text-gray-500 dark:text-gray-400 text-xs sm:text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Requested Value</label>
                  {changeField === 'scopeOfWork' ? (
                    <select
                      value={changeValue}
                      onChange={(e) => setChangeValue(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md focus:ring-0 focus-within:border-[#D4AF37] focus:border-[#D4AF37] outline-none text-xs sm:text-sm"
                    >
                      <option value="">Select Scope</option>
                      {scopesData.map((s, idx) => <option key={`scope-opt-${s.name}-${idx}`} value={s.name}>{s.name}</option>)}
                    </select>
                  ) : changeField === 'subService' ? (
                    <select
                      value={changeValue}
                      onChange={(e) => setChangeValue(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md focus:ring-0 focus-within:border-[#D4AF37] focus:border-[#D4AF37] outline-none text-xs sm:text-sm"
                    >
                      <option value="">Select Sub-Service</option>
                      <option value="N/A">N/A</option>
                      {(() => {
                        const targetScope = (selectedProject?.scopeOfWork || "").toLowerCase().trim();
                        const sDoc = scopesData.find(s => s.name.toLowerCase().trim() === targetScope);
                        const subs = sDoc ? (sDoc.subServices || sDoc.modules || []) : [];
                        return subs.map((sub: any, sIdx: number) => {
                          const subName = typeof sub === 'string' ? sub : (sub?.name || sub?.title || "");
                          return <option key={`sub-${subName}-${sIdx}`} value={subName}>{subName}</option>;
                        });
                      })()}
                    </select>
                  ) : (
                    <input 
                      type="text" 
                      value={changeValue}
                      onChange={(e) => setChangeValue(e.target.value)}
                      required
                      className="w-full px-3 py-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md focus:ring-0 focus-within:border-[#D4AF37] focus:border-[#D4AF37] outline-none text-xs sm:text-sm"
                      placeholder="Enter new value"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Reason for Change</label>
                <textarea 
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  required
                  rows={3}
                  className="w-full px-3 py-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md focus:ring-0 focus-within:border-[#D4AF37] focus:border-[#D4AF37] outline-none text-xs sm:text-sm resize-none placeholder-gray-400 dark:placeholder-gray-500"
                  placeholder="Explain why this change is necessary..."
                ></textarea>
              </div>

              <div className="pt-4 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 border-t border-gray-200 dark:border-[#333333] mt-4 sm:mt-6 flex-shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium border border-gray-300 dark:border-[#333333] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-md transition-colors text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium bg-[#D4AF37] text-black hover:bg-[#B5952F] rounded-md transition-colors text-center font-semibold cursor-pointer"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Project Modal */}
      {isAddProjectModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border-t-4 border-[#D4AF37] max-h-[92vh] flex flex-col border border-gray-200 dark:border-transparent transition-colors">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-200 dark:border-[#333333] flex justify-between items-center bg-gray-50 dark:bg-[#121212] flex-shrink-0">
              <h3 className="text-base sm:text-lg font-sans font-bold text-gray-900 dark:text-white">Add New Project</h3>
              <button onClick={() => setIsAddProjectModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={submitNewProject} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Select Client *</label>
                  <select 
                    required 
                    value={newProject.clientId}
                    onChange={(e) => setNewProject({
                      ...newProject, 
                      clientId: e.target.value,
                      scopeOfWork: "",
                      subService: ""
                    })}
                    className="w-full p-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs sm:text-sm"
                  >
                    <option value="">-- Choose Client --</option>
                    {approvedClients.map((c, idx) => (
                      <option key={`client-opt-${c.id || idx}`} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {previewProjectCode && (
                  <div className="sm:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between px-3.5 py-2 bg-amber-500/10 border border-[#D4AF37]/40 rounded-lg text-xs gap-1.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-[#D4AF37]" />
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        Auto-Assigned Project Number:
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-[#D4AF37] bg-white/70 dark:bg-[#121212] px-2 py-0.5 rounded border border-[#D4AF37]/30">
                        {previewProjectCode.projectNumber}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 font-mono">
                        (Sr #{previewProjectCode.srNo})
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Project Name (Site) *</label>
                  <input 
                    type="text" 
                    required 
                    value={newProject.projectName}
                    onChange={(e) => setNewProject({...newProject, projectName: e.target.value})}
                    placeholder="e.g. Acme HQ Solar Rooftop"
                    className="w-full p-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs sm:text-sm" 
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Project Date / Received Date *</label>
                  <input 
                    type="date" 
                    required 
                    value={newProject.projectDate}
                    onChange={(e) => setNewProject({...newProject, projectDate: e.target.value})}
                    className="w-full p-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs sm:text-sm" 
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Client Site Address / Location *</label>
                  <input 
                    type="text" 
                    required 
                    value={newProject.location}
                    onChange={(e) => setNewProject({...newProject, location: e.target.value})}
                    placeholder="e.g. 100 Innovation Way, Dallas TX"
                    className="w-full p-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs sm:text-sm" 
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Plant Capacity *</label>
                  <input 
                    type="number" 
                    required 
                    min="0"
                    step="0.01"
                    value={newProject.plantCapacity}
                    onChange={(e) => setNewProject({...newProject, plantCapacity: e.target.value})}
                    className="w-full p-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs sm:text-sm" 
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Capacity Unit *</label>
                  <select 
                    required 
                    value={newProject.capacityUnit}
                    onChange={(e) => setNewProject({...newProject, capacityUnit: e.target.value})}
                    className="w-full p-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs sm:text-sm"
                  >
                    <option value="kW">kW</option>
                    <option value="MW">MW</option>
                  </select>
                </div>

                {/* Deduplication Gate: Real-time Alert & Upgrade Pathway (Triggers ONLY when all 4 composite fields match) */}
                {duplicateProject && (
                  <div className="sm:col-span-2 bg-amber-50/80 dark:bg-[#121212] border-2 border-[#D4AF37] rounded-xl p-4 shadow-xl transition-all animate-in fade-in duration-200">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#D4AF37]/20 text-[#D4AF37] flex items-center justify-center flex-shrink-0 mt-0.5 border border-[#D4AF37]/40">
                          <AlertCircle className="w-5 h-5 text-[#D4AF37]" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-black bg-[#D4AF37] px-2 py-0.5 rounded">
                              Match Detected
                            </span>
                            <h4 className="text-sm font-bold text-gray-900 dark:text-white">
                              Project Already Exists
                            </h4>
                          </div>
                          <p className="text-xs text-gray-800 dark:text-gray-200 mt-1 font-medium">
                            <span className="text-[#D4AF37] font-bold">
                              {duplicateProject.projectNumber || duplicateProject.srNumber || "Historical Project"}:
                            </span>{" "}
                            {toTitleCase(duplicateProject.projectName)} • {toTitleCase(duplicateProject.clientName || "Client")}
                            {duplicateProject.location ? ` (${toTitleCase(duplicateProject.location)})` : ""}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600 dark:text-gray-400 mt-1.5">
                            <span>Capacity: <strong className="text-gray-900 dark:text-gray-200">{formatCapacity(duplicateProject.plantCapacity, duplicateProject.capacityUnit || "kW")}</strong></span>
                            <span>•</span>
                            <span>Historical Scopes: <strong className="text-gray-900 dark:text-gray-200">{formatScopeDisplay(duplicateProject.scopeOfWork || "Pre-Design", scopesData, pricingRules)}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleOpenUpgradeModal(duplicateProject)}
                          className="px-4 py-2 bg-[#D4AF37] hover:bg-[#B5952F] text-black font-bold rounded-lg transition-colors text-xs sm:text-sm flex items-center gap-1.5 shadow-md cursor-pointer whitespace-nowrap"
                        >
                          <ArrowUpRight className="w-4 h-4" />
                          Upgrade Project
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-amber-200/80 dark:border-[#2A2A2A] flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-[#D4AF37]">
                      <ShieldAlert className="w-4 h-4 flex-shrink-0 text-[#D4AF37]" />
                      <span>Creating duplicate project entries is blocked. Click &quot;Upgrade Project&quot; to append new scopes without altering historical records.</span>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Scope of Work *</label>
                  <select 
                    required 
                    value={newProject.scopeOfWork}
                    onChange={(e) => setNewProject({
                      ...newProject, 
                      scopeOfWork: e.target.value,
                      subService: "" 
                    })}
                    className="w-full p-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs sm:text-sm"
                  >
                    <option value="">-- Choose Scope --</option>
                    {dynamicScopes.map((scope, idx) => (
                      <option key={`dynamic-scope-${scope}-${idx}`} value={scope}>{scope}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Sub Service</label>
                  <select 
                    value={newProject.subService}
                    onChange={(e) => setNewProject({...newProject, subService: e.target.value})}
                    className="w-full p-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs sm:text-sm"
                  >
                    <option value="">-- Optional Sub Service --</option>
                    {availableSubServices.map((sub, idx) => (
                      <option key={`sub-svc-${sub}-${idx}`} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 border-t border-gray-200 dark:border-[#333333] mt-4 sm:mt-6 flex-shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsAddProjectModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium border border-gray-300 dark:border-[#333333] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-md transition-colors text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isAddingProject || !!duplicateProject}
                  title={duplicateProject ? "Duplicate project detected. Please use 'Upgrade Project'." : "Create Project"}
                  className="w-full sm:w-auto px-5 py-2 text-sm font-medium bg-[#D4AF37] text-black hover:bg-[#B5952F] rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-bold cursor-pointer"
                >
                  {isAddingProject ? "Creating..." : "Create Project"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upgrade Project Scope Modal */}
      {isUpgradeModalOpen && upgradeProject && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="bg-white dark:bg-[#121212] rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden border-2 border-[#D4AF37] max-h-[92vh] flex flex-col transition-colors">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-200 dark:border-[#2A2A2A] flex justify-between items-center bg-gray-50 dark:bg-[#1A1A1A] flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center text-[#D4AF37]">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    Upgrade Project Scope
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {upgradeProject.projectNumber || upgradeProject.srNumber || "Historical Project"} • {toTitleCase(upgradeProject.projectName)}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setIsUpgradeModalOpen(false);
                  setUpgradeProject(null);
                  setNewScopesList([]);
                }} 
                className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleSaveUpgrade} className="p-5 space-y-4 overflow-y-auto">
              {/* 1. Pre-populated Historical Project Summary */}
              <div className="bg-gray-50 dark:bg-[#1A1A1A] p-3.5 rounded-xl border border-gray-200 dark:border-[#2A2A2A]">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block font-medium">Client</span>
                    <span className="font-bold text-gray-900 dark:text-white truncate block mt-0.5">
                      {toTitleCase(upgradeProject.clientName || "Unknown")}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block font-medium">Site Address</span>
                    <span className="font-bold text-gray-900 dark:text-white truncate block mt-0.5">
                      {toTitleCase(upgradeProject.location || "On-site")}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block font-medium">Plant Capacity</span>
                    <span className="font-bold text-[#D4AF37] block mt-0.5">
                      {upgradeProject.plantCapacity ? `${upgradeProject.plantCapacity} kW` : "N/A"}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-gray-400 block font-medium">Current Status</span>
                    <span className="font-bold text-gray-900 dark:text-white block mt-0.5">
                      {STATUS_LABELS[upgradeProject.status] || toTitleCase(upgradeProject.status)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 2. Historical Scopes Display (Preserved & Locked) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#D4AF37]" />
                    Historical Scopes (Preserved &amp; Locked)
                  </label>
                  <span className="text-[11px] text-gray-500 dark:text-gray-400">
                    Cannot be overwritten or deleted
                  </span>
                </div>

                <div className="space-y-1.5">
                  {getAllProjectScopes(upgradeProject).map((scopeItem, idx) => (
                    <div 
                      key={idx} 
                      className="flex items-center justify-between bg-gray-100 dark:bg-[#1E1E1E] p-2.5 rounded-lg border border-gray-200 dark:border-[#333333] text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
                        <span className="font-bold text-gray-900 dark:text-white">
                          {scopeItem.scope}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-400 font-mono text-[11px]">
                          {scopeItem.designerEmail}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-200 dark:bg-[#2A2A2A] px-2 py-0.5 rounded border border-gray-300 dark:border-[#383838]">
                          <Lock className="w-3 h-3 text-amber-500" />
                          Locked
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3. Append New Scope Section */}
              <div className="bg-gray-50 dark:bg-[#181818] p-4 rounded-xl border border-gray-200 dark:border-[#2A2A2A] space-y-3">
                <div className="flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-[#D4AF37]" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-900 dark:text-white">
                    Append New Scope (Split-Scope Architecture)
                  </h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Select Scope to Add *
                    </label>
                    <select
                      value={selectedScopeToAdd}
                      onChange={(e) => setSelectedScopeToAdd(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs"
                    >
                      <option value="">-- Choose New Scope --</option>
                      {dynamicScopes.map((scope, sIdx) => {
                        const isHistorical = getAllProjectScopes(upgradeProject).some(
                          (h) => (h.scope || "").toLowerCase().trim() === scope.toLowerCase().trim()
                        );
                        return (
                          <option 
                            key={`modal-dynamic-scope-${scope}-${sIdx}`} 
                            value={scope}
                            disabled={isHistorical}
                          >
                            {scope} {isHistorical ? "(Already Assigned)" : ""}
                          </option>
                        );
                      })}
                      <option value="CUSTOM">+ Custom Engineering Scope</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                      Assign Designer for this Scope *
                    </label>
                    <select
                      value={selectedDesignerForScope}
                      onChange={(e) => setSelectedDesignerForScope(e.target.value)}
                      className="w-full p-2 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs"
                    >
                      {allAssigneesList.map((assignee, aIdx) => (
                        <option key={`assignee-${assignee.email.toLowerCase().trim()}-${aIdx}`} value={assignee.email}>
                          {formatDesignerOption(assignee, normalizeEmail(assignee.email) === normalizeEmail(lockedEmail))}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedScopeToAdd === "CUSTOM" && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                        Custom Scope Name *
                      </label>
                      <input
                        type="text"
                        value={customScopeName}
                        onChange={(e) => setCustomScopeName(e.target.value)}
                        placeholder="e.g. 3D Shadow Analysis, Geotechnical Report"
                        className="w-full p-2 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs"
                      />
                    </div>
                  )}

                  <div className="sm:col-span-2 flex flex-col sm:flex-row items-end gap-2">
                    <div className="w-full sm:flex-1">
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                        Optional Sub-Service / Deliverable Note
                      </label>
                      {availableUpgradeSubServices.length > 0 ? (
                        <select
                          value={selectedSubServiceForScope}
                          onChange={(e) => setSelectedSubServiceForScope(e.target.value)}
                          className="w-full p-2 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs"
                        >
                          <option value="">-- Optional Sub Service --</option>
                          {availableUpgradeSubServices.map((sub, idx) => (
                            <option key={`upgrade-sub-${sub}-${idx}`} value={sub}>{sub}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={selectedSubServiceForScope}
                          onChange={(e) => setSelectedSubServiceForScope(e.target.value)}
                          placeholder="e.g. Revision 1, Inverter Sizing, Fast-track"
                          className="w-full p-2 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs"
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={handleAddScopeToUpgrade}
                      className="w-full sm:w-auto px-4 py-2 bg-[#D4AF37] hover:bg-[#B5952F] text-black font-bold rounded-md transition-colors text-xs flex items-center justify-center gap-1.5 cursor-pointer flex-shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      Add Scope
                    </button>
                  </div>
                </div>
              </div>

              {/* 4. Staged New Scopes List */}
              {newScopesList.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-[#D4AF37] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    New Scopes Ready to Append ({newScopesList.length})
                  </label>
                  <div className="space-y-1.5">
                    {newScopesList.map((staged, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-amber-500/10 dark:bg-[#D4AF37]/10 border border-[#D4AF37]/40 p-2.5 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 dark:text-white">
                            {staged.scope}
                          </span>
                          {staged.subService && (
                            <span className="text-[10px] bg-white/50 dark:bg-[#222222] px-2 py-0.5 rounded text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-[#333333]">
                              {staged.subService}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2.5">
                          <span className="text-gray-600 dark:text-gray-300 font-mono text-[11px]">
                            {staged.designerEmail}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveScopeFromUpgrade(idx)}
                            className="text-rose-500 hover:text-rose-600 p-1 transition-colors cursor-pointer"
                            title="Remove"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 5. Database Merge Guarantee Box */}
              <div className="p-3 bg-gray-50 dark:bg-[#1A1A1A] rounded-lg border border-gray-200 dark:border-[#2A2A2A] flex items-start gap-2.5 text-[11px] text-gray-500 dark:text-gray-400">
                <ShieldAlert className="w-4 h-4 text-[#D4AF37] flex-shrink-0 mt-0.5" />
                <span>
                  <strong className="text-gray-700 dark:text-gray-200">Database Merge Guarantee:</strong> New scopes will be appended using Firestore dot-notation merge. Historical scopes and their assigned specialists remain completely untouched and preserved.
                </span>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 border-t border-gray-200 dark:border-[#2A2A2A] mt-4 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsUpgradeModalOpen(false);
                    setUpgradeProject(null);
                    setNewScopesList([]);
                  }}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium border border-gray-300 dark:border-[#333333] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-md transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingUpgrade || newScopesList.length === 0}
                  className="w-full sm:w-auto px-5 py-2 text-sm font-bold bg-[#D4AF37] text-black hover:bg-[#B5952F] rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-md"
                >
                  {isSavingUpgrade ? "Upgrading Scopes..." : `Confirm & Upgrade Scope (${newScopesList.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Transfer Project Modal */}
      {isTransferModalOpen && transferProject && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-xl shadow-2xl max-w-md w-full overflow-hidden border-t-4 border-[#D4AF37] max-h-[92vh] flex flex-col border border-gray-200 dark:border-transparent transition-colors">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-200 dark:border-[#333333] flex justify-between items-center bg-gray-50 dark:bg-[#121212] flex-shrink-0">
              <h3 className="text-base sm:text-lg font-sans font-bold text-gray-900 dark:text-white">Transfer Project</h3>
              <button onClick={() => setIsTransferModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleTransferProject} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Project</label>
                <input 
                  type="text" 
                  value={`${transferProject.projectNumber || "N/A"} - ${transferProject.projectName}`} 
                  disabled 
                  className="w-full px-3 py-2 bg-gray-100 dark:bg-[#2A2A2A] border border-gray-200 dark:border-[#333333] rounded-md text-gray-600 dark:text-gray-200 text-xs sm:text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Select Peer Designer</label>
                {designersList.length === 0 ? (
                  <p className="text-xs sm:text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 p-3 rounded-md border border-rose-200 dark:border-rose-500/30">
                    No other active designers are currently available in the system.
                  </p>
                ) : (
                  <select
                    value={targetDesignerEmail}
                    onChange={(e) => setTargetDesignerEmail(e.target.value)}
                    required
                    className="w-full px-3 py-2 bg-white dark:bg-[#1E1E1E] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md focus:ring-0 focus-within:border-[#D4AF37] focus:border-[#D4AF37] outline-none text-xs sm:text-sm"
                  >
                    <option value="">Select a designer...</option>
                    {designersList.map((designer, dIdx) => (
                      <option key={`designer-${designer.email.toLowerCase().trim()}-${dIdx}`} value={designer.email}>
                        {formatDesignerOption(designer)}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="pt-4 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 border-t border-gray-200 dark:border-[#333333] mt-4 sm:mt-6 flex-shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsTransferModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium border border-gray-300 dark:border-[#333333] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-md transition-colors text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isTransferring || !targetDesignerEmail}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 rounded-md transition-colors disabled:opacity-50 text-center cursor-pointer"
                >
                  {isTransferring ? "Transferring..." : "Confirm Transfer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export Design Modal */}
      {isExportModalOpen && exportProject && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
          <div className="bg-white dark:bg-[#1E1E1E] rounded-xl shadow-2xl max-w-lg w-full overflow-hidden border-t-4 border-emerald-500 max-h-[92vh] flex flex-col border border-gray-200 dark:border-transparent transition-colors">
            <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-b border-gray-200 dark:border-[#333333] flex justify-between items-center bg-gray-50 dark:bg-[#121212] flex-shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-base sm:text-lg font-sans font-bold text-gray-900 dark:text-white">Export Design Deliverables</h3>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors p-1 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleExportDesign} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
              <div className="bg-gray-50 dark:bg-[#252525] p-3.5 rounded-lg border border-gray-200 dark:border-[#333333] space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">Project Number:</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{exportProject.projectNumber || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">Project Name:</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{toTitleCase(exportProject.projectName || "N/A")}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">Client:</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{toTitleCase(exportProject.clientName || "N/A")}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 dark:text-gray-400 font-medium">Plant Capacity:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCapacity(exportProject.plantCapacity, exportProject.capacityUnit || "kW")}</span>
                </div>
                {(() => {
                  const myScopes = getDesignerAssignedScopes(exportProject, lockedEmail);
                  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || userRole === 'lead_designer';
                  const displayExportScope = isOwnerOrAdmin
                    ? (exportProject.scopeOfWork || "N/A")
                    : (myScopes.length > 0 ? myScopes.join(", ") : (exportProject.scopeOfWork || "N/A"));
                  return (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">Assigned Scope:</span>
                      <span className="font-semibold text-amber-600 dark:text-[#D4AF37]">{formatScopeDisplay(displayExportScope, scopesData, pricingRules)}</span>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
                  Select Deliverable to Export:
                </label>
                <div className="space-y-2">
                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    exportType === 'solar_layout' 
                      ? 'border-emerald-500 bg-emerald-500/5 text-emerald-950 dark:text-emerald-100' 
                      : 'border-gray-200 dark:border-[#333333] hover:bg-gray-50 dark:hover:bg-[#2A2A2A]'
                  }`}>
                    <input 
                      type="radio" 
                      name="exportType" 
                      value="solar_layout"
                      checked={exportType === 'solar_layout'}
                      onChange={() => setExportType('solar_layout')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Solar Plant Layout (DWG / PDF Specs)</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Civil & electrical layout arrays, tilt azimuth, and roof shading boundaries.</p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    exportType === 'single_line_diagram' 
                      ? 'border-emerald-500 bg-emerald-500/5 text-emerald-950 dark:text-emerald-100' 
                      : 'border-gray-200 dark:border-[#333333] hover:bg-gray-50 dark:hover:bg-[#2A2A2A]'
                  }`}>
                    <input 
                      type="radio" 
                      name="exportType" 
                      value="single_line_diagram"
                      checked={exportType === 'single_line_diagram'}
                      onChange={() => setExportType('single_line_diagram')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Single-Line Diagram (SLD)</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">DC strings, combiner boxes, inverters, AC distribution, and grid interconnects.</p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    exportType === 'complete_package' 
                      ? 'border-emerald-500 bg-emerald-500/5 text-emerald-950 dark:text-emerald-100' 
                      : 'border-gray-200 dark:border-[#333333] hover:bg-gray-50 dark:hover:bg-[#2A2A2A]'
                  }`}>
                    <input 
                      type="radio" 
                      name="exportType" 
                      value="complete_package"
                      checked={exportType === 'complete_package'}
                      onChange={() => setExportType('complete_package')}
                      className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Complete Engineering & Design Package</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Full design dossier containing solar layouts, SLD schema, and BOM schedule.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-md border border-amber-200 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-300">
                <span className="font-semibold">Master Audit Trail Compliance:</span> An immutable audit record will be logged directly to the central <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded font-mono">auditLogs</code> collection upon export completion.
              </div>

              <div className="pt-4 flex flex-col-reverse sm:flex-row justify-end gap-2.5 sm:gap-3 border-t border-gray-200 dark:border-[#333333] mt-4 sm:mt-6 flex-shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsExportModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium border border-gray-300 dark:border-[#333333] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-[#2A2A2A] rounded-md transition-colors text-center cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={isExporting}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 rounded-md transition-colors disabled:opacity-50 text-center cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  {isExporting ? "Exporting..." : "Download & Log Audit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto max-w-sm bg-gray-900 dark:bg-[#2A2A2A] text-white px-4 py-3 rounded-md shadow-xl border-l-4 border-[#D4AF37] flex items-center gap-2 animate-in slide-in-from-bottom-5 z-50">
          <Check className="w-5 h-5 text-[#D4AF37] flex-shrink-0" />
          <p className="text-xs sm:text-sm font-medium">{toastMessage}</p>
        </div>
      )}
    </div>
  );
}
