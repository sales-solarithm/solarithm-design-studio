"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp, addDoc, getDocs, Timestamp } from "firebase/firestore";
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
import { COLLECTIONS, PROJECT_STATUS, PROJECT_FIELDS, CLIENT_STATUS } from "@/src/config/schema";

type Project = {
  id: string;
  projectNumber?: string;
  srNumber: string;
  projectName: string;
  clientName: string;
  clientId?: string;
  scopeOfWork: string;
  subService?: string;
  pricingCategory?: string;
  plantCapacity: number | string | null;
  capacityUnit?: string;
  location?: string;
  projectDate: string;
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

const STATUS_OPTIONS = [
  PROJECT_STATUS.NOT_STARTED,
  PROJECT_STATUS.IN_PROGRESS,
  PROJECT_STATUS.PENDING_DESIGN_APPROVAL,
  PROJECT_STATUS.DESIGN_APPROVED,
  PROJECT_STATUS.COMPLETED
];

const STATUS_LABELS: Record<string, string> = {
  [PROJECT_STATUS.NOT_STARTED]: 'Not Started',
  [PROJECT_STATUS.IN_PROGRESS]: 'In Progress',
  [PROJECT_STATUS.PENDING_DESIGN_APPROVAL]: 'Pending Approval',
  [PROJECT_STATUS.DESIGN_APPROVED]: 'Design Approved',
  [PROJECT_STATUS.COMPLETED]: 'Completed',
  'required_data_pending': 'Required Data Pending',
  'in_revision': 'In Revision',
  'in_verification': 'In Verification',
  'delayed': 'Delayed'
};

/**
 * Safely extracts timestamp (in milliseconds) evaluating in strict priority:
 * 1. projectDate
 * 2. date (or project.date)
 * 3. createdAt
 * 4. updatedAt
 * Safely handles ISO strings ("YYYY-MM-DD"), timestamps, and dates without runtime exceptions.
 */
export const getProjectDateTimestamp = (project: any): number => {
  if (!project) return 0;

  const parseVal = (val: any): number => {
    if (!val) return 0;
    if (typeof val === 'number') {
      return isNaN(val) ? 0 : val;
    }
    if (typeof val.toMillis === 'function') {
      try { return val.toMillis(); } catch {}
    }
    if (typeof val.toDate === 'function') {
      try { return val.toDate().getTime(); } catch {}
    }
    if (typeof val.seconds === 'number') {
      return val.seconds * 1000 + (val.nanoseconds ? Math.floor(val.nanoseconds / 1e6) : 0);
    }
    if (val instanceof Date) {
      const ms = val.getTime();
      return isNaN(ms) ? 0 : ms;
    }
    if (typeof val === 'string') {
      const s = val.trim();
      if (!s) return 0;
      const parsed = Date.parse(s);
      if (!isNaN(parsed)) return parsed;
      const parts = s.split(/[-/.]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
          if (!isNaN(d.getTime())) return d.getTime();
        } else if (parts[2].length === 4) {
          const d = new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
          if (!isNaN(d.getTime())) return d.getTime();
        }
      }
    }
    return 0;
  };

  const pDate = parseVal(project.projectDate);
  if (pDate > 0) return pDate;

  const dDate = parseVal(project.date);
  if (dDate > 0) return dDate;

  const cDate = parseVal(project.createdAt);
  if (cDate > 0) return cDate;

  const uDate = parseVal(project.updatedAt);
  if (uDate > 0) return uDate;

  return 0;
};

export const getProjectDateObj = (project: any): Date | null => {
  const ts = getProjectDateTimestamp(project);
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

export const toTitleCase = (str: string) => {
  if (!str) return str;
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
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
export const formatScopeName = (scopeKeyOrName: string): string => {
  if (!scopeKeyOrName) return "";
  const lower = scopeKeyOrName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (lower === "pvsyst") return "PVsyst";
  if (lower === "predesign") return "Pre-Design";
  if (lower === "sld") return "Single Line Diagram (SLD)";
  if (lower === "bom") return "Bill of Materials (BOM)";
  if (lower === "ceig") return "CEIG Approvals";
  if (lower === "ifp") return "IFP Package";
  if (lower === "detailedengineering") return "Detailed Engineering";
  if (lower === "pestamping") return "PE Stamping";
  if (lower === "permitpackage") return "Permit Package";
  if (lower === "asbuilt") return "As-Built Drawing";
  if (lower === "interconnection") return "Interconnection Study";
  return toTitleCase(scopeKeyOrName.replace(/_/g, ' '));
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
        return parts.length > 0 ? parts.map(formatScopeName) : [formatScopeName(project.scopeOfWork)];
      }
    }
  }

  return Array.from(new Set(matchedScopes));
};

