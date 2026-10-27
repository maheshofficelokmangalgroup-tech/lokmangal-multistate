// Central place for organisation details. Update numbers, contacts and links here —
// every page reads from this file.

export const site = {
  name: 'Lokmangal Multistate',
  legalName: 'Lokmangal Multistate Co-operative Society Ltd.',
  nameMr: 'लोकमंगल मल्टीस्टेट',
  tagline: 'Success Through Total Dedication',
  taglineMr: 'अखंड गतीतून सार्थकता',
  url: 'https://lokmangalmultistate.com',
  description:
    'Lokmangal Multistate Co-operative Society Ltd., Solapur — savings, fixed & recurring deposits up to 10% p.a., agriculture, housing, vehicle and business loans through 60 branches across Maharashtra & Karnataka.',
  registration: 'MSCS/CR.216/2004',
  act: 'Multi-State Co-operative Societies Act, 2002',
  founded: 2004,
  operationsSince: 2008,
  ifsc: 'ICIC0000104',
  phone: '+91 99232 03322',
  phoneHref: 'tel:+919923203322',
  email: 'emailus@lokmangal.co.in',
  hrEmail: 'hr@lokmangal.in',
  address: {
    line1: 'Plot No. 94, Mitra Nagar',
    line2: 'Near Rabbi Research Center, Shelgi',
    city: 'Solapur',
    pin: '413002',
    state: 'Maharashtra',
  },
  mapEmbed:
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3801.1439486273434!2d75.92524566419183!3d17.690658748645436!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bc5daed8b2f1d45%3A0xe1a59e54246a2bac!2sLokmanagal+Multistate!5e0!3m2!1sen!2sin!4v1563183952766!5m2!1sen!2sin',
  mapLink: 'https://www.google.com/maps/search/?api=1&query=Lokmangal+Multistate+Shelgi+Solapur',
  appUrl: 'https://play.google.com/store/apps/details?id=com.vgipl.lokmangalmobilebankingapp258596',
  aboutVideo: 'https://www.youtube.com/embed/M0NGS7ZUNYY',
  foundationUrl: 'http://lokmangalfoundation.com/',
  // Where enquiry forms are POSTed. public/api/enquiry.php works on any PHP host.
  formEndpoint: '/api/enquiry.php',
  ratesValidity: '1 April 2026 – 31 March 2027',
  social: [
    { label: 'Facebook', icon: 'facebook', href: 'https://www.facebook.com/LMCSOfficial/' },
    { label: 'Twitter', icon: 'twitter', href: 'https://twitter.com/LMCSOfficial' },
    { label: 'Instagram', icon: 'instagram', href: 'https://www.instagram.com/LMCSOfficial/' },
    { label: 'LinkedIn', icon: 'linkedin', href: 'https://www.linkedin.com/company/lmcsofficial/' },
  ],
};

// Figures from the society's 2026–27 scheme communication.
export const stats = [
  { value: 60, prefix: '', suffix: '', label: 'Branches', sub: 'across Maharashtra & Karnataka' },
  { value: 751, prefix: '₹', suffix: '+ Cr', label: 'Total deposits', sub: 'entrusted by our members' },
  { value: 1195, prefix: '₹', suffix: '+ Cr', label: 'Total business', sub: 'and growing every year' },
  { value: 6, prefix: '', suffix: ' Lakh+', label: 'Happy members', sub: 'part of the Lokmangal family' },
];

export type NavChild = { label: string; href: string; desc?: string; icon?: string };
export type NavItem = { label: string; href: string; children?: NavChild[]; mega?: boolean };

export const nav: NavItem[] = [
  { label: 'Home', href: '/' },
  {
    label: 'About Us',
    href: '/about-us/',
    children: [
      { label: 'About Lokmangal', href: '/about-us/', desc: 'Our journey since 2004', icon: 'landmark' },
      { label: "Chairman's Message", href: '/chairman-message/', desc: 'A word from our chairman', icon: 'quote' },
      { label: 'Board of Directors', href: '/board-of-directors/', desc: 'The people who lead us', icon: 'users' },
      { label: 'Social Responsibility', href: '/social-responsibility/', desc: 'Lokmangal Foundation initiatives', icon: 'heart' },
      { label: 'Annual Reports', href: '/annual-reports/', desc: 'Performance & disclosures', icon: 'file-text' },
      { label: 'Photo Gallery', href: '/gallery/', desc: 'Moments from our journey', icon: 'image' },
    ],
  },
  { label: 'Our Products', href: '/deposits/', mega: true },
  { label: 'Other Services', href: '/other-services/' },
  { label: 'Rural Wealth Manager', href: '/rural-wealth-manager/' },
  { label: 'FAQ', href: '/faq/' },
  { label: 'Branches', href: '/branches/' },
];

