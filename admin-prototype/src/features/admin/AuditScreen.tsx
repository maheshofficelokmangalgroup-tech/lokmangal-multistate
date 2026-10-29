import React, { useState } from 'react';
import { ShieldAlert, ShieldCheck, Clock, User, Globe, Lock } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import type { AuditLogItem } from '../../types';

const INITIAL_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'aud_1',
    at: '2026-10-27T08:30:00Z',
    userId: 'usr_02',
    userName: 'Manoj Joshi',
    userRole: 'Finance Officer (Maker)',
    action: 'rate_set.submit_for_approval',
    entity: 'rate_set',
    entityId: 'rs_2027_28',
    ip: '192.168.1.15',
    beforeVal: { 'fd.slab_5': '9.50%' },
    afterVal: { 'fd.slab_5': '9.75%', 'fd.senior_bonus': '0.75%' },
  },
  {
    id: 'aud_2',
    at: '2026-10-27T04:00:41Z',
    userId: 'usr_01',
    userName: 'Mahesh Deshmukh',
    userRole: 'Super Admin',
    action: 'site.publish_live',
    entity: 'release',
    entityId: 'rel_214',
    ip: '103.21.120.45',
    afterVal: { buildNumber: 214, pages: 90 },
  },
  {
    id: 'aud_3',
    at: '2026-10-26T14:15:00Z',
    userId: 'usr_04',
    userName: 'Rajendra Jagtap',
    userRole: 'Branch Manager (Solapur Main)',
    action: 'branch.suggest_timings_update',
    entity: 'branch',
    entityId: 'br_solapur_main',
    ip: '192.168.10.22',
    beforeVal: { hours: '10:00 AM - 05:00 PM' },
    afterVal: { hours: '10:00 AM - 05:30 PM' },
  },
  {
    id: 'aud_4',
    at: '2026-10-26T11:00:00Z',
    userId: 'usr_01',
    userName: 'Mahesh Deshmukh',
    userRole: 'Super Admin',
    action: 'leads.export_csv',
    entity: 'enquiry',
    entityId: 'batch_export',
    ip: '103.21.120.45',
    afterVal: { exportedRows: 48, filter: 'all_branches' },
  },
];

export const AuditScreen: React.FC = () => {
  const [logs] = useState<AuditLogItem[]>(INITIAL_AUDIT_LOGS);

  const columns: Column<AuditLogItem>[] = [
    {
      key: 'at',
      header: 'Timestamp (IST)',
      sortable: true,
      render: (log) => (
        <span className="font-mono text-xs text-text-secondary">
          {new Date(log.at).toLocaleString()}
        </span>
      ),
    },
    {
      key: 'userName',
      header: 'Staff Actor',
      sortable: true,
      render: (log) => (
        <div>
          <span className="font-bold text-text-primary block text-xs">{log.userName}</span>
          <span className="text-[11px] text-text-secondary">{log.userRole}</span>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action Performed',
      sortable: true,
      render: (log) => (
        <span className="font-mono font-semibold text-xs text-brand-primary">
          {log.action}
        </span>
      ),
    },
    {
      key: 'entity',
      header: 'Entity / Target',
      render: (log) => (
        <span className="text-xs text-text-secondary font-medium">
          {log.entity} ({log.entityId})
        </span>
      ),
    },
    {
      key: 'ip',
      header: 'Origin IP',
      render: (log) => (
        <span className="font-mono text-xs text-text-secondary">{log.ip}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Immutable Audit Log (अपरिवर्तनीय ऑडिट ट्रेल)"
        description="Comprehensive audit record. Every login, rate revision, approval, export, and publication is logged with before/after snapshots. This log is read-only and cannot be altered."
        badge={
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <Lock className="w-3 h-3 text-status-success" />
            <span>Tamper-Resistant (Append-Only)</span>
          </span>
        }
      />

      <DataTable
        data={logs}
        columns={columns}
        keyExtractor={(l) => l.id}
        searchKey={(l) => `${l.userName} ${l.action} ${l.entity} ${l.ip}`}
        searchPlaceholder="Search audit events by staff name, action or IP..."
      />
    </div>
  );
};
