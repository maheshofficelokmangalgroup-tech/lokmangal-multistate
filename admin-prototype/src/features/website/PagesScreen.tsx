import React, { useState } from 'react';
import { FileText, Users, Plus, Edit3, Eye, Globe, GripVertical, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/common/PageHeader';
import { DataTable, type Column } from '../../components/common/DataTable';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Drawer } from '../../components/common/Drawer';
import { useToast } from '../../context/ToastContext';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Page {
  id: string;
  slug: string;
  titleEn: string;
  titleMr: string;
  category: 'about' | 'services' | 'legal' | 'contact' | 'faq';
  lastEditor: string;
  status: 'draft' | 'published';
  updatedAt: string;
}

interface Person {
  id: string;
  name: string;
  designation: string;
  group: 'chairman' | 'mentor' | 'board' | 'management';
  order: number;
  hasPortrait: boolean;
  status: 'draft' | 'published';
}

/* ------------------------------------------------------------------ */
/*  Seed Data                                                          */
/* ------------------------------------------------------------------ */
const SEED_PAGES: Page[] = [
  {
    id: 'pg_about',
    slug: 'about',
    titleEn: 'About Us',
    titleMr: 'आमच्याबद्दल',
    category: 'about',
    lastEditor: 'Pooja Kulkarni',
    status: 'published',
    updatedAt: '2026-10-20T09:00:00Z',
  },
  {
    id: 'pg_chairman',
    slug: 'chairman-message',
    titleEn: "Chairman's Message",
    titleMr: 'अध्यक्षांचा संदेश',
    category: 'about',
    lastEditor: 'Pooja Kulkarni',
    status: 'published',
    updatedAt: '2026-09-15T11:30:00Z',
  },
  {
    id: 'pg_social',
    slug: 'social-responsibility',
    titleEn: 'Social Responsibility',
    titleMr: 'सामाजिक जबाबदारी',
    category: 'about',
    lastEditor: 'Sunil Jadhav',
    status: 'published',
    updatedAt: '2026-08-10T14:00:00Z',
  },
  {
    id: 'pg_other_services',
    slug: 'other-services',
    titleEn: 'Other Services',
    titleMr: 'इतर सेवा',
    category: 'services',
    lastEditor: 'Mahesh Deshmukh',
    status: 'published',
    updatedAt: '2026-07-22T10:00:00Z',
  },
  {
    id: 'pg_rural',
    slug: 'rural-wealth-manager',
    titleEn: 'Rural Wealth Manager',
    titleMr: 'ग्रामीण संपत्ती व्यवस्थापक',
    category: 'services',
    lastEditor: 'Pooja Kulkarni',
    status: 'draft',
    updatedAt: '2026-10-25T16:00:00Z',
  },
  {
    id: 'pg_faq',
    slug: 'faq',
    titleEn: 'Frequently Asked Questions',
    titleMr: 'वारंवार विचारले जाणारे प्रश्न',
    category: 'faq',
    lastEditor: 'Sunil Jadhav',
    status: 'published',
    updatedAt: '2026-06-01T09:00:00Z',
  },
  {
    id: 'pg_contact',
    slug: 'contact',
    titleEn: 'Contact Us',
    titleMr: 'संपर्क करा',
    category: 'contact',
    lastEditor: 'Mahesh Deshmukh',
    status: 'published',
    updatedAt: '2026-05-15T12:00:00Z',
  },
  {
    id: 'pg_terms',
    slug: 'terms',
    titleEn: 'Terms & Conditions',
    titleMr: 'अटी व शर्ती',
    category: 'legal',
    lastEditor: 'Legal Team',
    status: 'published',
    updatedAt: '2026-04-01T09:00:00Z',
  },
  {
    id: 'pg_privacy',
    slug: 'privacy-policy',
    titleEn: 'Privacy Policy',
    titleMr: 'गोपनीयता धोरण',
    category: 'legal',
    lastEditor: 'Legal Team',
    status: 'published',
    updatedAt: '2026-04-01T09:00:00Z',
  },
];