export const footerLinks = {
  quick: [
    { label: 'Home', href: '/' },
    { label: 'About Us', href: '/about-us/' },
    { label: 'Fixed Deposits', href: '/deposits/' },
    { label: 'Loans', href: '/loans/' },
    { label: 'Interest Rates', href: '/interest-rates/' },
    { label: 'FAQ', href: '/faq/' },
    { label: 'Our Branches', href: '/branches/' },
  ],
  other: [
    { label: 'Contact Us', href: '/contact-us/' },
    { label: 'Blog', href: '/blog/' },
    { label: 'Careers', href: '/careers/' },
    { label: 'Notices', href: '/notices/' },
    { label: 'Calculators', href: '/calculators/' },
    { label: 'Terms of Use', href: '/terms-of-use/' },
    { label: 'Privacy Policy', href: '/privacy-policy/' },
    { label: 'Sitemap', href: '/sitemap/' },
  ],
};

export const notices = {
  title: 'Board of Directors & Office Bearers Election 2025',
  items: [
    { label: 'Board of Directors & Office Bearers Election 2025 — Programme', href: '/docs/election-2025-programme.pdf', kind: 'pdf' },
    { label: 'Provisional List of Members / Delegates Eligible to Vote', href: '/list-of-members/', kind: 'page' },
    { label: 'Final List of Members / Delegates Eligible to Vote', href: 'https://drive.google.com/file/d/16sGKu0z6eZ56rZlJmiRT-sOvVFAKL20-/view?usp=drive_link', kind: 'drive' },
    { label: 'Final List of Members — Dharashiv District', href: 'https://drive.google.com/file/d/1JtRnQ2VRJaHbzqJTJT_6QL1h6MBYf-Px/view?usp=drive_link', kind: 'drive' },
    { label: 'List of Total Nominations Received by RO', href: '/docs/total-nominations-received-2025.pdf', kind: 'pdf' },
    { label: 'List of Valid Nominations — Board of Directors', href: '/docs/valid-nominations-2025.pdf', kind: 'pdf' },
    { label: 'Final List of Contesting Candidates', href: '/docs/final-contesting-candidates-2025.pdf', kind: 'pdf' },
    { label: 'Approval of Election Result — Board of Directors (29.05.2025)', href: '/docs/approval-of-election-result-2025.pdf', kind: 'pdf' },
    { label: 'RR-17 Meeting Agenda (30.05.2025)', href: '/docs/rr-17-meeting-agenda-2025.pdf', kind: 'pdf' },
    { label: 'Election Programme of Office Bearers', href: '/docs/office-bearers-election-programme-2025.pdf', kind: 'pdf' },
  ],
};

// Provisional voter lists are large scanned PDFs, so they stay on the existing uploads folder.
const UPLOADS = 'https://lokmangalmultistate.com/wp-content/uploads/2025/04/';
export const memberLists = [
  ['Solapur', 'SOLAPUR.pdf', 41], ['Pune', 'PUNE.pdf', 76], ['Ratnagiri', 'RATNAGIRI.pdf', 8],
  ['Shelgi', 'SHELGI.pdf', 13], ['Latur', 'LATUR.pdf', 88], ['Nanded', 'NANDED.pdf', 22],
  ['Parbhani', 'PARBHANI.pdf', 14], ['Kolhapur', 'KOLHAPUR.pdf', 52], ['Dharashiv', 'DHARASHIV.pdf', 127],
  ['Hingoli', 'HINGOLI.pdf', 28], ['Belgaon', 'BELGAON.pdf', 26], ['Bidar', 'BIDAR.pdf', 5], ['Beed', 'BEED.pdf', 31],
].map(([district, file, mb]) => ({ district: district as string, href: UPLOADS + file, sizeMb: mb as number }));

export const gallery = [
  { src: '/images/gallery/gallery-01.webp', caption: 'Lokmangal moments, 2017–18' },
  { src: '/images/gallery/gallery-02.webp', caption: 'Lokmangal moments, 2017–18' },
  { src: '/images/gallery/gallery-03.webp', caption: 'Lokmangal moments, 2017–18' },
  { src: '/images/gallery/gallery-04.webp', caption: 'Lokmangal moments, 2017–18' },
  { src: '/images/gallery/gallery-05.webp', caption: 'Lokmangal moments, 2016–17' },
  { src: '/images/gallery/gallery-06.webp', caption: 'Independence Day, 15 August 2016' },
  { src: '/images/gallery/gallery-07.webp', caption: 'Yashwant Raut felicitation' },
  { src: '/images/gallery/gallery-08.webp', caption: 'Swachhata Abhiyan' },
  { src: '/images/gallery/gallery-09.webp', caption: 'SUS function, 2013' },
  { src: '/images/gallery/gallery-10.webp', caption: 'Chhatrapati Shivaji Maharaj statue' },
  { src: '/images/gallery/gallery-11.webp', caption: 'Lokmangal moments' },
  { src: '/images/gallery/gallery-12.webp', caption: 'Lokmangal moments' },
];