/**
 * Checks whether a designer is assigned to at least one scope within the assignedScopes object
 */
export const isDesignerAssignedToProject = (
  project: Project,
  designerEmail: string,
  isOwnerOrAdmin: boolean = false
): boolean => {
  if (isOwnerOrAdmin) return true;
  if (!project || !designerEmail) return false;
  const targetEmail = normalizeEmail(designerEmail);

  const rawAssignedScopes = project.assignedScopes;

  if (rawAssignedScopes && typeof rawAssignedScopes === "object") {
    if (Array.isArray(rawAssignedScopes)) {
      return rawAssignedScopes.some(item => {
        if (typeof item === "string") return normalizeEmail(item) === targetEmail;
        if (item && typeof item === "object") {
          const itemEmail = normalizeEmail(
            item.designerEmail || item.email || item.assignedTo || item.userEmail || item.assignedDesigner
          );
          return itemEmail === targetEmail;
        }
        return false;
      });
    } else {
      for (const [, scopeVal] of Object.entries(rawAssignedScopes)) {
        if (typeof scopeVal === "string") {
          if (normalizeEmail(scopeVal) === targetEmail) return true;
        } else if (scopeVal && typeof scopeVal === "object") {
          const valObj = scopeVal as Record<string, any>;
          const valEmail = normalizeEmail(
            valObj.designerEmail || valObj.email || valObj.assignedTo || valObj.userEmail || valObj.assignedDesigner
          );
          if (valEmail === targetEmail) return true;
        }
      }
      // If assignedScopes was explicitly provided as an object, and designer is not in it:
      return false;
    }
  }

  // Fallback for legacy projects where assignedScopes is undefined
  if (normalizeEmail(project.designerEmail) === targetEmail) return true;
  if (project.assignedPhases && project.assignedPhases.some(e => normalizeEmail(e) === targetEmail)) return true;
  if (project.phases && typeof project.phases === "object") {
    if (Object.values(project.phases).some(ph => normalizeEmail(ph?.designerEmail) === targetEmail)) {
      return true;
    }
  }

  return false;
};

const getStatusColor = (status: string) => {
  const norm = (status || "").toLowerCase();
  switch (norm) {
    case "not_started":
    case "not started":
    case "delayed":
      return "px-2 py-1 rounded text-xs font-medium border text-center text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30";
    case "in_progress":
    case "in progress":
    case "pending_design_approval":
    case "pending":
      return "px-2 py-1 rounded text-xs font-medium border text-center text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30";
    case "design_approved":
    case "approved":
    case "completed":
      return "px-2 py-1 rounded text-xs font-medium border text-center text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30";
    case "required_data_pending":
    case "in_revision":
    case "in revision":
    case "in_verification":
    case "in verification":
      return "px-2 py-1 rounded text-xs font-medium border text-center text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30";
    default:
      return "px-2 py-1 rounded text-xs font-medium border text-center text-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-500/10 border-gray-200 dark:border-gray-500/30";
  }
};

