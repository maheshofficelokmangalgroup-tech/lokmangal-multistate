import React, { useState } from 'react';
import { Globe, Link2, ArrowRightLeft, Search, AlertTriangle, Plus, ChevronRight, GripVertical, ExternalLink, Eye, BarChart3 } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { useToast } from '../../context/ToastContext';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface NavMenuItem {
  id: string;
  label: string;
  labelMr?: string;
  target: string;
  parent?: string;
  order: number;
  isExternal: boolean;
  isEnabled: boolean;
}

interface FooterLink {
  id: string;
  section: 'quick_links' | 'products' | 'legal' | 'social';
  label: string;
  url: string;
  order: number;
}

interface Redirect {
  id: string;
  source: string;
  destination: string;
  statusCode: 301 | 302;
  reason: string;
  isActive: boolean;
  hitCount: number;
}

interface SeoOverride {
  id: string;
  pagePath: string;
  title: string;
  description: string;
  noIndex: boolean;
}

/* ------------------------------------------------------------------ */
/*  Seed Data                                                          */
/* ------------------------------------------------------------------ */
const SEED_NAV: NavMenuItem[] = [
  { id: 'nav_1', label: 'Home', labelMr: 'मुख्यपृष्ठ', target: '/', order: 1, isExternal: false, isEnabled: true },
  { id: 'nav_2', label: 'About Us', labelMr: 'आमच्याबद्दल', target: '/about', order: 2, isExternal: false, isEnabled: true },
  { id: 'nav_3', label: "Chairman's Message", target: '/chairman-message', parent: 'nav_2', order: 1, isExternal: false, isEnabled: true },
  { id: 'nav_4', label: 'Social Responsibility', target: '/social-responsibility', parent: 'nav_2', order: 2, isExternal: false, isEnabled: true },
  { id: 'nav_5', label: 'Deposits', labelMr: 'ठेवी', target: '/deposits', order: 3, isExternal: false, isEnabled: true },
  { id: 'nav_6', label: 'Loans', labelMr: 'कर्ज', target: '/loans', order: 4, isExternal: false, isEnabled: true },
  { id: 'nav_7', label: 'Interest Rates', labelMr: 'व्याजदर', target: '/interest-rates', order: 5, isExternal: false, isEnabled: true },
  { id: 'nav_8', label: 'Branches', labelMr: 'शाखा', target: '/branches', order: 6, isExternal: false, isEnabled: true },
  { id: 'nav_9', label: 'News', labelMr: 'बातम्या', target: '/news', order: 7, isExternal: false, isEnabled: true },
  { id: 'nav_10', label: 'Gallery', labelMr: 'गॅलरी', target: '/gallery', order: 8, isExternal: false, isEnabled: true },
  { id: 'nav_11', label: 'Contact', labelMr: 'संपर्क', target: '/contact', order: 9, isExternal: false, isEnabled: true },
  { id: 'nav_12', label: 'Careers', labelMr: 'भरती', target: '/careers', order: 10, isExternal: false, isEnabled: true },
];

const SEED_REDIRECTS: Redirect[] = [
  { id: 'rd_1', source: '/old-home', destination: '/', statusCode: 301, reason: 'Legacy homepage', isActive: true, hitCount: 145 },
  { id: 'rd_2', source: '/fd-rates', destination: '/interest-rates', statusCode: 301, reason: 'Old FD rates page', isActive: true, hitCount: 89 },
  { id: 'rd_3', source: '/apply-for-loan', destination: '/apply-loan', statusCode: 301, reason: 'URL standardization', isActive: true, hitCount: 56 },
  { id: 'rd_4', source: '/annual-reports', destination: '/notices', statusCode: 301, reason: 'Content consolidated', isActive: true, hitCount: 34 },
  { id: 'rd_5', source: '/wp-admin', destination: '/', statusCode: 301, reason: 'WordPress cleanup', isActive: true, hitCount: 212 },
  { id: 'rd_6', source: '/wp-login.php', destination: '/', statusCode: 301, reason: 'WordPress cleanup', isActive: true, hitCount: 478 },
];

