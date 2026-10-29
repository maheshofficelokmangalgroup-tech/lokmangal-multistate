// Form definitions for each content collection. They mirror the typed schemas in
// backend/src/content/collections.rs; the server remains the authority and returns field errors.

export type Option = { value: string; label: string };

type Base = { key: string; label: string; help?: string; required?: boolean; optional?: boolean };
export type FieldSpec =
  | (Base & { type: 'text'; max?: number; lang?: 'mr'; mono?: boolean; placeholder?: string; tokens?: boolean })
  | (Base & { type: 'textarea'; max?: number; lang?: 'mr'; rows?: number; tokens?: boolean })
  | (Base & { type: 'number'; min?: number; max?: number; step?: number })
  | (Base & { type: 'boolean' })
  | (Base & { type: 'select'; options: Option[]; numeric?: boolean })
  | (Base & { type: 'link'; placeholder?: string })
  | (Base & { type: 'asset'; accept?: 'image' | 'document' })
  | (Base & { type: 'rich' })
  | (Base & { type: 'date' })
  | (Base & { type: 'rateKey'; sections?: string[] })
  | (Base & { type: 'icon' })
  | (Base & { type: 'group'; fields: FieldSpec[] })
  | (Base & { type: 'list'; of: FieldSpec[] | 'string' | 'pair'; itemTitle?: string; addLabel?: string; max?: number });

export const ICONS = [
  'percent', 'shield-check', 'calendar', 'users', 'file-text', 'zap', 'handshake', 'globe', 'smartphone', 'arrow-left-right', 'message', 'lock', 'receipt',
  'piggy-bank', 'hand-coins', 'line-chart', 'gem', 'umbrella', 'heart', 'trending-up', 'sparkles', 'briefcase', 'landmark', 'quote', 'image', 'wheat',
  'home', 'car', 'user', 'warehouse', 'store', 'map', 'coins', 'award', 'sprout', 'facebook', 'twitter', 'instagram', 'linkedin', 'youtube', 'building',
];

const labelValue: FieldSpec[] = [
  { type: 'text', key: 'label', label: 'Label', required: true, max: 40 },
  { type: 'text', key: 'value', label: 'Value', required: true, max: 120, tokens: true },
];
const benefit: FieldSpec[] = [
  { type: 'icon', key: 'icon', label: 'Icon', required: true },
  { type: 'text', key: 'title', label: 'Title', required: true, max: 60 },
  { type: 'textarea', key: 'text', label: 'Text', required: true, max: 200, rows: 2 },
];
const link: FieldSpec[] = [
  { type: 'text', key: 'label', label: 'Label', required: true, max: 40 },
  { type: 'link', key: 'href', label: 'Link', required: true },
];

export type CollectionUi = {
  fields: FieldSpec[];
  /** Data for a new item. */
  blank?: () => Record<string, unknown>;
  /** The slug comes from this field, so it is asked for on creation and locked afterwards. */
  slugField?: string;
  listColumns?: { label: string; value: (summary: Record<string, unknown>) => string }[];
  description?: string;
};