export function Dashboard({ userRole, lockedEmail, onUnlock }: { userRole?: string, lockedEmail: string, onUnlock: () => void }) {
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [projectSubTab, setProjectSubTab] = useState<'assigned' | 'my'>('assigned');
  const [changeRequests, setChangeRequests] = useState<ChangeRequest[]>([]);
  const [scopesData, setScopesData] = useState<{name: string, subServices: string[]}[]>([]);
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
  const [pricingRules, setPricingRules] = useState<any[]>([]);
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
  const userName = user?.displayName || lockedEmail.split('@')[0] || "Designer";

  // Derive active/completed projects list using client-side filter to prevent disappearing on status change
  const activeProjectsList = projectsList.filter(p => p.status !== PROJECT_STATUS.COMPLETED);
  const completedProjectsList = projectsList.filter(p => p.status === PROJECT_STATUS.COMPLETED);

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
    const standard = [
      "PVsyst",
      "Pre-Design",
      "Permit Package",
      "Detailed Engineering",
      "Single Line Diagram (SLD)",
      "Bill of Materials (BOM)",
      "CEIG Approvals",
      "IFP Package",
      "PE Stamping",
      "As-Built Drawing",
      "Interconnection Study"
    ];
    const set = new Set<string>(standard);
    projects.forEach(p => {
      if (p.scopeOfWork) {
        p.scopeOfWork.split(',').forEach(s => {
          const t = formatScopeName(s.trim());
          if (t) set.add(t);
        });
      }
    });
    return Array.from(set);
  }, [projects]);

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
    { value: "not_started", label: "Not Started" },
    { value: "in_progress", label: "In Progress" },
    { value: "pending_design_approval", label: "Pending Approval" },
    { value: "required_data_pending", label: "Required Data Pending" },
    { value: "in_revision", label: "In Revision" },
    { value: "in_verification", label: "In Verification" },
    { value: "delayed", label: "Delayed" },
    { value: "completed", label: "Completed" }
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
        const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
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
        const pStatus = (project.status || "").toLowerCase();
        const fStatus = filterStatus.toLowerCase();
        if (pStatus !== fStatus) {
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

  // Dynamic Pricing Logic for Add Project
  const selectedClientObj = approvedClients.find(c => c.id === newProject.clientId);
  const activeCategory = selectedClientObj?.pricingCategory || "T1";
  
  const rulesForTier = pricingRules.filter((rule: any) => {
    return rule.category === activeCategory;
  });
  
  const availableScopes = Array.from(
    new Set(rulesForTier.map((rule: any) => rule.scope))
  ).filter(Boolean) as string[];
  
  const availableSubServices = Array.from(
    new Set(
      rulesForTier
        .filter((rule: any) => rule.scope === newProject.scopeOfWork)
        .map((rule: any) => rule.subService)
    )
  ).filter(Boolean) as string[];

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
    if (isNaN(enteredCapacity) || enteredCapacity <= 0) {
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
    const formattedProposed = formatScopeName(scopeName);
    if (historical.some(h => formatScopeName(h.scope).toLowerCase() === formattedProposed.toLowerCase())) {
      showToast(`The scope "${formattedProposed}" is already an assigned historical scope.`);
      return;
    }

    // Check if already in staged list
    if (newScopesList.some(s => formatScopeName(s.scope).toLowerCase() === formattedProposed.toLowerCase())) {
      showToast(`The scope "${formattedProposed}" is already added in this upgrade session.`);
      return;
    }

    setNewScopesList(prev => [
      ...prev,
      {
        scope: formattedProposed,
        designerEmail: normalizeEmail(designerEmail),
        subService: selectedSubServiceForScope ? selectedSubServiceForScope.trim() : undefined
      }
    ]);

    setSelectedScopeToAdd("");
    setCustomScopeName("");
    setSelectedSubServiceForScope("");
    showToast(`Added ${formattedProposed} to upgrade package.`);
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
        newScopeTitles.push(formatScopeName(item.scope));
      }

      // Append new scope names to the high-level scopeOfWork string
      const currentScopesStr = upgradeProject.scopeOfWork || "";
      const currentScopesArr = currentScopesStr
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
      const mergedScopes = Array.from(new Set([...currentScopesArr, ...newScopeTitles]));
      updatePayload[PROJECT_FIELDS.SCOPE_OF_WORK] = mergedScopes.join(", ");

      // Execute update in Firestore
      await updateDoc(doc(db, COLLECTIONS.PROJECTS, upgradeProject.id), updatePayload);

      // Add audit log entry
      try {
        await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), {
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
        });
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
    if (!lockedEmail) return;

    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';

    // Phase 1 Split-Scope Data Filtering:
    // Update the Firestore query and frontend filter so the designer only sees projects
    // where their email is assigned to at least one scope within the assignedScopes object.
    const projectsQ = query(collection(db, COLLECTIONS.PROJECTS));

    const unsubscribeProjects = onSnapshot(projectsQ, async (snapshot) => {
      let projData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Project[];

      // Phase 1 Split-Scope Data Filtering:
      // Filter so a logged-in designer only sees projects where their email is assigned
      // to at least one scope within the assignedScopes object (with safe fallback for legacy data)
      if (!isOwnerOrAdmin) {
        projData = projData.filter(project => isDesignerAssignedToProject(project, lockedEmail, false));
      }
      
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
      
      crData.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt instanceof Date ? a.createdAt.getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0));
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt instanceof Date ? b.createdAt.getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0));
        return timeB - timeA;
      });
      
      setChangeRequests(crData);
    }, (error) => {
      console.error("Error fetching change requests:", error);
      setChangeRequests([]);
    });

    const fetchScopes = async () => {
      try {
        const snap = await getDocs(collection(db, COLLECTIONS.SCOPES));
        const uniqueScopes = Array.from(new Map(snap.docs.map(d => [d.data().name, d.data()])).values());
        setScopesData(uniqueScopes as any);
      } catch (err) {
        console.error("Error fetching scopes", err);
        setScopesData([]);
      }
    };
    fetchScopes();

    const fetchDesigners = async () => {
      try {
        let designers: { email: string; name?: string; role?: string }[] = [];
        
        // 1. Primary: employees collection (central directory in Master Blueprint)
        try {
          const empSnap = await getDocs(collection(db, COLLECTIONS.EMPLOYEES));
          if (!empSnap.empty) {
            designers = empSnap.docs.map(d => {
              const data = d.data();
              return {
                email: data.email || "",
                name: data.name || data.displayName || data.email || "",
                role: data.role || data.assignedRole || data.designation || data.department || ""
              };
            });
          }
        } catch (e) {
          console.warn("Could not query employees for designers", e);
        }

        // 2. Fallback: users collection (mirrored authentication profiles)
        if (designers.length === 0) {
          try {
            const snap = await getDocs(collection(db, COLLECTIONS.USERS));
            designers = snap.docs.map(d => {
              const data = d.data();
              return {
                email: data.email || "",
                name: data.name || data.displayName || data.email || "",
                role: data.role || data.assignedRole || ""
              };
            });
          } catch (e) {
            console.warn("Could not query users for designers", e);
          }
        }

        const filtered = designers.filter(u => {
          if (!u.email || u.email.toLowerCase() === lockedEmail.toLowerCase()) return false;
          const r = (u.role || "").toLowerCase();
          return r.includes("designer") || r.includes("design") || r.includes("engineer") || r.includes("architect");
        });
        setDesignersList(filtered);

        // Populate full assignees list for split-scope assignments including current user
        const assignees = designers.filter(u => !!u.email);
        if (!assignees.some(u => u.email.toLowerCase() === lockedEmail.toLowerCase())) {
          assignees.unshift({
            email: lockedEmail,
            name: auth.currentUser?.displayName || "You",
            role: "designer"
          });
        }
        setAllAssigneesList(assignees);
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
        const clients = snap.docs.map(d => ({
          id: d.id,
          name: d.data().companyName || d.data().contactPerson || "Unknown Client",
          salesPersonEmail: d.data().salesPersonEmail || "",
          pricingCategory: d.data().pricingCategory || "T1"
        }));
        setApprovedClients(clients);
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
      unsubscribePricingRules();
    };
  }, [lockedEmail, userRole]);

  const handleStatusChange = async (projectId: string, newStatus: string) => {
    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
    const project = activeProjectsList.concat(completedProjectsList).find(p => p.id === projectId);
    const isAssigned = project && isDesignerAssignedToProject(project, lockedEmail, isOwnerOrAdmin);

    if (!project || !isAssigned) {
      showToast("Unauthorized: You can only edit your assigned projects or module phases.");
      return;
    }

    try {
      await updateDoc(doc(db, COLLECTIONS.PROJECTS, projectId), {
        [PROJECT_FIELDS.STATUS]: newStatus,
        [PROJECT_FIELDS.UPDATED_AT]: new Date()
      });

      // Audit Trail logging for design completions and milestone status updates
      if (newStatus === PROJECT_STATUS.COMPLETED || newStatus === PROJECT_STATUS.DESIGN_APPROVED) {
        try {
          const myScopes = getDesignerAssignedScopes(project, lockedEmail);
          const activeScopeLabel = myScopes.length > 0 ? myScopes.join(", ") : (project.scopeOfWork || "Design Phase");

          await addDoc(collection(db, "auditLogs"), {
            action: newStatus === PROJECT_STATUS.COMPLETED ? "DESIGN_COMPLETED" : "DESIGN_APPROVED",
            actor: lockedEmail,
            target: project.projectName || project.projectNumber || project.srNumber || projectId,
            details: {
              projectId: project.id,
              projectNumber: project.projectNumber || project.srNumber || "N/A",
              clientName: project.clientName || "N/A",
              scopeOfWork: activeScopeLabel,
              subService: project.subService || "N/A",
              moduleMilestone: activeScopeLabel,
              commissionMilestoneLocked: newStatus === PROJECT_STATUS.COMPLETED,
              plantCapacity: project.plantCapacity ? `${project.plantCapacity} kW` : "N/A",
              previousStatus: project.status,
              newStatus: newStatus
            },
            timestamp: new Date().toISOString()
          });
        } catch (auditErr) {
          console.warn("Could not log status update to auditLogs:", auditErr);
        }
      }

      showToast(`Status updated to ${newStatus}`);
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
      await addDoc(collection(db, "auditLogs"), {
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
          plantCapacity: exportProject.plantCapacity ? `${exportProject.plantCapacity} kW` : "N/A",
          designerEmail: exportProject.designerEmail || lockedEmail,
          format: "Technical Engineering Specification"
        },
        timestamp: new Date().toISOString()
      });

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
        plantCapacity: exportProject.plantCapacity ? `${exportProject.plantCapacity} kW` : "N/A",
        designerEmail: exportProject.designerEmail || lockedEmail,
        status: exportProject.status || "N/A",
        exportedAt: new Date().toISOString(),
        solarithmHub: "solarithm-master"
      };

      const blob = new Blob([JSON.stringify(fileData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${(exportProject.projectNumber || exportProject.projectName || "solar_design").replace(/[^a-zA-Z0-9_-]/g, "_")}_${exportType}.json`;
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

    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
    const isAssigned = isDesignerAssignedToProject(selectedProject, lockedEmail, isOwnerOrAdmin);

    if (!isAssigned) {
      showToast("Unauthorized: You can only submit requests for your own projects or assigned scopes.");
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
      
      await addDoc(collection(db, COLLECTIONS.CHANGE_REQUESTS), {
        projectId: selectedProject.id || "",
        projectNumber: (selectedProject as any).projectNumber || "N/A",
        clientName: toTitleCase((selectedProject as any).clientName || "N/A"),
        fieldToChange: changeField || "",
        currentValue: currentValue !== undefined ? currentValue : null,
        requestedValue: changeValue !== undefined ? changeValue : null,
        reason: changeReason || "",
        requestedBy: lockedEmail || "",
        status: 'pending',
        createdAt: serverTimestamp()
      });

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

    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
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

      await updateDoc(doc(db, COLLECTIONS.PROJECTS, transferProject.id), updateData);

      // Audit log entry
      try {
        await addDoc(collection(db, COLLECTIONS.AUDIT_LOGS), {
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
        });
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

      const projData = {
        [PROJECT_FIELDS.CLIENT_ID]: newProject.clientId,
        [PROJECT_FIELDS.CLIENT_NAME]: toTitleCase(clientName),
        [PROJECT_FIELDS.PROJECT_NAME]: toTitleCase(newProject.projectName),
        [PROJECT_FIELDS.PLANT_CAPACITY]: Number(newProject.plantCapacity),
        [PROJECT_FIELDS.CAPACITY_UNIT]: newProject.capacityUnit,
        [PROJECT_FIELDS.SCOPE_OF_WORK]: toTitleCase(newProject.scopeOfWork),
        [PROJECT_FIELDS.SUB_SERVICE]: toTitleCase(newProject.subService),
        [PROJECT_FIELDS.LOCATION]: toTitleCase(newProject.location),
        [PROJECT_FIELDS.DESIGNER_EMAIL]: currentEmail,
        assignedScopes: {
          [initialScopeKey]: currentEmail
        },
        [PROJECT_FIELDS.SALES_PERSON_EMAIL]: salesPersonEmail,
        [PROJECT_FIELDS.STATUS]: PROJECT_STATUS.NOT_STARTED,
        date: selectedDate,
        projectDate: selectedDate,
        [PROJECT_FIELDS.CREATED_AT]: projectTimestamp,
        [PROJECT_FIELDS.UPDATED_AT]: serverTimestamp()
      };

      await addDoc(collection(db, COLLECTIONS.PROJECTS), projData);
      
      showToast("Project added successfully!");
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
    const s = (p.status || "").toLowerCase();
    return s === "not_started" || s === "not started" || s === "pending";
  }).length;
  const inProgressProjects = activeProjectsList.filter(p => {
    const s = (p.status || "").toLowerCase();
    return s === "in_progress" || s === "in progress" || s === "in_revision" || s === "in revision";
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
              {userRole === 'owner' ? 'Owner / Production Admin' : userRole === 'admin' ? 'Admin' : 'Designer'}
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
                  {userRole || 'Designer'}
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
                <h2 className="text-2xl font-sans font-bold text-gray-900 dark:text-white">{getGreeting()}, {userName} 👋</h2>
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
                          <span>Scope: <strong className="text-[#D4AF37]">{toTitleCase(filterScope)}</strong></span>
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
                                  {filteredUniqueClients.map((client) => (
                                    <button
                                      key={client}
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
                                  {uniqueScopes.map((scope) => (
                                    <button
                                      key={scope}
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
                                      {availableYears.map(yr => (
                                        <option key={yr} value={yr}>{yr}</option>
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
                                      {monthOptions.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
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
                                  {statusFilterOptions.map((st) => (
                                    <button
                                      key={st.value}
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
                                  {changeRequestOptions.map((opt) => (
                                    <button
                                      key={opt.value}
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
                        {paginatedProjects.map((project) => {
                          const designerScopes = getDesignerAssignedScopes(project, lockedEmail);
                          const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
                          const displayedScope = isOwnerOrAdmin
                            ? (project.scopeOfWork || "—")
                            : (designerScopes.length > 0 ? designerScopes.join(", ") : (project.scopeOfWork || "—"));

                          return (
                          <tr key={project.id} className="hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors border-b border-gray-100 dark:border-[#2A2A2A]">
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
                                <span className="truncate">{project.updatedAt ? formatDistanceToNow(project.updatedAt.toDate ? project.updatedAt.toDate() : new Date(project.updatedAt), { addSuffix: true }) : 'Just now'}</span>
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
                                {project.plantCapacity ? `${project.plantCapacity} kW` : "TBD"}
                              </span>
                            </td>
                            
                            <td className="px-5 py-4 align-top pr-2">
                              <p className="text-base text-gray-800 dark:text-gray-200 line-clamp-2" title={displayedScope}>
                                {toTitleCase(displayedScope)}
                              </p>
                            </td>
                            
                            <td className="px-5 py-4 align-top pr-2">
                              <p className="text-base text-gray-800 dark:text-gray-200 break-words">{toTitleCase(project.subService || "—")}</p>
                            </td>
                            
                            <td className="px-5 py-4 align-top whitespace-nowrap">
                              <p className="text-sm text-gray-700 dark:text-gray-200">
                                {(() => {
                                  const d = getProjectDateObj(project);
                                  if (!d) return 'N/A';
                                  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                })()}
                              </p>
                            </td>
                            
                            <td className="px-5 py-4 align-top">
                              <select
                                value={project.status}
                                onChange={(e) => handleStatusChange(project.id, e.target.value)}
                                className={`text-sm font-medium rounded-md px-3 py-2 border border-gray-300 dark:border-[#333333] appearance-none cursor-pointer outline-none focus:ring-0 w-full ${getStatusColor(project.status)}`}
                              >
                                <option value="not_started" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Not Started</option>
                                <option value="in_progress" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">In Progress</option>
                                <option value="required_data_pending" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Required Data Pending</option>
                                <option value="in_revision" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">In Revision</option>
                                <option value="in_verification" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">In Verification</option>
                                <option value="delayed" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Delayed</option>
                                <option value="completed" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Completed</option>
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
                        {changeRequests.map((req) => (
                          <tr key={req.id} className="hover:bg-gray-50 dark:hover:bg-[#2A2A2A] transition-colors border-b border-gray-100 dark:border-[#2A2A2A]">
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
        const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
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
                                  {toTitleCase(scopeItem)}
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
                                {toTitleCase(detailsProject.scopeOfWork || "Design Engineering")}
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
                          {toTitleCase(detailsProject.scopeOfWork || "—")}
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
                                  {toTitleCase(sKey)}
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
                      {detailsProject.plantCapacity ? `${detailsProject.plantCapacity} kW` : "TBD"}
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
                    value={detailsProject.status}
                    onChange={(e) => {
                      handleStatusChange(detailsProject.id, e.target.value);
                      setDetailsProject({ ...detailsProject, status: e.target.value });
                    }}
                    className={`w-full text-sm font-medium rounded-md px-3 py-2.5 border border-gray-300 dark:border-[#333333] cursor-pointer outline-none focus:ring-0 ${getStatusColor(detailsProject.status)}`}
                  >
                    <option value="not_started" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Not Started</option>
                    <option value="in_progress" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">In Progress</option>
                    <option value="required_data_pending" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Required Data Pending</option>
                    <option value="in_revision" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">In Revision</option>
                    <option value="in_verification" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">In Verification</option>
                    <option value="delayed" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Delayed</option>
                    <option value="completed" className="bg-white dark:bg-[#1E1E1E] text-gray-900 dark:text-white">Completed</option>
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
                      {scopesData.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
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
                      {scopesData.find(s => s.name === selectedProject.scopeOfWork)?.subServices.map(sub => <option key={sub} value={sub}>{sub}</option>)}
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
                    {approvedClients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

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
                            <span>Capacity: <strong className="text-gray-900 dark:text-gray-200">{duplicateProject.plantCapacity || "—"} kW</strong></span>
                            <span>•</span>
                            <span>Historical Scopes: <strong className="text-gray-900 dark:text-gray-200">{toTitleCase(duplicateProject.scopeOfWork || "Pre-Design")}</strong></span>
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
                    {availableScopes.map(scope => (
                      <option key={scope} value={scope}>{scope}</option>
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
                    {availableSubServices.map(sub => (
                      <option key={sub} value={sub}>{sub}</option>
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
                      {[
                        "PVsyst",
                        "Pre-Design",
                        "Permit Package",
                        "Detailed Engineering",
                        "Single Line Diagram (SLD)",
                        "Bill of Materials (BOM)",
                        "CEIG Approvals",
                        "IFP Package",
                        "PE Stamping (Civil/Structural)",
                        "PE Stamping (Electrical)",
                        "As-Built Drawing",
                        "Interconnection Study"
                      ].map((scope) => {
                        const isHistorical = getAllProjectScopes(upgradeProject).some(
                          (h) => formatScopeName(h.scope).toLowerCase() === formatScopeName(scope).toLowerCase()
                        );
                        return (
                          <option 
                            key={scope} 
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
                      {allAssigneesList.map((assignee) => (
                        <option key={assignee.email} value={assignee.email}>
                          {assignee.name ? `${assignee.name} (${assignee.email})` : assignee.email}
                          {normalizeEmail(assignee.email) === normalizeEmail(lockedEmail) ? " (You)" : ""}
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
                      <input
                        type="text"
                        value={selectedSubServiceForScope}
                        onChange={(e) => setSelectedSubServiceForScope(e.target.value)}
                        placeholder="e.g. Revision 1, Inverter Sizing, Fast-track"
                        className="w-full p-2 bg-white dark:bg-[#121212] border border-gray-300 dark:border-[#333333] text-gray-900 dark:text-white rounded-md outline-none focus-within:border-[#D4AF37] focus:border-[#D4AF37] text-xs"
                      />
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
                    {designersList.map((designer) => (
                      <option key={designer.email} value={designer.email}>
                        {designer.name ? `${designer.name} (${designer.email})` : designer.email}
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
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{exportProject.plantCapacity ? `${exportProject.plantCapacity} kW` : "TBD"}</span>
                </div>
                {(() => {
                  const myScopes = getDesignerAssignedScopes(exportProject, lockedEmail);
                  const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin';
                  const displayExportScope = isOwnerOrAdmin
                    ? (exportProject.scopeOfWork || "N/A")
                    : (myScopes.length > 0 ? myScopes.join(", ") : (exportProject.scopeOfWork || "N/A"));
                  return (
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-500 dark:text-gray-400 font-medium">Assigned Scope:</span>
                      <span className="font-semibold text-amber-600 dark:text-[#D4AF37]">{toTitleCase(displayExportScope)}</span>
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