const SEED_SEO: SeoOverride[] = [
  { id: 'seo_1', pagePath: '/', title: 'Lokmangal Multistate Co-operative Society — Trusted Banking Since 2001', description: 'लोकमंगल मल्टीस्टेट — Deposits, Loans, Gold Loans & more with 60+ branches across Maharashtra.', noIndex: false },
  { id: 'seo_2', pagePath: '/interest-rates', title: 'Interest Rates 2026–27 | Lokmangal Multistate', description: 'Current FD, RD, Loan interest rates for FY 2026–27. Senior citizen benefits available.', noIndex: false },
  { id: 'seo_3', pagePath: '/deposits', title: 'Deposit Schemes | Lokmangal Multistate', description: 'Lakshadish, Vishwamangal FD, Daam Duppat and more deposit schemes with attractive interest rates.', noIndex: false },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export const NavigationScreen: React.FC = () => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'navigation' | 'footer' | 'seo' | 'redirects'>('navigation');
  const [navItems] = useState<NavMenuItem[]>(SEED_NAV);
  const [redirects] = useState<Redirect[]>(SEED_REDIRECTS);
  const [seoOverrides] = useState<SeoOverride[]>(SEED_SEO);
  const [selectedRedirect, setSelectedRedirect] = useState<Redirect | null>(null);
  const [selectedSeo, setSelectedSeo] = useState<SeoOverride | null>(null);

  const tabs = [
    { id: 'navigation' as const, label: 'Header Navigation', icon: Globe, count: navItems.filter(n => !n.parent).length },
    { id: 'footer' as const, label: 'Footer Links', icon: Link2, count: 0 },
    { id: 'seo' as const, label: 'SEO Overrides', icon: Search, count: seoOverrides.length },
    { id: 'redirects' as const, label: 'Redirects', icon: ArrowRightLeft, count: redirects.length },
  ];

  const topLevelNav = navItems.filter((n) => !n.parent);

  const redirectColumns: Column<Redirect>[] = [
    {
      key: 'source',
      header: 'Source Path',
      sortable: true,
      render: (r) => <span className="font-mono text-xs text-text-primary">{r.source}</span>,
    },
    {
      key: 'destination',
      header: 'Destination',
      render: (r) => <span className="font-mono text-xs text-text-secondary">{r.destination}</span>,
    },
    {
      key: 'statusCode',
      header: 'Type',
      render: (r) => (
        <span className={`text-xs font-bold tabular-nums ${r.statusCode === 301 ? 'text-status-success' : 'text-status-warning'}`}>
          {r.statusCode}
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r) => <span className="text-xs text-text-secondary">{r.reason}</span>,
    },
    {
      key: 'hitCount',
      header: 'Hits',
      sortable: true,
      render: (r) => <span className="text-xs font-bold tabular-nums text-text-secondary">{r.hitCount}</span>,
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (r) => <StatusBadge status={r.isActive ? 'live' : 'draft'} />,
    },
  ];

  const seoColumns: Column<SeoOverride>[] = [
    {
      key: 'pagePath',
      header: 'Page Path',
      sortable: true,
      render: (s) => <span className="font-mono text-xs text-text-primary">{s.pagePath}</span>,
    },
    {
      key: 'title',
      header: 'Meta Title',
      render: (s) => <span className="text-xs text-text-primary line-clamp-1">{s.title}</span>,
    },
    {
      key: 'description',
      header: 'Meta Description',
      render: (s) => <span className="text-xs text-text-secondary line-clamp-1">{s.description}</span>,
    },
    {
      key: 'noIndex',
      header: 'Index',
      render: (s) => (
        <span className={`text-xs font-medium ${s.noIndex ? 'text-status-destructive' : 'text-status-success'}`}>
          {s.noIndex ? 'No Index' : 'Indexed'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Navigation, SEO & Redirects"
        description="Manage header/footer navigation, SEO meta tags and URL redirects. Changes take effect after publishing."
        actions={
          <button
            onClick={() => addToast({ type: 'info', title: 'Preview Navigation', message: 'Navigation preview will open in a new tab.' })}
            className="px-4 py-2 rounded-control bg-canvas border border-border text-text-primary text-xs font-semibold hover:bg-zinc-100 shadow-subtle flex items-center gap-2 transition-colors"
          >
            <Eye className="w-4 h-4" />
            <span>Preview</span>
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
            {tab.count > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-canvas text-[10px] font-bold tabular-nums">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Navigation Tab */}
      {activeTab === 'navigation' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Menu Editor */}
          <div className="lg:col-span-3 bg-surface border border-border rounded-panel p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-text-primary">Header Menu Items</h3>
              <button className="px-3 py-1.5 rounded-control bg-brand-primary text-white text-[11px] font-semibold hover:bg-brand-hover flex items-center gap-1.5 transition-colors">
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-1.5">
              {topLevelNav.map((item) => {
                const children = navItems.filter((n) => n.parent === item.id);
                return (
                  <div key={item.id}>
                    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-control border transition-colors ${
                      item.isEnabled ? 'border-border bg-canvas/50 hover:bg-canvas' : 'border-border/50 bg-zinc-50 opacity-60'
                    }`}>
                      <GripVertical className="w-4 h-4 text-text-secondary/40 cursor-grab flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-text-primary">{item.label}</span>
                          {item.labelMr && (
                            <span className="text-[11px] text-text-secondary font-marathi">({item.labelMr})</span>
                          )}
                          {item.isExternal && <ExternalLink className="w-3 h-3 text-text-secondary" />}
                        </div>
                        <span className="text-[11px] text-text-secondary font-mono">{item.target}</span>
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.isEnabled}
                          readOnly
                          className="rounded border-border text-brand-primary focus:ring-brand-primary w-3.5 h-3.5"
                        />
                        <span className="text-[10px] text-text-secondary font-medium">Active</span>
                      </label>
                    </div>
                    {/* Children */}
                    {children.length > 0 && (
                      <div className="ml-8 mt-1 space-y-1">
                        {children.map((child) => (
                          <div
                            key={child.id}
                            className="flex items-center gap-3 px-3 py-2 rounded-control border border-border/60 bg-white hover:bg-canvas/50 transition-colors"
                          >
                            <GripVertical className="w-3.5 h-3.5 text-text-secondary/30 cursor-grab flex-shrink-0" />
                            <ChevronRight className="w-3 h-3 text-text-secondary/40" />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-medium text-text-primary">{child.label}</span>
                              <span className="text-[11px] text-text-secondary font-mono ml-2">{child.target}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-border">
              <button
                onClick={() => addToast({ type: 'success', title: 'Navigation Saved', message: 'Menu structure saved as draft.' })}
                className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle transition-colors"
              >
                Save Changes
              </button>
            </div>
          </div>

          {/* Navigation Preview */}
          <div className="lg:col-span-2 bg-surface border border-border rounded-panel p-5 space-y-4">
            <h3 className="text-sm font-bold text-text-primary">Desktop Preview</h3>
            <div className="border border-border rounded-control bg-white p-4">
              {/* Simulated navbar */}
              <div className="flex items-center gap-1 flex-wrap">
                <div className="w-8 h-8 bg-brand-primary rounded text-white flex items-center justify-center text-[10px] font-bold mr-2">LM</div>
                {topLevelNav.filter(n => n.isEnabled).map((item) => (
                  <span key={item.id} className="px-2.5 py-1.5 text-[11px] font-medium text-text-primary hover:text-brand-primary cursor-default">
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="border border-border rounded-control bg-white p-4">
              <h4 className="text-[11px] font-bold text-text-secondary uppercase mb-2">Mobile Preview</h4>
              <div className="space-y-0.5">
                {topLevelNav.filter(n => n.isEnabled).map((item) => (
                  <div key={item.id} className="px-3 py-2 text-xs text-text-primary bg-canvas rounded-control">
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer Tab */}
      {activeTab === 'footer' && (
        <div className="bg-surface border border-border rounded-panel p-6 text-center py-16">
          <Globe className="w-8 h-8 text-text-secondary/40 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-text-primary">Footer Links Management</h3>
          <p className="text-xs text-text-secondary mt-1 max-w-sm mx-auto">
            Manage quick links, product links, legal pages and social media URLs displayed in the website footer.
          </p>
          <button
            onClick={() => addToast({ type: 'info', title: 'Footer Editor', message: 'Footer section editor opening...' })}
            className="mt-4 px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle transition-colors"
          >
            Edit Footer Sections
          </button>
        </div>
      )}

      {/* SEO Tab */}
      {activeTab === 'seo' && (
        <div className="space-y-4">
          {/* Site Defaults Card */}
          <div className="bg-surface border border-border rounded-panel p-5 space-y-3">
            <h3 className="text-sm font-bold text-text-primary">Site-Wide Defaults</h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Default Title Suffix</label>
                <input
                  type="text"
                  defaultValue="| Lokmangal Multistate Co-operative Society"
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Default Share Image</label>
                <div className="px-3 py-2.5 bg-canvas border border-border rounded-control text-xs text-text-secondary">
                  og-default.jpg (1200 × 630)
                </div>
              </div>
            </div>
          </div>

          {/* Page Overrides Table */}
          <DataTable
            data={seoOverrides}
            columns={seoColumns}
            searchPlaceholder="Search page paths..."
            searchKey={(s) => `${s.pagePath} ${s.title}`}
            keyExtractor={(s) => s.id}
            onRowClick={(s) => setSelectedSeo(s)}
          />
        </div>
      )}

      {/* Redirects Tab */}
      {activeTab === 'redirects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-xs text-text-secondary">
                {redirects.length} active redirects
              </span>
              <span className="text-xs text-text-secondary flex items-center gap-1">
                <BarChart3 className="w-3.5 h-3.5" />
                {redirects.reduce((sum, r) => sum + r.hitCount, 0)} total hits
              </span>
            </div>
            <button
              onClick={() => addToast({ type: 'info', title: 'Add Redirect', message: 'New redirect rule form opened.' })}
              className="px-3 py-1.5 rounded-control bg-brand-primary text-white text-[11px] font-semibold hover:bg-brand-hover flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Redirect</span>
            </button>
          </div>

          <DataTable
            data={redirects}
            columns={redirectColumns}
            searchPlaceholder="Search source or destination..."
            searchKey={(r) => `${r.source} ${r.destination} ${r.reason}`}
            keyExtractor={(r) => r.id}
            onRowClick={(r) => setSelectedRedirect(r)}
          />
        </div>
      )}

      {/* Redirect Editor Drawer */}
      <Drawer
        isOpen={!!selectedRedirect}
        onClose={() => setSelectedRedirect(null)}
        title="Edit Redirect Rule"
      >
        {selectedRedirect && (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Source Path</label>
              <input
                type="text"
                defaultValue={selectedRedirect.source}
                className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm font-mono focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Destination</label>
              <input
                type="text"
                defaultValue={selectedRedirect.destination}
                className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm font-mono focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Status Code</label>
                <select
                  defaultValue={selectedRedirect.statusCode}
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                >
                  <option value={301}>301 — Permanent</option>
                  <option value={302}>302 — Temporary</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Hit Count</label>
                <div className="px-3 py-2.5 bg-canvas border border-border rounded-control text-sm text-text-secondary tabular-nums">
                  {selectedRedirect.hitCount}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Reason</label>
              <input
                type="text"
                defaultValue={selectedRedirect.reason}
                className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
              />
            </div>
            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <button
                onClick={() => {
                  addToast({ type: 'success', title: 'Redirect Saved', message: 'Redirect rule updated.' });
                  setSelectedRedirect(null);
                }}
                className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setSelectedRedirect(null)}
                className="px-4 py-2 rounded-control bg-canvas border border-border text-text-primary text-xs font-semibold hover:bg-zinc-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* SEO Editor Drawer */}
      <Drawer
        isOpen={!!selectedSeo}
        onClose={() => setSelectedSeo(null)}
        title="Edit SEO Metadata"
      >
        {selectedSeo && (
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Page Path</label>
              <div className="px-3 py-2.5 bg-canvas border border-border rounded-control text-sm font-mono text-text-secondary">
                {selectedSeo.pagePath}
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Title Tag</label>
              <input
                type="text"
                defaultValue={selectedSeo.title}
                className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
              />
              <p className="text-[10px] text-text-secondary mt-1 tabular-nums">{selectedSeo.title.length}/60 characters</p>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Meta Description</label>
              <textarea
                rows={3}
                defaultValue={selectedSeo.description}
                className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
              />
              <p className="text-[10px] text-text-secondary mt-1 tabular-nums">{selectedSeo.description.length}/160 characters</p>
            </div>

            {/* Google Preview */}
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-2">Search Preview</label>
              <div className="p-4 bg-canvas border border-border rounded-control space-y-1">
                <p className="text-[13px] text-blue-700 truncate font-medium">{selectedSeo.title}</p>
                <p className="text-[11px] text-emerald-800 font-mono">lokmangalmultistate.com{selectedSeo.pagePath}</p>
                <p className="text-xs text-text-secondary line-clamp-2">{selectedSeo.description}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <button
                onClick={() => {
                  addToast({ type: 'success', title: 'SEO Updated', message: `Meta tags for ${selectedSeo.pagePath} saved.` });
                  setSelectedSeo(null);
                }}
                className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setSelectedSeo(null)}
                className="px-4 py-2 rounded-control bg-canvas border border-border text-text-primary text-xs font-semibold hover:bg-zinc-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