const SEED_PEOPLE: Person[] = [
  { id: 'ppl_1', name: 'Adv. Mohanrao Kadam (अॅड. मोहनराव कदम)', designation: 'Founder & Chairman', group: 'chairman', order: 1, hasPortrait: true, status: 'published' },
  { id: 'ppl_2', name: 'Sachin Adgale (सचिन अडगळे)', designation: 'Director & Mentor', group: 'mentor', order: 1, hasPortrait: true, status: 'published' },
  { id: 'ppl_3', name: 'Vijay Deshmukh (विजय देशमुख)', designation: 'General Manager', group: 'management', order: 1, hasPortrait: true, status: 'published' },
  { id: 'ppl_4', name: 'Manoj Joshi (मनोज जोशी)', designation: 'Finance Officer', group: 'management', order: 2, hasPortrait: true, status: 'published' },
  { id: 'ppl_5', name: 'Member 1', designation: 'Board Director', group: 'board', order: 1, hasPortrait: false, status: 'draft' },
  { id: 'ppl_6', name: 'Member 2', designation: 'Board Director', group: 'board', order: 2, hasPortrait: false, status: 'draft' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export const PagesScreen: React.FC = () => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<'pages' | 'people'>('pages');
  const [pages] = useState<Page[]>(SEED_PAGES);
  const [people] = useState<Person[]>(SEED_PEOPLE);
  const [selectedPage, setSelectedPage] = useState<Page | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const tabs = [
    { id: 'pages' as const, label: 'Static Pages', icon: FileText, count: pages.length },
    { id: 'people' as const, label: 'People & Board', icon: Users, count: people.length },
  ];

  const filteredPages = categoryFilter === 'all'
    ? pages
    : pages.filter((p) => p.category === categoryFilter);

  const pageColumns: Column<Page>[] = [
    {
      key: 'titleEn',
      header: 'Page Title',
      sortable: true,
      render: (p) => (
        <div>
          <span className="font-bold text-text-primary block">{p.titleEn}</span>
          <span className="text-[11px] text-text-secondary font-marathi">{p.titleMr}</span>
        </div>
      ),
    },
    {
      key: 'slug',
      header: 'URL Slug',
      render: (p) => (
        <span className="font-mono text-[11px] text-text-secondary">/{p.slug}</span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: (p) => (
        <span className="text-xs font-medium text-text-secondary capitalize">{p.category}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusBadge status={p.status} />,
    },
    {
      key: 'lastEditor',
      header: 'Last Editor',
      render: (p) => (
        <span className="text-xs text-text-secondary">{p.lastEditor}</span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortable: true,
      render: (p) => (
        <span className="text-xs text-text-secondary tabular-nums">
          {new Date(p.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      ),
    },
  ];

  const personColumns: Column<Person>[] = [
    {
      key: 'order',
      header: '#',
      render: (p) => (
        <div className="flex items-center gap-2 text-text-secondary">
          <GripVertical className="w-3.5 h-3.5 cursor-grab" />
          <span className="text-xs tabular-nums">{p.order}</span>
        </div>
      ),
    },
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (p) => (
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
            p.hasPortrait
              ? 'bg-brand-soft text-brand-primary border border-brand/20'
              : 'bg-canvas text-text-secondary border border-border'
          }`}>
            {p.name.charAt(0)}
          </div>
          <div>
            <span className="font-bold text-text-primary block text-xs">{p.name}</span>
            <span className="text-[11px] text-text-secondary">{p.designation}</span>
          </div>
        </div>
      ),
    },
    {
      key: 'group',
      header: 'Group',
      render: (p) => {
        const labels: Record<string, string> = {
          chairman: 'Chairman & Founder',
          mentor: 'Director & Mentor',
          board: 'Board of Directors',
          management: 'Management Team',
        };
        return <span className="text-xs text-text-secondary">{labels[p.group] || p.group}</span>;
      },
    },
    {
      key: 'hasPortrait',
      header: 'Portrait',
      render: (p) => (
        <span className={`text-xs font-medium ${p.hasPortrait ? 'text-status-success' : 'text-status-warning'}`}>
          {p.hasPortrait ? '✓ Uploaded' : '⚠ Missing'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusBadge status={p.status} />,
    },
  ];

  const handleEditPage = (page: Page) => {
    setSelectedPage(page);
  };

  const handleSavePage = () => {
    addToast({
      type: 'success',
      title: 'Page Draft Saved',
      message: 'Changes saved as draft. Submit for approval to include in next release.',
    });
    setSelectedPage(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pages & People (पृष्ठे आणि व्यक्ती)"
        description="Manage static pages, FAQ and board member profiles displayed on the public website."
        actions={
          <button
            onClick={() => addToast({ type: 'info', title: 'Create Page', message: 'Page creation form will open.' })}
            className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Page</span>
          </button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-brand-primary text-brand-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
            <span className="px-1.5 py-0.5 rounded-full bg-canvas text-[10px] font-bold tabular-nums">
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Pages Tab */}
      {activeTab === 'pages' && (
        <DataTable
          data={filteredPages}
          columns={pageColumns}
          searchPlaceholder="Search pages by title or slug..."
          searchKey={(p) => `${p.titleEn} ${p.titleMr} ${p.slug}`}
          keyExtractor={(p) => p.id}
          onRowClick={handleEditPage}
          filterElement={
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 bg-canvas border border-border rounded-control text-xs font-medium"
            >
              <option value="all">All Categories</option>
              <option value="about">About</option>
              <option value="services">Services</option>
              <option value="legal">Legal</option>
              <option value="contact">Contact</option>
              <option value="faq">FAQ</option>
            </select>
          }
        />
      )}

      {/* People Tab */}
      {activeTab === 'people' && (
        <DataTable
          data={people}
          columns={personColumns}
          searchPlaceholder="Search by name or designation..."
          searchKey={(p) => `${p.name} ${p.designation}`}
          keyExtractor={(p) => p.id}
          onRowClick={(p) => setSelectedPerson(p)}
        />
      )}

      {/* Page Editor Drawer */}
      <Drawer isOpen={!!selectedPage} onClose={() => setSelectedPage(null)} title={selectedPage?.titleEn || 'Edit Page'}>
        {selectedPage && (
          <div className="space-y-5">
            {/* Language Tabs */}
            <div className="flex gap-2">
              <span className="px-3 py-1 rounded-full bg-brand-soft text-brand-primary text-[11px] font-bold border border-brand/20">
                English
              </span>
              <span className="px-3 py-1 rounded-full bg-canvas text-text-secondary text-[11px] font-bold border border-border cursor-pointer hover:bg-zinc-100">
                मराठी
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Page Title (English)</label>
                <input
                  type="text"
                  defaultValue={selectedPage.titleEn}
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">URL Slug</label>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-text-secondary font-mono">/</span>
                  <input
                    type="text"
                    defaultValue={selectedPage.slug}
                    className="flex-1 px-3 py-2.5 bg-canvas border border-border rounded-control text-sm font-mono focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                    readOnly={selectedPage.status === 'published'}
                  />
                  {selectedPage.status === 'published' && (
                    <span className="text-[10px] text-status-warning font-semibold bg-amber-50 px-2 py-1 rounded-full border border-amber-200">
                      🔒 Locked
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Content Body</label>
                <div className="border border-border rounded-control bg-canvas p-4 min-h-[200px] text-sm text-text-secondary">
                  <p className="text-xs italic">Rich text editor (TipTap) will render here with headings, paragraphs, lists, links and tables.</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <button
                onClick={handleSavePage}
                className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle transition-colors"
              >
                Save Draft
              </button>
              <button
                onClick={() => setSelectedPage(null)}
                className="px-4 py-2 rounded-control bg-canvas border border-border text-text-primary text-xs font-semibold hover:bg-zinc-100 transition-colors"
              >
                Cancel
              </button>
              <button
                className="ml-auto px-3 py-2 rounded-control text-xs font-semibold text-brand-primary hover:bg-brand-soft flex items-center gap-1.5 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Person Editor Drawer */}
      <Drawer isOpen={!!selectedPerson} onClose={() => setSelectedPerson(null)} title={selectedPerson?.name || 'Edit Person'}>
        {selectedPerson && (
          <div className="space-y-5">
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Full Name</label>
                <input
                  type="text"
                  defaultValue={selectedPerson.name}
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Designation</label>
                <input
                  type="text"
                  defaultValue={selectedPerson.designation}
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Group</label>
                <select
                  defaultValue={selectedPerson.group}
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                >
                  <option value="chairman">Chairman & Founder</option>
                  <option value="mentor">Director & Mentor</option>
                  <option value="board">Board of Directors</option>
                  <option value="management">Management Team</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Portrait Image</label>
                <div className={`border-2 border-dashed rounded-control p-6 text-center ${
                  selectedPerson.hasPortrait ? 'border-emerald-300 bg-emerald-50/30' : 'border-border bg-canvas'
                }`}>
                  <p className="text-xs text-text-secondary">
                    {selectedPerson.hasPortrait
                      ? '✓ Portrait uploaded (600 × 750 px, WebP)'
                      : 'Drop image here or click to upload (600 × 750 px recommended)'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary uppercase mb-1">Biography</label>
                <textarea
                  rows={4}
                  placeholder="Short biography for the public website..."
                  className="w-full px-3 py-2.5 bg-canvas border border-border rounded-control text-sm focus:outline-none focus:border-brand-primary focus:ring-1 focus:ring-brand-primary"
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-border">
              <button
                onClick={() => {
                  addToast({ type: 'success', title: 'Person Saved', message: `${selectedPerson.name} profile updated as draft.` });
                  setSelectedPerson(null);
                }}
                className="px-4 py-2 rounded-control bg-brand-primary text-white text-xs font-semibold hover:bg-brand-hover shadow-subtle transition-colors"
              >
                Save Draft
              </button>
              <button
                onClick={() => setSelectedPerson(null)}
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
