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
  PRICING_RULES: 'pricingRules',
  PROPOSALS: 'proposals',
  CHANGE_REQUESTS: 'changeRequests',
  DESIGN_APPROVALS: 'designApprovals',
  INVOICES: 'invoices',
  PAYMENTS: 'payments',
  CREDIT_VOUCHERS: 'creditVouchers'
} as const;

export const PROJECT_PHASES = {
  PRE_DESIGN: 'preDesign',
  CEIG: 'ceig',
  IFP: 'ifp',
  DETAILED_ENGINEERING: 'detailedEngineering',
  SLD: 'sld',
  BOM: 'bom'
} as const;

export const INVOICE_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded',
  CREDIT_UTILIZED: 'credit_utilized'
} as const;

export const APPROVAL_TYPES = {
  PASSWORD_RESET_REQUEST: 'PASSWORD_RESET_REQUEST'
} as const;

export const APPROVAL_STATUS = {
  PENDING: 'pending',
  APPROVED: 'APPROVED',
  REJECTED: 'rejected'
} as const;

export const CLIENT_STATUS = {
  PENDING: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected'
} as const;

export const PROJECT_STATUS = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  PENDING_DESIGN_APPROVAL: 'pending_design_approval',
  DESIGN_APPROVED: 'design_approved',
  REQUIRED_DATA_PENDING: 'required_data_pending',
  IN_REVISION: 'in_revision',
  IN_VERIFICATION: 'in_verification',
  DELAYED: 'delayed',
  COMPLETED: 'completed'
} as const;

export const CLIENT_FIELDS = {
  COMPANY_NAME: 'companyName',
  CONTACT_PERSON: 'contactPerson',
  EMAIL: 'email',
  PHONE: 'phone',
  CITY: 'city',
  GSTIN: 'gstin',
  PRICING_CATEGORY: 'pricingCategory',
  SALES_PERSON_EMAIL: 'salesPersonEmail',
  PROPOSAL_NUMBER: 'proposalNumber',
  STATUS: 'status',
  CREATED_AT: 'createdAt'
} as const;

export const PROJECT_FIELDS = {
  PROJECT_NAME: 'projectName',
  PROJECT_NUMBER: 'projectNumber',
  CLIENT_ID: 'clientId',
  CLIENT_NAME: 'clientName',
  SCOPE_OF_WORK: 'scopeOfWork',
  SUB_SERVICE: 'subService',
  PLANT_CAPACITY: 'plantCapacity',
  CAPACITY_UNIT: 'capacityUnit',
  LOCATION: 'location',
  DESIGNER_EMAIL: 'designerEmail',
  SALES_PERSON_EMAIL: 'salesPersonEmail',
  PRICING_CATEGORY: 'pricingCategory',
  PHASES: 'phases',
  ASSIGNED_PHASES: 'assignedPhases',
  ASSIGNED_SCOPES: 'assignedScopes',
  STATUS: 'status',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt'
} as const;
