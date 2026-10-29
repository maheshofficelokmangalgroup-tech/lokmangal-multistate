import type { RoleCode, User } from '../types';

export interface Permissions {
  canViewDashboard: boolean;
  canViewAllLeads: boolean;
  canViewOwnBranchLeads: boolean;
  canExportLeads: boolean;
  canManageCareers: boolean;
  canEditRates: boolean;
  canApproveRates: boolean;
  canEditContent: boolean;
  canPublishSite: boolean;
  canRollbackSite: boolean;
  canManageUsers: boolean;
  canViewAuditLog: boolean;
  canManageSettings: boolean;
}

export function getPermissions(role: RoleCode): Permissions {
  switch (role) {
    case 'super_admin':
      return {
        canViewDashboard: true,
        canViewAllLeads: true,
        canViewOwnBranchLeads: true,
        canExportLeads: true,
        canManageCareers: true,
        canEditRates: true,
        canApproveRates: true, // Cannot self-approve, checked per-item
        canEditContent: true,
        canPublishSite: true,
        canRollbackSite: true,
        canManageUsers: true,
        canViewAuditLog: true,
        canManageSettings: true,
      };

    case 'admin':
      return {
        canViewDashboard: true,
        canViewAllLeads: true,
        canViewOwnBranchLeads: true,
        canExportLeads: true,
        canManageCareers: true,
        canEditRates: false,
        canApproveRates: false,
        canEditContent: true,
        canPublishSite: true,
        canRollbackSite: true,
        canManageUsers: false,
        canViewAuditLog: true,
        canManageSettings: false,
      };

    case 'editor':
      return {
        canViewDashboard: true,
        canViewAllLeads: false,
        canViewOwnBranchLeads: false,
        canExportLeads: false,
        canManageCareers: false,
        canEditRates: false,
        canApproveRates: false,
        canEditContent: true,
        canPublishSite: false,
        canRollbackSite: false,
        canManageUsers: false,
        canViewAuditLog: false,
        canManageSettings: false,
      };

    case 'finance_maker':
      return {
        canViewDashboard: true,
        canViewAllLeads: false,
        canViewOwnBranchLeads: false,
        canExportLeads: false,
        canManageCareers: false,
        canEditRates: true,
        canApproveRates: false,
        canEditContent: false,
        canPublishSite: false,
        canRollbackSite: false,
        canManageUsers: false,
        canViewAuditLog: false,
        canManageSettings: false,
      };

    case 'finance_checker':
      return {
        canViewDashboard: true,
        canViewAllLeads: false,
        canViewOwnBranchLeads: false,
        canExportLeads: false,
        canManageCareers: false,
        canEditRates: false,
        canApproveRates: true,
        canEditContent: false,
        canPublishSite: true,
        canRollbackSite: true,
        canManageUsers: false,
        canViewAuditLog: true,
        canManageSettings: false,
      };

    case 'branch_manager':
      return {
        canViewDashboard: true,
        canViewAllLeads: false,
        canViewOwnBranchLeads: true,
        canExportLeads: true, // Only own branch
        canManageCareers: false,
        canEditRates: false,
        canApproveRates: false,
        canEditContent: false,
        canPublishSite: false,
        canRollbackSite: false,
        canManageUsers: false,
        canViewAuditLog: false,
        canManageSettings: false,
      };

    case 'hr':
      return {
        canViewDashboard: true,
        canViewAllLeads: false,
        canViewOwnBranchLeads: false,
        canExportLeads: false,
        canManageCareers: true,
        canEditRates: false,
        canApproveRates: false,
        canEditContent: false,
        canPublishSite: false,
        canRollbackSite: false,
        canManageUsers: false,
        canViewAuditLog: false,
        canManageSettings: false,
      };

    case 'auditor':
      return {
        canViewDashboard: true,
        canViewAllLeads: true, // Masked
        canViewOwnBranchLeads: true,
        canExportLeads: false,
        canManageCareers: false,
        canEditRates: false,
        canApproveRates: false,
        canEditContent: false,
        canPublishSite: false,
        canRollbackSite: false,
        canManageUsers: false,
        canViewAuditLog: true,
        canManageSettings: false,
      };

    default:
      return {
        canViewDashboard: false,
        canViewAllLeads: false,
        canViewOwnBranchLeads: false,
        canExportLeads: false,
        canManageCareers: false,
        canEditRates: false,
        canApproveRates: false,
        canEditContent: false,
        canPublishSite: false,
        canRollbackSite: false,
        canManageUsers: false,
        canViewAuditLog: false,
        canManageSettings: false,
      };
  }
}

/**
 * Enforces the Maker-Checker invariant:
 * The creator/maker of a revision CANNOT approve their own change.
 */
export function canApproveRevision(currentUser: User, makerId: string): boolean {
  if (currentUser.id === makerId) {
    return false; // Invariant: maker cannot be checker, even for Super Admin
  }
  const perms = getPermissions(currentUser.role);
  return perms.canApproveRates;
}
