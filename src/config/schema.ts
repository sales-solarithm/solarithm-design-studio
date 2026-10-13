/**
 * Canonical Schema Contracts & Taxonomy for Solarithm Enterprise Ecosystem
 * Shared across: Executive Dashboard, Nexus Admin Console, Designer Studio, Project Entry, Flow
 */

export const COLLECTIONS = {
  USERS: 'users',
  EMPLOYEES: 'employees',
  APPROVALS: 'approvals',
  REGISTERED_APPS: 'registeredApps',
  AUDIT_LOGS: 'auditLogs',
  CLIENTS: 'clients',
  PROJECTS: 'projects',
  APPS: 'apps',
  APP_REGISTRY: 'registeredApps',
  SCOPES: 'scopes',
  PACKAGES: 'packages',
  PRICING_RULES: 'pricingRules',
  PROPOSALS: 'proposals',
  CHANGE_REQUESTS: 'changeRequests',
  DESIGN_APPROVALS: 'designApprovals',
  INVOICES: 'invoices',
  INCOMES: 'incomes',
  EXPENSES: 'expenses',
  PAYMENTS: 'payments',
  CREDIT_VOUCHERS: 'creditVouchers'
} as const;

// Canonical Engineering Scopes (strictly separated from Market Sectors)
export const ENGINEERING_SCOPES = [
  "Pre-Design",
  "Post-Design",
  "Detailed Engineering",
  "Permit Package",
  "CEIG",
  "IFP",
  "PVsyst",
  "Standard Design"
] as const;

export type EngineeringScope = typeof ENGINEERING_SCOPES[number];

// Canonical Market Sectors (strictly separated from Engineering Scopes)
export const MARKET_SECTORS = [
  "Domestic",
  "Commercial",
  "Industrial"
] as const;

export type MarketSector = typeof MARKET_SECTORS[number];

// Canonical Workflow Statuses (Uppercase canonical format with legacy compatibility)
export const CANONICAL_PROJECT_STATUS = {
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  REVISION_REQUESTED: 'REVISION_REQUESTED',
  APPROVED: 'APPROVED',
  COMPLETED: 'COMPLETED'
} as const;

export type CanonicalProjectStatus = typeof CANONICAL_PROJECT_STATUS[keyof typeof CANONICAL_PROJECT_STATUS];

export const CANONICAL_STATUS_LIST: CanonicalProjectStatus[] = [
  CANONICAL_PROJECT_STATUS.ASSIGNED,
  CANONICAL_PROJECT_STATUS.IN_PROGRESS,
  CANONICAL_PROJECT_STATUS.SUBMITTED,
  CANONICAL_PROJECT_STATUS.UNDER_REVIEW,
  CANONICAL_PROJECT_STATUS.REVISION_REQUESTED,
  CANONICAL_PROJECT_STATUS.APPROVED,
  CANONICAL_PROJECT_STATUS.COMPLETED
];

export const CANONICAL_STATUS_LABELS: Record<CanonicalProjectStatus, string> = {
  [CANONICAL_PROJECT_STATUS.ASSIGNED]: 'Assigned',
  [CANONICAL_PROJECT_STATUS.IN_PROGRESS]: 'In Progress',
  [CANONICAL_PROJECT_STATUS.SUBMITTED]: 'Submitted',
  [CANONICAL_PROJECT_STATUS.UNDER_REVIEW]: 'Under Review',
  [CANONICAL_PROJECT_STATUS.REVISION_REQUESTED]: 'Revision Requested',
  [CANONICAL_PROJECT_STATUS.APPROVED]: 'Approved',
  [CANONICAL_PROJECT_STATUS.COMPLETED]: 'Completed'
};

export const STATUS_LABELS: Record<string, string> = CANONICAL_STATUS_LABELS;

// Legacy Project Status mapping for backward compatibility
export const PROJECT_STATUS = {
  NOT_STARTED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  PENDING_DESIGN_APPROVAL: 'SUBMITTED',
  DESIGN_APPROVED: 'APPROVED',
  REQUIRED_DATA_PENDING: 'UNDER_REVIEW',
  IN_REVISION: 'REVISION_REQUESTED',
  IN_VERIFICATION: 'UNDER_REVIEW',
  DELAYED: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED'
} as const;

