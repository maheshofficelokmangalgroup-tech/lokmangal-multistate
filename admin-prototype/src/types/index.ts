export type RoleCode = 
  | 'super_admin' 
  | 'admin' 
  | 'editor' 
  | 'finance_maker' 
  | 'finance_checker' 
  | 'branch_manager' 
  | 'hr' 
  | 'auditor';

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleCode;
  roleTitle: string;
  branchId?: string;
  branchName?: string;
  twoFactorEnabled: boolean;
  status: 'active' | 'invited' | 'deactivated';
  lastLoginAt?: string;
  createdAt: string;
}

export type LeadStatus = 'new' | 'contacted' | 'in_progress' | 'converted' | 'not_interested' | 'spam';
export type LeadType = 'loan' | 'deposit' | 'account' | 'callback' | 'contact' | 'service';

export interface LeadNote {
  id: string;
  author: string;
  note: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  reference: string;
  type: LeadType;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  branchId: string;
  branchName: string;
  details: Record<string, any>;
  status: LeadStatus;
  assignedTo?: string;
  followUpAt?: string;
  sourcePage?: string;
  isDuplicate?: boolean;
  createdAt: string;
  notes?: LeadNote[];
}

export type RateCategory = 'regular' | 'senior' | 'staff' | 'bulk';

export interface RateEntry {
  id: string;
  key: string;
  section: 'fd_slab' | 'deposit' | 'doubling' | 'loan';
  label: string;
  category?: RateCategory;
  minDays?: number;
  maxDays?: number | null;
  value: string; // decimal as string e.g. "9.50"
  unit: 'percent' | 'months';
  previousValue?: string;
}

export type ApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'scheduled' | 'live' | 'archived';

export interface RateSet {
  id: string;
  name: string;
  financialYear: string;
  validFrom: string;
  validUntil: string;
  status: ApprovalStatus;
  entries: RateEntry[];
  maker: { id: string; name: string };
  checker?: { id: string; name: string };
  submittedAt?: string;
  approvedAt?: string;
  rejectionReason?: string;
  updatedAt: string;
}

export interface DepositScheme {
  id: string;
  slug: string;
  nameEn: string;
  nameMr: string;
  type: 'fd' | 'rd' | 'monthly' | 'doubling';
  shortPitch: string;
  rateKey: string;
  minAmount: number;
  tenureMonths: number;
  isFeatured: boolean;
  status: 'draft' | 'published';
  updatedAt: string;
}

export interface LoanScheme {
  id: string;
  slug: string;
  nameEn: string;
  nameMr: string;
  summary: string;
  maxAmount: string;
  tenure: string;
  rateKey: string;
  showInEnquiryForm: boolean;
  status: 'draft' | 'published';
  updatedAt: string;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  region: string;
  address: string;
  phone: string;
  email: string;
  manager: string;
  latitude: number;
  longitude: number;
  openingHours: string;
  isActive: boolean;
  isHeadOffice?: boolean;
}

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  language: 'mr' | 'en';
  category: string;
  author: string;
  date: string;
  summary: string;
  content: string;
  status: 'draft' | 'published' | 'scheduled';
  coverImage?: string;
}

export interface Notice {
  id: string;
  title: string;
  category: 'agm' | 'election' | 'public' | 'tender';
  publishDate: string;
  expiryDate?: string;
  isPinned: boolean;
  pdfUrl?: string;
  fileSize?: string;
  status: 'active' | 'expired';
}

export interface ReleaseBuild {
  id: string;
  buildNumber: number;
  kind: 'live' | 'preview';
  status: 'building' | 'validating' | 'ready' | 'live' | 'failed' | 'superseded';
  triggeredBy: string;
  startedAt: string;
  finishedAt?: string;
  durationSeconds?: number;
  pageCount: number;
  contentHash: string;
  isCurrent: boolean;
  notes?: string;
}

export interface ApprovalItem {
  id: string;
  entityType: 'rate_set' | 'deposit_scheme' | 'loan_terms' | 'branch_edit';
  entityId: string;
  title: string;
  makerName: string;
  makerId: string;
  submittedAt: string;
  effectiveDate: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  changes: Array<{
    field: string;
    oldValue: string;
    newValue: string;
  }>;
}

export interface AuditLogItem {
  id: string;
  at: string;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  entityId: string;
  ip: string;
  beforeVal?: any;
  afterVal?: any;
}

export interface JobOpening {
  id: string;
  title: string;
  department: string;
  location: string;
  type: 'Full-time' | 'Contract';
  lastDate: string;
  status: 'open' | 'closed';
  applicantCount: number;
}

export interface JobApplication {
  id: string;
  jobId: string;
  jobTitle: string;
  name: string;
  phone: string;
  email: string;
  resumeFileName: string;
  status: 'new' | 'shortlisted' | 'interview' | 'selected' | 'rejected';
  submittedAt: string;
  notes?: string;
}

export interface OrganisationSettings {
  legalName: string;
  registrationNumber: string;
  ifscCode: string;
  phone: string;
  tollFree: string;
  email: string;
  headOfficeAddress: string;
  leadRetentionMonths: number;
  maintenanceNoticeEnabled: boolean;
  maintenanceMessage: string;
  notifications: {
    loanLeadsEmail: string;
    depositLeadsEmail: string;
    careersEmail: string;
  };
}
