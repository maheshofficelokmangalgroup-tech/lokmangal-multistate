import React, { useState, useMemo } from 'react';
import {
  Inbox,
  Download,
  Filter,
  Phone,
  Mail,
  Calendar,
  Building,
  User,
  Clock,
  Send,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Tag,
  Shield,
  MessageSquare,
} from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { INITIAL_LEADS } from '../../lib/api';
import type { Lead, LeadStatus, LeadType } from '../../types';

export const LeadsScreen: React.FC = () => {
  const { user, permissions, branchScope } = useAuth();
  const { addToast } = useToast();

  const [leads, setLeads] = useState<Lead[]>(INITIAL_LEADS);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [activeTab, setActiveTab] = useState<LeadStatus | 'all'>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [newNoteText, setNewNoteText] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  // If user is branch manager, filter strictly to their branch
  const scopedLeads = useMemo(() => {
    if (user?.role === 'branch_manager' && user.branchId) {
      return leads.filter((l) => l.branchId === user.branchId);
    }
    return leads;
  }, [leads, user]);

  // Tab & Branch Filter
  const filteredLeads = useMemo(() => {
    return scopedLeads.filter((lead) => {
      const matchTab = activeTab === 'all' || lead.status === activeTab;
      const matchBranch = selectedBranch === 'all' || lead.branchId === selectedBranch;
      return matchTab && matchBranch;
    });
  }, [scopedLeads, activeTab, selectedBranch]);

  // Add Internal Note
  const handleAddNote = (leadId: string) => {
    if (!newNoteText.trim()) return;
    const note = {
      id: `n_${Date.now()}`,
      author: user?.name || 'Staff Member',
      note: newNoteText.trim(),
      createdAt: new Date().toISOString(),
    };

    setLeads((prev) =>
      prev.map((l) => {
        if (l.id === leadId) {
          const updated = {
            ...l,
            notes: [...(l.notes || []), note],
          };
          if (selectedLead?.id === leadId) setSelectedLead(updated);
          return updated;
        }
        return l;
      })
    );
    setNewNoteText('');
    addToast({
      type: 'success',
      title: 'Note Recorded',
      message: 'Internal note added to lead timeline.',
    });
  };

  // Status Change
  const handleStatusChange = (leadId: string, newStatus: LeadStatus) => {
    setLeads((prev) =>
      prev.map((l) => {
        if (l.id === leadId) {
          const updated = { ...l, status: newStatus };
          if (selectedLead?.id === leadId) setSelectedLead(updated);
          return updated;
        }
        return l;
      })
    );
    addToast({
      type: 'info',
      title: 'Lead Status Updated',
      message: `Lead status updated to ${newStatus.replace('_', ' ')}.`,
    });
  };

  // CSV Export with formula injection sanitization
  const handleExportCSV = () => {
    setIsExporting(true);
    try {
      const headers = ['Reference', 'Date', 'Type', 'Name', 'Phone', 'City', 'Branch', 'Status'];
      const rows = filteredLeads.map((l) => [
        `'${l.reference}`, // Prepended to neutralize formula injection
        new Date(l.createdAt).toLocaleDateString(),
        l.type,
        `"${l.name.replace(/"/g, '""')}"`,
        // Mask phone for auditor role
        permissions.canExportLeads && user?.role !== 'auditor' ? l.phone : `******${l.phone.slice(-4)}`,
        `"${(l.city || '').replace(/"/g, '""')}"`,
        `"${l.branchName.replace(/"/g, '""')}"`,
        l.status,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `lokmangal_leads_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      addToast({
        type: 'success',
        title: 'Leads Exported',
        message: `${filteredLeads.length} leads exported to CSV. Action logged to audit trail.`,
      });
    } finally {
      setIsExporting(false);
    }
  };

  const columns: Column<Lead>[] = [
    {
      key: 'reference',
      header: 'Reference',
      sortable: true,
      render: (lead) => (
        <div>
          <span className="font-mono font-bold text-xs text-brand-primary block">
            {lead.reference}
          </span>
          <span className="text-[11px] text-text-secondary">
            {new Date(lead.createdAt).toLocaleDateString()}
          </span>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Customer',
      sortable: true,
      render: (lead) => (
        <div>
          <span className="font-semibold text-text-primary block">{lead.name}</span>
          <span className="text-xs text-text-secondary tabular-nums">
            {user?.role === 'auditor' ? `******${lead.phone.slice(-4)}` : lead.phone}
          </span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Enquiry Type',
      sortable: true,
      render: (lead) => (
        <span className="capitalize px-2 py-0.5 rounded-full text-xs font-medium bg-canvas border border-border">
          {lead.type}
        </span>
      ),
    },
    {
      key: 'branchName',
      header: 'Branch',
      sortable: true,
      render: (lead) => (
        <div className="text-xs">
          <span className="font-medium text-text-primary block truncate max-w-[180px]">
            {lead.branchName}
          </span>
          {lead.city && <span className="text-text-secondary">{lead.city}</span>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (lead) => <StatusBadge status={lead.status} />,
    },
    {
      key: 'assignedTo',
      header: 'Assignee & Follow-up',
      render: (lead) => (
        <div className="text-xs">
          <span className="text-text-primary font-medium block">
            {lead.assignedTo || 'Unassigned'}
          </span>
          {lead.followUpAt && (
            <span className="text-[11px] text-amber-700 flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              <span>{new Date(lead.followUpAt).toLocaleDateString()}</span>
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (lead) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setSelectedLead(lead);
          }}
          className="text-xs font-semibold text-brand-primary hover:underline"
        >
          View Details
        </button>
      ),
    },
  ];

  const statusTabs: Array<{ id: LeadStatus | 'all'; label: string }> = [
    { id: 'all', label: 'All Leads' },
    { id: 'new', label: 'New' },
    { id: 'contacted', label: 'Contacted' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'converted', label: 'Converted' },
    { id: 'not_interested', label: 'Not Interested' },
    { id: 'spam', label: 'Spam' },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Website Enquiries & Leads"
        description="Public enquiries received from loan, deposit, and account opening forms."
        badge={
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-soft text-brand-primary border border-brand/20">
            {filteredLeads.length} Leads
          </span>
        }
        actions={
          permissions.canExportLeads && (
            <button
              onClick={handleExportCSV}
              disabled={isExporting || filteredLeads.length === 0}
              className="px-3.5 py-2 rounded-control bg-surface border border-border hover:bg-canvas text-xs font-semibold text-text-primary flex items-center gap-2 shadow-xs transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4 text-brand-primary" />
              <span>Export CSV</span>
            </button>
          )
        }
      />

      {/* Tabs Filter Bar */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto pb-px">
        {statusTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3.5 py-2 text-xs font-semibold rounded-t-control transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-b-2 border-brand-primary text-brand-primary bg-surface'
                : 'text-text-secondary hover:text-text-primary hover:bg-zinc-200/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Data Table */}
      <DataTable
        data={filteredLeads}
        columns={columns}
        keyExtractor={(lead) => lead.id}
        searchKey={(lead) => `${lead.name} ${lead.reference} ${lead.phone} ${lead.city || ''}`}
        searchPlaceholder="Search by name, reference, phone or city..."
        onRowClick={(lead) => setSelectedLead(lead)}
        filterElement={
          user?.role !== 'branch_manager' ? (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="text-xs bg-canvas border border-border rounded-control px-2.5 py-2 focus:outline-none focus:border-brand-primary"
            >
              <option value="all">All Branches</option>
              <option value="br_solapur_main">Solapur Main</option>
              <option value="br_pune_kothrud">Pune Kothrud</option>
              <option value="br_pandharpur">Pandharpur</option>
              <option value="br_latur">Latur Main</option>
              <option value="br_kolhapur">Kolhapur Shahupuri</option>
            </select>
          ) : undefined
        }
      />

      {/* Lead Detail Slide-over Drawer */}
      <Drawer
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        title={selectedLead?.reference || 'Lead Details'}
        subtitle={`Submitted on ${selectedLead ? new Date(selectedLead.createdAt).toLocaleString() : ''} via ${selectedLead?.sourcePage || 'Website'}`}
        size="lg"
        footer={
          <div className="flex items-center justify-between w-full">
            <span className="text-xs text-text-secondary">
              DPDP Consent: Recorded & Active
            </span>
            <div className="flex items-center gap-2">
              <select
                value={selectedLead?.status}
                onChange={(e) =>
                  selectedLead && handleStatusChange(selectedLead.id, e.target.value as LeadStatus)
                }
                className="text-xs font-semibold px-3 py-1.5 rounded-control border border-border bg-surface text-text-primary focus:border-brand-primary"
              >
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="in_progress">In Progress</option>
                <option value="converted">Converted</option>
                <option value="not_interested">Not Interested</option>
                <option value="spam">Spam</option>
              </select>
            </div>
          </div>
        }
      >
        {selectedLead && (
          <div className="space-y-6 text-sm">
            {/* Status & Contact Banner */}
            <div className="p-4 rounded-panel bg-canvas border border-border flex items-center justify-between">
              <div>
                <p className="text-xs uppercase font-bold text-text-secondary tracking-wider">
                  Customer
                </p>
                <p className="text-base font-bold text-text-primary mt-0.5">{selectedLead.name}</p>
                <p className="text-xs text-text-secondary tabular-nums mt-0.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-brand-primary" />
                  <span>{selectedLead.phone}</span>
                  {selectedLead.email && (
                    <>
                      <span>·</span>
                      <Mail className="w-3.5 h-3.5 text-brand-primary" />
                      <span>{selectedLead.email}</span>
                    </>
                  )}
                </p>
              </div>
              <StatusBadge status={selectedLead.status} size="md" />
            </div>

            {/* Form Fields Details */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2.5">
                Enquiry Details
              </h4>
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-control bg-canvas border border-border text-xs">
                <div>
                  <span className="text-text-secondary block">Assigned Branch:</span>
                  <span className="font-semibold text-text-primary">{selectedLead.branchName}</span>
                </div>
                <div>
                  <span className="text-text-secondary block">City / Town:</span>
                  <span className="font-semibold text-text-primary">{selectedLead.city || 'N/A'}</span>
                </div>
                {Object.entries(selectedLead.details || {}).map(([key, val]) => (
                  <div key={key}>
                    <span className="text-text-secondary capitalize block">
                      {key.replace(/([A-Z])/g, ' $1')}:
                    </span>
                    <span className="font-semibold text-text-primary">{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes & Activity Timeline */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2.5 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-brand-primary" />
                <span>Internal Notes & Follow-ups</span>
              </h4>

              <div className="space-y-2 mb-3">
                {selectedLead.notes && selectedLead.notes.length > 0 ? (
                  selectedLead.notes.map((note) => (
                    <div
                      key={note.id}
                      className="p-3 rounded-control bg-canvas border border-border/80 text-xs"
                    >
                      <div className="flex items-center justify-between font-semibold text-text-primary mb-1">
                        <span>{note.author}</span>
                        <span className="text-[11px] text-text-secondary font-normal">
                          {new Date(note.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-text-secondary">{note.note}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-text-secondary italic">No notes recorded yet.</p>
                )}
              </div>

              {/* Add Note Form */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddNote(selectedLead.id)}
                  placeholder="Add private staff note (e.g. called customer, requested KYC docs)..."
                  className="flex-1 px-3 py-2 text-xs bg-canvas border border-border rounded-control focus:outline-none focus:border-brand-primary"
                />
                <button
                  type="button"
                  onClick={() => handleAddNote(selectedLead.id)}
                  className="px-3.5 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-xs transition-colors"
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