export const normalizeProjectStatus = (status?: string | null): CanonicalProjectStatus => {
  if (!status) return CANONICAL_PROJECT_STATUS.ASSIGNED;
  const clean = status.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (clean === 'NOT_STARTED' || clean === 'ASSIGNED' || clean === 'NOTSTARTED') return CANONICAL_PROJECT_STATUS.ASSIGNED;
  if (clean === 'IN_PROGRESS' || clean === 'INPROGRESS' || clean === 'DELAYED') return CANONICAL_PROJECT_STATUS.IN_PROGRESS;
  if (clean === 'PENDING_DESIGN_APPROVAL' || clean === 'SUBMITTED' || clean === 'PENDING') return CANONICAL_PROJECT_STATUS.SUBMITTED;
  if (clean === 'REQUIRED_DATA_PENDING' || clean === 'IN_VERIFICATION' || clean === 'UNDER_REVIEW') return CANONICAL_PROJECT_STATUS.UNDER_REVIEW;
  if (clean === 'IN_REVISION' || clean === 'REVISION_REQUESTED') return CANONICAL_PROJECT_STATUS.REVISION_REQUESTED;
  if (clean === 'DESIGN_APPROVED' || clean === 'APPROVED') return CANONICAL_PROJECT_STATUS.APPROVED;
  if (clean === 'COMPLETED' || clean === 'DONE') return CANONICAL_PROJECT_STATUS.COMPLETED;
  return CANONICAL_PROJECT_STATUS.ASSIGNED;
};

// Canonical Invoice Status
export const CANONICAL_INVOICE_STATUS = {
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED'
} as const;

export type CanonicalInvoiceStatus = typeof CANONICAL_INVOICE_STATUS[keyof typeof CANONICAL_INVOICE_STATUS];

export const normalizeInvoiceStatus = (status?: string | null): CanonicalInvoiceStatus => {
  if (!status) return CANONICAL_INVOICE_STATUS.PENDING;
  const clean = status.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (clean === 'PAID' || clean === 'SETTLED' || clean === 'FULL') return CANONICAL_INVOICE_STATUS.PAID;
  if (clean === 'PARTIAL' || clean === 'PARTIALLY_PAID') return CANONICAL_INVOICE_STATUS.PARTIAL;
  if (clean === 'CANCELLED' || clean === 'REFUNDED') return CANONICAL_INVOICE_STATUS.CANCELLED;
  return CANONICAL_INVOICE_STATUS.PENDING;
};

// Canonical Scope Key Resolver (camelCase contract matching Project Entry & Admin Console)
export const toCanonicalScopeKey = (scopeName?: string | null): string => {
  if (!scopeName) return "scope";
  const lower = scopeName.toLowerCase().trim();
  if (lower === "pvsyst" || lower === "pv-syst" || lower === "pv syst") return "pvsyst";
  if (lower === "predesign" || lower === "pre-design" || lower === "pre design") return "preDesign";
  if (lower === "postdesign" || lower === "post-design" || lower === "post design") return "postDesign";
  if (lower === "ceig") return "ceig";
  if (lower === "ifp") return "ifp";
  if (lower.includes("detailed")) return "detailedEngineering";
  if (lower.includes("permit")) return "permitPackage";
  if (lower.includes("sld") || lower.includes("single line")) return "sld";
  if (lower.includes("bom") || lower.includes("bill of materials")) return "bom";
  if (lower.includes("stamp")) return "peStamping";
  if (lower.includes("as-built") || lower.includes("asbuilt")) return "asBuilt";
  if (lower.includes("interconnection")) return "interconnection";
  if (lower.includes("standard")) return "standardDesign";

  const clean = lower.replace(/[^a-z0-9\s_-]/g, "");
  const parts = clean.split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return "scope";
  if (parts.length === 1) return parts[0];
  return parts[0] + parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join("");
};

// Safe string sanitizer for identifiers, PAN, GSTIN, and Bank accounts
export function safeStringIdentifier(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value.toLocaleString('fullwide', { useGrouping: false, maximumFractionDigits: 0 })
      : '';
  }
  return String(value).trim();
}

/**
 * DAT-01: System capacities (kWp), module counts, and structural metrics must treat explicit 0 as valid.
 * Treats explicit 0 as a valid numeric value (never falsy or undefined).
 */
export function formatCapacity(cap: unknown, unit = "kW"): string {
  if (cap === null || cap === undefined || cap === "") return "TBD";
  const num = Number(cap);
  if (!Number.isFinite(num)) return "TBD";
  return `${num} ${unit}`;
}

export function formatNumericMetric(val: unknown, fallback = "0"): string {
  if (val === null || val === undefined || val === "") return fallback;
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return String(num);
}

/**
 * PRJ-02: Standardize date resolution across all project views: projectDate -> date -> createdAt -> updatedAt
 * Safely parses ISO strings, dates, and Firestore Timestamps without throwing runtime exceptions.
 */
export const resolveProjectDate = (project: any): { timestamp: number; dateObj: Date | null; formatted: string } => {
  if (!project) return { timestamp: 0, dateObj: null, formatted: "N/A" };

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
  const dDate = parseVal(project.date);
  const cDate = parseVal(project.createdAt);
  const uDate = parseVal(project.updatedAt);

  const finalTs = pDate > 0 ? pDate : dDate > 0 ? dDate : cDate > 0 ? cDate : uDate > 0 ? uDate : 0;
  if (!finalTs) return { timestamp: 0, dateObj: null, formatted: "N/A" };

  const dateObj = new Date(finalTs);
  if (isNaN(dateObj.getTime())) return { timestamp: 0, dateObj: null, formatted: "N/A" };

  const formatted = dateObj.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return { timestamp: finalTs, dateObj, formatted };
};

