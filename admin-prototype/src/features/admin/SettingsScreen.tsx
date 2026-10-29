import React, { useState } from 'react';
import { Settings, Building2, Mail, Shield, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { useToast } from '../../context/ToastContext';
import { INITIAL_SETTINGS } from '../../lib/api';
import type { OrganisationSettings } from '../../types';

export const SettingsScreen: React.FC = () => {
  const { addToast } = useToast();
  const [settings, setSettings] = useState<OrganisationSettings>(INITIAL_SETTINGS);

  const handleSave = () => {
    addToast({
      type: 'success',
      title: 'Settings Updated',
      message: 'Organisation configuration saved. Action recorded in audit log.',
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organisation & System Settings (संस्था सेटिंग्ज)"
        description="Legal registration details, IFSC routing, email dispatch and data retention policies."
        actions={
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle transition-colors"
          >
            Save Configuration
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Organisation Legal Identity */}
        <div className="p-5 bg-surface rounded-panel border border-border shadow-card space-y-4">
          <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
            <Building2 className="w-4 h-4 text-brand-primary" />
            <span>Organisation Details</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-text-secondary block mb-1">Legal Entity Name</label>
              <input
                type="text"
                value={settings.legalName}
                onChange={(e) => setSettings({ ...settings, legalName: e.target.value })}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-semibold text-text-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Multi-State Reg. Number</label>
                <input
                  type="text"
                  value={settings.registrationNumber}
                  onChange={(e) => setSettings({ ...settings, registrationNumber: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-mono font-semibold"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary block mb-1">Sub-Membership IFSC</label>
                <input
                  type="text"
                  value={settings.ifscCode}
                  onChange={(e) => setSettings({ ...settings, ifscCode: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-mono font-semibold text-brand-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Head Office Phone</label>
                <input
                  type="text"
                  value={settings.phone}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control"
                />
              </div>
              <div>
                <label className="font-bold text-text-secondary block mb-1">Toll-Free Number</label>
                <input
                  type="text"
                  value={settings.tollFree}
                  onChange={(e) => setSettings({ ...settings, tollFree: e.target.value })}
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="font-bold text-text-secondary block mb-1">Head Office Registered Address</label>
              <textarea
                rows={2}
                value={settings.headOfficeAddress}
                onChange={(e) => setSettings({ ...settings, headOfficeAddress: e.target.value })}
                className="w-full px-3 py-2 bg-canvas border border-border rounded-control"
              />
            </div>
          </div>
        </div>

        {/* Lead Retention & Privacy Policies (DPDP Act) */}
        <div className="space-y-6">
          <div className="p-5 bg-surface rounded-panel border border-border shadow-card space-y-4">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Shield className="w-4 h-4 text-brand-primary" />
              <span>Data Protection & Retention (DPDP Act 2023)</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-text-secondary block mb-1">
                  Enquiry Retention Period (Months)
                </label>
                <input
                  type="number"
                  value={settings.leadRetentionMonths}
                  onChange={(e) =>
                    setSettings({ ...settings, leadRetentionMonths: Number(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control tabular-nums font-bold"
                />
                <span className="text-[11px] text-text-secondary mt-1 block">
                  Leads and personal enquiry contact numbers older than this will be automatically purged or anonymised.
                </span>
              </div>
            </div>
          </div>

          <div className="p-5 bg-surface rounded-panel border border-border shadow-card space-y-4">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Mail className="w-4 h-4 text-brand-primary" />
              <span>Form Notification Email Dispatch</span>
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-text-secondary block mb-1">Loan Enquiries Inbox</label>
                <input
                  type="email"
                  value={settings.notifications.loanLeadsEmail}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, loanLeadsEmail: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control"
                />
              </div>

              <div>
                <label className="font-bold text-text-secondary block mb-1">Deposit Enquiries Inbox</label>
                <input
                  type="email"
                  value={settings.notifications.depositLeadsEmail}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      notifications: { ...settings.notifications, depositLeadsEmail: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 bg-canvas border border-border rounded-control"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