export const COLLECTION_UI: Record<string, CollectionUi> = {
  settings: {
    description: 'Organisation details shown across the website.',
    fields: [
      { type: 'group', key: '', label: 'Identity', fields: [
        { type: 'text', key: 'name', label: 'Short name', required: true, max: 80 },
        { type: 'text', key: 'legalName', label: 'Legal name', required: true, max: 160 },
        { type: 'text', key: 'nameMr', label: 'Name in Marathi', required: true, lang: 'mr' },
        { type: 'text', key: 'tagline', label: 'Tagline', required: true, max: 120 },
        { type: 'text', key: 'taglineMr', label: 'Tagline in Marathi', required: true, lang: 'mr' },
        { type: 'textarea', key: 'description', label: 'Website description (search engines)', required: true, max: 320, rows: 3 },
        { type: 'text', key: 'registration', label: 'Registration number', required: true },
        { type: 'text', key: 'act', label: 'Registered under', required: true },
        { type: 'number', key: 'founded', label: 'Year founded', required: true, min: 1900, max: 2100 },
        { type: 'number', key: 'operationsSince', label: 'Operations since', required: true, min: 1900, max: 2100 },
        { type: 'text', key: 'ifsc', label: 'IFSC', required: true, max: 11, mono: true },
      ] },
      { type: 'group', key: '', label: 'Contact', fields: [
        { type: 'text', key: 'phone', label: 'Phone (as displayed)', required: true },
        { type: 'text', key: 'phoneHref', label: 'Phone link', required: true, mono: true, help: 'For example tel:+919923203322' },
        { type: 'text', key: 'email', label: 'Email', required: true },
        { type: 'text', key: 'hrEmail', label: 'HR email', required: true },
        { type: 'group', key: 'address', label: 'Head office address', fields: [
          { type: 'text', key: 'line1', label: 'Line 1', required: true },
          { type: 'text', key: 'line2', label: 'Line 2', required: true },
          { type: 'text', key: 'city', label: 'City', required: true },
          { type: 'text', key: 'pin', label: 'PIN code', required: true, mono: true },
          { type: 'text', key: 'state', label: 'State', required: true },
        ] },
        { type: 'text', key: 'headOfficeCode', label: 'Head office branch code', required: true, mono: true },
      ] },
      { type: 'group', key: '', label: 'Links and embeds', fields: [
        { type: 'link', key: 'url', label: 'Website address', required: true },
        { type: 'text', key: 'mapEmbed', label: 'Google Maps embed link', required: true, mono: true, help: 'From Google Maps → Share → Embed a map: copy only the https://www.google.com/maps/embed?… address.' },
        { type: 'link', key: 'mapLink', label: 'Google Maps link', required: true },
        { type: 'link', key: 'appUrl', label: 'Mobile app (Play Store)', required: true },
        { type: 'text', key: 'aboutVideo', label: 'YouTube embed link', required: true, mono: true, help: 'https://www.youtube.com/embed/…' },
        { type: 'link', key: 'foundationUrl', label: 'Lokmangal Foundation website', required: true },
        { type: 'list', key: 'social', label: 'Social media', itemTitle: 'label', of: [
          { type: 'text', key: 'label', label: 'Name', required: true },
          { type: 'icon', key: 'icon', label: 'Icon', required: true },
          { type: 'link', key: 'href', label: 'Link', required: true },
        ] },
      ] },
    ],
  },
  home: {
    description: 'Statistics and the announcement bar shown on every page.',
    fields: [
      { type: 'list', key: 'stats', label: 'Statistics (exactly four)', itemTitle: 'label', max: 4, of: [
        { type: 'number', key: 'value', label: 'Number', required: true, min: 0 },
        { type: 'text', key: 'prefix', label: 'Before the number', help: 'For example ₹' },
        { type: 'text', key: 'suffix', label: 'After the number', help: 'For example + Cr' },
        { type: 'text', key: 'label', label: 'Label', required: true, max: 40 },
        { type: 'text', key: 'sub', label: 'Small print', max: 80 },
        { type: 'text', key: 'source', label: 'Source of this figure', optional: true, help: 'Required for figures that are not calculated, e.g. “2026–27 scheme leaflet”.' },
        { type: 'date', key: 'asOf', label: 'As of', optional: true },
      ] },
      { type: 'group', key: 'announcement', label: 'Announcement bar', fields: [
        { type: 'boolean', key: 'enabled', label: 'Show the announcement bar' },
        { type: 'text', key: 'label', label: 'Bold label', max: 40 },
        { type: 'text', key: 'text', label: 'Message', max: 160 },
        { type: 'link', key: 'href', label: 'Link' },
        { type: 'text', key: 'linkText', label: 'Link text', max: 40 },
      ] },
    ],
  },
  navigation: {
    description: 'Main menu and footer links. Only the structures the website supports are offered.',
    fields: [
      { type: 'list', key: 'nav', label: 'Main menu', itemTitle: 'label', max: 9, of: [
        { type: 'text', key: 'label', label: 'Label', required: true, max: 30 },
        { type: 'link', key: 'href', label: 'Link', required: true },
        { type: 'boolean', key: 'mega', label: 'Show the products mega-menu', optional: true },
        { type: 'list', key: 'children', label: 'Dropdown items', optional: true, itemTitle: 'label', of: [
          { type: 'text', key: 'label', label: 'Label', required: true, max: 40 },
          { type: 'link', key: 'href', label: 'Link', required: true },
          { type: 'text', key: 'desc', label: 'Description', optional: true, max: 60 },
          { type: 'icon', key: 'icon', label: 'Icon', optional: true },
        ] },
      ] },
      { type: 'group', key: 'footerLinks', label: 'Footer', fields: [
        { type: 'list', key: 'quick', label: 'Quick links', itemTitle: 'label', of: link },
        { type: 'list', key: 'other', label: 'Other links', itemTitle: 'label', of: link },
      ] },
    ],
  },
  people: {
    description: 'Chairman, mentor and the Board of Directors.',
    fields: [
      { type: 'group', key: 'chairman', label: 'Chairman', fields: [
        { type: 'text', key: 'name', label: 'Name', required: true },
        { type: 'text', key: 'role', label: 'Designation', required: true },
        { type: 'asset', key: 'photo', label: 'Portrait', required: true, accept: 'image' },
        { type: 'textarea', key: 'bio', label: 'Biography', optional: true, max: 2000 },
      ] },
      { type: 'group', key: 'mentor', label: 'Mentor', fields: [
        { type: 'text', key: 'name', label: 'Name', required: true },
        { type: 'text', key: 'role', label: 'Designation', required: true },
        { type: 'asset', key: 'photo', label: 'Portrait', optional: true, accept: 'image' },
      ] },
      { type: 'list', key: 'board', label: 'Board of Directors', itemTitle: 'name', addLabel: 'Add director', of: [
        { type: 'text', key: 'name', label: 'Name', required: true },
        { type: 'text', key: 'role', label: 'Designation', required: true },
        { type: 'asset', key: 'photo', label: 'Portrait', required: true, accept: 'image' },
      ] },
    ],
  },
  faq: {
    description: 'Questions and answers on the FAQ page.',
    fields: [{ type: 'list', key: 'items', label: 'Questions', itemTitle: 'q', addLabel: 'Add question', of: [
      { type: 'text', key: 'q', label: 'Question', required: true, max: 300 },
      { type: 'rich', key: 'a', label: 'Answer', required: true },
    ] }],
  },
  services: {
    description: 'Other services and the Rural Wealth Manager categories.',
    fields: [
      { type: 'list', key: 'services', label: 'Services', itemTitle: 'title', of: [
        { type: 'icon', key: 'icon', label: 'Icon', required: true },
        { type: 'text', key: 'title', label: 'Title', required: true, max: 60 },
        { type: 'asset', key: 'image', label: 'Image', optional: true, accept: 'image' },
        { type: 'textarea', key: 'text', label: 'Description', required: true, max: 400 },
      ] },
      { type: 'list', key: 'rwmCategories', label: 'Rural Wealth Manager categories', itemTitle: 'title', of: [
        { type: 'icon', key: 'icon', label: 'Icon', required: true },
        { type: 'text', key: 'title', label: 'Title', required: true },
        { type: 'text', key: 'titleMr', label: 'Title in Marathi', required: true, lang: 'mr' },
        { type: 'list', key: 'items', label: 'Items (English, Marathi)', of: 'pair' },
      ] },
    ],
  },
  csr: {
    description: 'Social responsibility pillars and initiatives.',
    fields: [
      { type: 'list', key: 'pillars', label: 'Pillars', itemTitle: 'title', of: [
        { type: 'icon', key: 'icon', label: 'Icon', required: true },
        { type: 'text', key: 'title', label: 'Title', required: true },
      ] },
      { type: 'list', key: 'initiatives', label: 'Initiatives', itemTitle: 'title', of: [
        { type: 'icon', key: 'icon', label: 'Icon', required: true },
        { type: 'text', key: 'title', label: 'Title', required: true },
        { type: 'text', key: 'stat', label: 'Highlight figure', required: true },
        { type: 'textarea', key: 'text', label: 'Description', required: true, max: 600 },
        { type: 'link', key: 'link', label: 'More information link', optional: true },
        { type: 'asset', key: 'image', label: 'Image', optional: true, accept: 'image' },
      ] },
    ],
  },
  deposit_page: {
    description: 'Documents and benefits shown on the deposits pages. Changes need approval.',
    fields: [
      { type: 'textarea', key: 'specialCategories', label: 'Who counts as a special category', required: true, max: 400 },
      { type: 'list', key: 'documents', label: 'Documents required', of: 'string' },
      { type: 'list', key: 'benefits', label: 'Benefits', itemTitle: 'title', of: benefit },
    ],
  },
  loan_page: {
    description: 'Loan benefits and extra choices in the loan enquiry form. Changes need approval.',
    fields: [
      { type: 'list', key: 'benefits', label: 'Benefits', itemTitle: 'title', of: benefit },
      { type: 'list', key: 'extraFormTypes', label: 'Extra loan types in the enquiry form', of: 'string' },
    ],
  },
  deposit_scheme: {
    slugField: 'slug',
    description: 'Rates are not typed here. Use placeholders such as {rate2:deposit.lakshadish} or {calc}; they are filled in from the approved rate set.',
    listColumns: [
      { label: 'Type', value: (s) => ({ fd: 'Fixed deposit', rd: 'Recurring deposit', monthly: 'Monthly income', double: 'Doubling' } as Record<string, string>)[String(s.kind)] ?? String(s.kind) },
      { label: 'Rate key', value: (s) => String(s.rateKey ?? '—') },
    ],
    blank: () => ({ slug: '', name: '', nameMr: '', kind: 'fd', rateNote: 'p.a.', pitch: '', intro: '', facts: [], highlight: [], features: [], eligibility: '', image: '/images/schemes/creative-fd.webp', rateKey: null, calc: { mode: 'fd', amount: 100000, months: 12, rateKey: '' }, order: 99 }),
    fields: [
      { type: 'group', key: '', label: 'Overview', fields: [
        { type: 'text', key: 'slug', label: 'Web address', required: true, mono: true, help: 'Fixed after creation, so links keep working.' },
        { type: 'text', key: 'name', label: 'Name', required: true, max: 80 },
        { type: 'text', key: 'nameMr', label: 'Name in Marathi', required: true, lang: 'mr', max: 80 },
        { type: 'select', key: 'kind', label: 'Type', required: true, options: [
          { value: 'fd', label: 'Fixed deposit' }, { value: 'rd', label: 'Recurring deposit' }, { value: 'monthly', label: 'Monthly income' }, { value: 'double', label: 'Doubling scheme' },
        ] },
        { type: 'rateKey', key: 'rateKey', label: 'Headline rate', optional: true, help: 'Leave empty only for the doubling scheme.' },
        { type: 'text', key: 'rateNote', label: 'Rate note', required: true, help: 'Shown after the rate, e.g. “p.a.”' },
        { type: 'text', key: 'pitch', label: 'Short pitch', required: true, max: 160, tokens: true },
        { type: 'textarea', key: 'intro', label: 'Introduction', required: true, max: 1200, rows: 4, tokens: true },
        { type: 'asset', key: 'image', label: 'Image', required: true, accept: 'image' },
        { type: 'text', key: 'imageAlt', label: 'Image description', optional: true },
        { type: 'boolean', key: 'featured', label: 'Feature on the homepage', optional: true },
        { type: 'number', key: 'order', label: 'Display order', required: true },
      ] },
      { type: 'list', key: 'facts', label: 'Key facts', itemTitle: 'label', max: 12, of: labelValue },
      { type: 'list', key: 'highlight', label: 'Highlights (up to three)', itemTitle: 'label', max: 3, of: labelValue },
      { type: 'list', key: 'features', label: 'Features', of: 'string' },
      { type: 'textarea', key: 'eligibility', label: 'Eligibility', required: true, max: 600, rows: 3 },
      { type: 'group', key: 'calc', label: 'Calculator example', fields: [
        { type: 'select', key: 'mode', label: 'Calculator', required: true, options: [{ value: 'fd', label: 'Fixed deposit' }, { value: 'rd', label: 'Recurring deposit' }, { value: 'monthly', label: 'Monthly income' }] },
        { type: 'number', key: 'amount', label: 'Example amount (₹)', required: true, min: 1 },
        { type: 'number', key: 'months', label: 'Tenure (months)', required: true, min: 1, max: 240 },
        { type: 'rateKey', key: 'rateKey', label: 'Rate used', required: true },
      ] },
    ],
  },
  loan: {
    slugField: 'slug',
    description: 'Interest rates use placeholders such as {rate:loan.housing}; they are filled in from the approved rate set.',
    listColumns: [{ label: 'Rate', value: (s) => String(s.rate ?? '') }],
    blank: () => ({ slug: '', name: '', icon: 'hand-coins', image: '/images/loans/personal.webp', rate: '', amount: '', summary: '', details: [], rateKey: '', showInForm: true, order: 99 }),
    fields: [
      { type: 'text', key: 'slug', label: 'Web address', required: true, mono: true, help: 'Fixed after creation.' },
      { type: 'text', key: 'name', label: 'Name', required: true, max: 80 },
      { type: 'icon', key: 'icon', label: 'Icon', required: true },
      { type: 'asset', key: 'image', label: 'Image', required: true, accept: 'image' },
      { type: 'text', key: 'rate', label: 'Rate shown on cards', required: true, tokens: true, help: 'For example {rate:loan.housing}%' },
      { type: 'rateKey', key: 'rateKey', label: 'Lowest rate (for sorting and “from” labels)', required: true, sections: ['loan'] },
      { type: 'text', key: 'amount', label: 'Loan amount', required: true },
      { type: 'textarea', key: 'summary', label: 'Summary', required: true, max: 300, rows: 2 },
      { type: 'list', key: 'details', label: 'Terms', itemTitle: 'label', of: labelValue },
      { type: 'boolean', key: 'showInForm', label: 'Show in the loan enquiry form' },
      { type: 'number', key: 'order', label: 'Display order', required: true },
    ],
  },
  branch: {
    slugField: 'code',
    description: 'Published active branches appear on the Branches page and in enquiry forms.',
    listColumns: [
      { label: 'Code', value: (s) => String(s.code ?? '') },
      { label: 'Region', value: (s) => String(s.region ?? '') },
      { label: 'Active', value: (s) => (s.active === false ? 'Inactive' : 'Active') },
    ],
    blank: () => ({ code: '', name: '', region: '', headOffice: false, address: '', phones: [''], active: true, order: 999, regionOrder: 99 }),
    fields: [
      { type: 'text', key: 'code', label: 'Branch code', required: true, mono: true, help: 'Stable identifier, e.g. BR068. Fixed after creation.' },
      { type: 'text', key: 'name', label: 'Name', required: true, max: 80 },
      { type: 'text', key: 'region', label: 'Region', required: true, help: 'Branches are grouped by region on the website.' },
      { type: 'number', key: 'regionOrder', label: 'Region order', required: true },
      { type: 'textarea', key: 'address', label: 'Address', required: true, max: 300, rows: 2 },
      { type: 'list', key: 'phones', label: 'Phone numbers', of: 'string' },
      { type: 'text', key: 'email', label: 'Email for enquiries', optional: true },
      { type: 'text', key: 'hours', label: 'Opening hours', optional: true },
      { type: 'text', key: 'manager', label: 'Branch manager', optional: true },
      { type: 'boolean', key: 'headOffice', label: 'This is the head office' },
      { type: 'boolean', key: 'active', label: 'Active (shown on the website and in forms)' },
      { type: 'number', key: 'order', label: 'Display order', required: true },
    ],
  },
  post: {
    description: 'News and blog posts.',
    listColumns: [
      { label: 'Date', value: (s) => String(s.date ?? '').slice(0, 10) },
      { label: 'Language', value: (s) => (s.language === 'mr' ? 'Marathi' : 'English') },
    ],
    blank: () => ({ id: Date.now(), slug: '', title: '', date: new Date().toISOString().slice(0, 19), image: null, excerpt: '', content: '', language: 'en', order: 0 }),
    fields: [
      { type: 'text', key: 'title', label: 'Title', required: true, max: 200 },
      { type: 'text', key: 'slug', label: 'Web address', required: true, help: 'Letters, numbers and dashes. Marathi is allowed.' },
      { type: 'date', key: 'date', label: 'Date shown on the post', required: true },
      { type: 'select', key: 'language', label: 'Language', required: true, options: [{ value: 'en', label: 'English' }, { value: 'mr', label: 'Marathi' }] },
      { type: 'asset', key: 'image', label: 'Cover image', optional: true, accept: 'image' },
      { type: 'text', key: 'imageAlt', label: 'Cover image description', optional: true },
      { type: 'textarea', key: 'excerpt', label: 'Summary', max: 400, rows: 3 },
      { type: 'rich', key: 'content', label: 'Article', optional: true },
      { type: 'text', key: 'category', label: 'Category', optional: true },
    ],
  },
  notice: {
    description: 'The pinned notice appears on the homepage and the notices page.',
    listColumns: [
      { label: 'Date', value: (s) => String(s.date ?? '') },
      { label: 'Pinned', value: (s) => (s.pinned ? 'Pinned' : '') },
    ],
    blank: () => ({ title: '', category: 'public', date: new Date().toISOString().slice(0, 10), pinned: false, items: [], order: 0 }),
    fields: [
      { type: 'text', key: 'title', label: 'Title', required: true, max: 200 },
      { type: 'select', key: 'category', label: 'Category', required: true, options: [{ value: 'election', label: 'Election' }, { value: 'agm', label: 'AGM' }, { value: 'public', label: 'Public notice' }, { value: 'other', label: 'Other' }] },
      { type: 'date', key: 'date', label: 'Notice date', required: true },
      { type: 'date', key: 'expires', label: 'Remove after', optional: true },
      { type: 'boolean', key: 'pinned', label: 'Pin (shown on the homepage)' },
      { type: 'list', key: 'items', label: 'Documents and links', itemTitle: 'label', of: [
        { type: 'text', key: 'label', label: 'Label', required: true, max: 200 },
        { type: 'link', key: 'href', label: 'File or link', required: true },
        { type: 'select', key: 'kind', label: 'Kind', required: true, options: [{ value: 'pdf', label: 'PDF' }, { value: 'page', label: 'Website page' }, { value: 'drive', label: 'Google Drive' }, { value: 'link', label: 'Other link' }] },
      ] },
      { type: 'number', key: 'order', label: 'Display order', required: true },
    ],
  },
  document: {
    description: 'Annual reports, member lists and downloadable forms.',
    listColumns: [
      { label: 'Category', value: (s) => String(s.category ?? '').replace('-', ' ') },
      { label: 'Year', value: (s) => String(s.year ?? '') },
    ],
    blank: () => ({ category: 'annual-report', title: '', year: '', cover: null, href: null, sizeMb: null, order: 99 }),
    fields: [
      { type: 'select', key: 'category', label: 'Category', required: true, options: [{ value: 'annual-report', label: 'Annual report' }, { value: 'member-list', label: 'Member list' }, { value: 'form', label: 'Downloadable form' }] },
      { type: 'text', key: 'title', label: 'Title', required: true, max: 120 },
      { type: 'text', key: 'year', label: 'Financial year', optional: true, help: 'For example 2024–25' },
      { type: 'asset', key: 'href', label: 'PDF', optional: true, accept: 'document' },
      { type: 'asset', key: 'cover', label: 'Cover image', optional: true, accept: 'image' },
      { type: 'number', key: 'sizeMb', label: 'File size (MB)', optional: true, step: 0.1 },
      { type: 'number', key: 'order', label: 'Display order', required: true },
    ],
  },
  gallery_album: {
    description: 'Photo albums.',
    listColumns: [{ label: 'Photos', value: (s) => String(s.images ?? 0) }],
    blank: () => ({ title: '', date: null, description: '', images: [], order: 99 }),
    fields: [
      { type: 'text', key: 'title', label: 'Album title', required: true, max: 120 },
      { type: 'date', key: 'date', label: 'Date', optional: true },
      { type: 'textarea', key: 'description', label: 'Description', max: 600, rows: 2 },
      { type: 'list', key: 'images', label: 'Photos', itemTitle: 'caption', addLabel: 'Add photo', of: [
        { type: 'asset', key: 'src', label: 'Photo', required: true, accept: 'image' },
        { type: 'text', key: 'caption', label: 'Caption', max: 200 },
        { type: 'text', key: 'alt', label: 'Description for screen readers', optional: true },
      ] },
      { type: 'number', key: 'order', label: 'Display order', required: true },
    ],
  },
  job_opening: {
    description: 'Open positions appear on the careers page and in the application form.',
    listColumns: [
      { label: 'Location', value: (s) => String(s.location ?? '') },
      { label: 'Open', value: (s) => (s.open ? 'Open' : 'Closed') },
    ],
    blank: () => ({ icon: 'briefcase', title: '', text: '', location: '', open: true, order: 99 }),
    fields: [
      { type: 'text', key: 'title', label: 'Position', required: true, max: 80 },
      { type: 'icon', key: 'icon', label: 'Icon', required: true },
      { type: 'textarea', key: 'text', label: 'Short description', required: true, max: 400, rows: 3 },
      { type: 'text', key: 'location', label: 'Location', max: 80 },
      { type: 'text', key: 'employmentType', label: 'Employment type', optional: true },
      { type: 'date', key: 'closingDate', label: 'Last date to apply', optional: true },
      { type: 'rich', key: 'requirements', label: 'Requirements', optional: true },
      { type: 'boolean', key: 'open', label: 'Accepting applications' },
      { type: 'number', key: 'order', label: 'Display order', required: true },
    ],
  },
  redirect: {
    description: 'Old addresses forwarded with a real HTTP redirect.',
    listColumns: [
      { label: 'To', value: (s) => String(s.to ?? '') },
      { label: 'Type', value: (s) => String(s.status ?? '') },
    ],
    blank: () => ({ from: '/', to: '/', status: 301, reason: '', order: 99 }),
    fields: [
      { type: 'text', key: 'from', label: 'Old path', required: true, mono: true, help: 'Starts with /, no query string.' },
      { type: 'link', key: 'to', label: 'New address', required: true },
      { type: 'select', key: 'status', label: 'Type', required: true, numeric: true, options: [{ value: '301', label: '301 — moved permanently' }, { value: '302', label: '302 — temporary' }] },
      { type: 'text', key: 'reason', label: 'Reason', required: true, max: 200 },
      { type: 'number', key: 'order', label: 'Order', required: true },
    ],
  },
};