// Deliverables Validation (DWG, DXF, PDF, ZIP, SLD, PNG, JPG)
export const VALID_DELIVERABLE_EXTENSIONS = [
  '.dwg',
  '.dxf',
  '.pdf',
  '.zip',
  '.sld',
  '.png',
  '.jpg',
  '.jpeg',
  '.json'
] as const;

export const validateDeliverableFile = (fileName: string): { valid: boolean; error?: string } => {
  if (!fileName || typeof fileName !== 'string') {
    return { valid: false, error: 'A deliverable file name or URL is required.' };
  }
  const clean = fileName.split('?')[0].split('#')[0].toLowerCase().trim();
  const lastDot = clean.lastIndexOf('.');
  if (lastDot === -1) {
    return { valid: false, error: 'File name must include a valid extension (.dwg, .dxf, .pdf, .zip, .sld).' };
  }
  const ext = clean.slice(lastDot);
  const isAllowed = VALID_DELIVERABLE_EXTENSIONS.includes(ext as any);
  if (!isAllowed) {
    return {
      valid: false,
      error: `Unsupported file format (${ext}). Allowed design asset formats: DWG, DXF, PDF, ZIP, SLD, PNG, JPG, JSON.`
    };
  }
  return { valid: true };
};

// RBAC: Restricted fields that designers cannot modify
export const isDesignerRestrictedField = (field: string): boolean => {
  const restricted = [
    'projectvalue',
    'financialsettlement',
    'settlement',
    'commission',
    'commissionmatrix',
    'pricingcategory',
    'ownersettings',
    'paymentstatus',
    'invoicestatus',
    'incomestatus',
    'expensestatus'
  ];
  return restricted.includes((field || '').toLowerCase().trim());
};

// Sub-service normalization helper for dynamic pricing
export const normalizeSubService = (val?: string | null): string => {
  const clean = String(val || "").toLowerCase().trim();
  return (!clean || clean === "n/a" || clean === "standard") ? "standard" : clean;
};

// Shared Cross-App Constants
export const SHARED_INACTIVITY_KEY = "solarithm_last_activity";
export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const CANONICAL_THEME_KEY = "solarithm_theme_mode";

/**
 * Project Code & Serial Number Generation (Aligned with Project Entry Tool Standard)
 */
export const deriveClientCodePrefix = (clientName?: string | null): string => {
  if (!clientName) return "SLR";
  const words = clientName
    .replace(/\b(Pvt\.?|Private|Ltd\.?|Limited|LLP|Inc\.?|Opc|Corp\.?)\b/gi, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }
  return "SLR";
};

export const generateProjectCode = (
  prefix: string,
  date: Date | string,
  sequenceNumber: number
): { projectNumber: string; srNo: number } => {
  const d = typeof date === 'string' ? new Date(`${date}T12:00:00`) : date;
  const year = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const month = isNaN(d.getTime()) ? String(new Date().getMonth() + 1).padStart(2, '0') : String(d.getMonth() + 1).padStart(2, '0');
  const seqPadded = String(Math.max(1, sequenceNumber)).padStart(3, '0');
  const cleanPrefix = (prefix || "SLR").toUpperCase().trim();
  const projectNumber = `${cleanPrefix}-${year}-${month}-${seqPadded}`;
  return {
    projectNumber,
    srNo: Math.max(1, sequenceNumber)
  };
};

export const PROJECT_FIELDS = {
  PROJECT_NAME: 'projectName',
  PROJECT_NUMBER: 'projectNumber',
  SR_NUMBER: 'srNumber',
  SR_NO: 'srNo',
  CLIENT_ID: 'clientId',
  CLIENT_NAME: 'clientName',
  SCOPE_OF_WORK: 'scopeOfWork',
  SUB_SERVICE: 'subService',
  PROJECT_SECTOR: 'projectSector',
  PLANT_CAPACITY: 'plantCapacity',
  CAPACITY_UNIT: 'capacityUnit',
  LOCATION: 'location',
  DESIGNER_EMAIL: 'designerEmail',
  DESIGNER_NAME: 'designerName',
  SALES_PERSON_EMAIL: 'salesPersonEmail',
  SALES_PERSON: 'salesPerson',
  SALES_PERSON_NAME: 'salesPersonName',
  PRICING_CATEGORY: 'pricingCategory',
  ASSIGNED_SCOPES: 'assignedScopes',
  MODULES: 'modules',
  STATUS: 'status',
  PAYMENT_STATUS: 'paymentStatus',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  PROJECT_DATE: 'projectDate',
  DATE: 'date'
} as const;

export const CLIENT_STATUS = {
  PENDING: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected'
} as const;
