import React, { useState } from 'react';
import { Users, UserPlus, ShieldCheck, Mail, Building, KeyRound, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { User, RoleCode } from '../../types';

const INITIAL_USERS: User[] = [
  {
    id: 'usr_01',
    name: 'Mahesh Deshmukh',
    email: 'admin@lokmangalmultistate.com',
    role: 'super_admin',
    roleTitle: 'Super Administrator',
    twoFactorEnabled: true,
    status: 'active',
    lastLoginAt: '2026-10-27T09:30:00Z',
    createdAt: '2026-01-15T09:00:00Z',
  },
  {
    id: 'usr_02',
    name: 'Manoj Joshi',
    email: 'manoj.joshi@lokmangalmultistate.com',
    role: 'finance_maker',
    roleTitle: 'Finance Officer (Maker)',
    twoFactorEnabled: true,
    status: 'active',
    lastLoginAt: '2026-10-27T08:15:00Z',
    createdAt: '2026-02-01T10:00:00Z',
  },
  {
    id: 'usr_03',
    name: 'Vijay Deshmukh',
    email: 'gm@lokmangalmultistate.com',
    role: 'finance_checker',
    roleTitle: 'General Manager (Checker)',
    twoFactorEnabled: true,
    status: 'active',
    lastLoginAt: '2026-10-26T17:00:00Z',
    createdAt: '2026-01-15T09:00:00Z',
  },
  {
    id: 'usr_04',
    name: 'Rajendra Jagtap',
    email: 'solapur.mgr@lokmangalmultistate.com',
    role: 'branch_manager',
    roleTitle: 'Branch Manager',
    branchId: 'br_solapur_main',
    branchName: 'Solapur Main',
    twoFactorEnabled: true,
    status: 'active',
    lastLoginAt: '2026-10-27T09:00:00Z',
    createdAt: '2026-02-10T11:00:00Z',
  },
  {
    id: 'usr_05',
    name: 'Pooja Kulkarni',
    email: 'editorial@lokmangalmultistate.com',
    role: 'editor',
    roleTitle: 'Content Editor',
    twoFactorEnabled: true,
    status: 'active',
    lastLoginAt: '2026-10-25T14:00:00Z',
    createdAt: '2026-03-01T09:00:00Z',
  },
];

export const UsersScreen: React.FC = () => {
  const { permissions } = useAuth();
  const { addToast } = useToast();
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: 'Staff Member',
      sortable: true,
      render: (u) => (
        <div>
          <span className="font-bold text-text-primary block">{u.name}</span>
          <span className="text-xs text-text-secondary">{u.email}</span>
        </div>
      ),
    },
    {
      key: 'roleTitle',
      header: 'Role & Scope',
      sortable: true,
      render: (u) => (
        <div>
          <span className="font-semibold text-text-primary text-xs block">{u.roleTitle}</span>
          <span className="text-[11px] text-brand-primary">
            {u.branchName ? `Branch: ${u.branchName}` : 'All Branches'}
          </span>
        </div>
      ),
    },
    {
      key: 'twoFactorEnabled',
      header: '2FA Security',
      render: (u) => (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
          <ShieldCheck className="w-3 h-3 text-status-success" />
          <span>Enforced (TOTP)</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => <StatusBadge status={u.status} />,
    },
    {
      key: 'lastLoginAt',
      header: 'Last Sign-in',
      render: (u) => (
        <span className="text-xs text-text-secondary tabular-nums">
          {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
        </span>
      ),
    },
  ];

  const handleInvite = () => {
    addToast({
      type: 'success',
      title: 'Invitation Link Generated',
      message: 'Invitation link issued. New user must complete 2FA setup within 48 hours.',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Access Governance (वापरकर्ते व अधिकार)"
        description="Staff authentication, role-based access control (RBAC), and mandatory two-factor authentication."
        actions={
          permissions.canManageUsers && (
            <button
              onClick={handleInvite}
              className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle flex items-center gap-1.5 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>Invite New Staff</span>
            </button>
          )
        }
      />

      <DataTable
        data={users}
        columns={columns}
        keyExtractor={(u) => u.id}
        searchKey={(u) => `${u.name} ${u.email} ${u.roleTitle}`}
        searchPlaceholder="Search staff by name, email or role..."
      />
    </div>
  );
};
