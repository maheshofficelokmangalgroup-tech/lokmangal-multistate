# Lokmangal Multistate — website

The new website for Lokmangal Multistate Co-operative Society Ltd. It is a fast static site built with [Astro](https://astro.build): every page is plain HTML, so it runs on any web host.

## Run it on your computer

Requires Node.js 22 or newer.

```bash
npm install
npm run dev        # http://localhost:4321 — live preview while editing
npm run build      # creates the finished website in the dist/ folder
npm run preview    # serves dist/ to check the build
```

## Updating content

You never need to touch the page designs to change information. Everything lives in `src/data/`:

| What to change | File |
| --- | --- |
| Phone, email, address, IFSC, social links, stats (branches, deposits…), election notices | `src/data/site.ts` |
| Deposit schemes, FD rate slabs, rate validity, documents list | `src/data/deposits.ts` |
| Loan products and their terms | `src/data/loans.ts` |
| Branches (name, address, phone) | `src/data/branches.ts` |
| Board of Directors, Chairman | `src/data/people.ts` |
| FAQ | `src/data/faq.ts` |
| Other services, Rural Wealth Manager | `src/data/services.ts` |
| Social responsibility initiatives | `src/data/csr.ts` |

Images live in `public/images/`, and PDFs in `public/docs/`. After any change, run `npm run build` and upload `dist/` again.

### Blog posts

`npm run import:blog` pulls posts from the old WordPress site (only the genuine "Blog" category) into `src/data/posts.json`, together with their featured images. By default it imports the title, date, image and a short summary. Run `npm run import:blog -- --full` to bring in the full text of each post as well.

## Enquiry forms

All forms post to `public/api/enquiry.php`, which emails the details to `emailus@lokmangal.co.in` (job applications go to `hr@lokmangal.in`). It needs PHP's `mail()` to work on the server, which the current host already supports. It includes spam protection: a hidden honeypot field, a time check and a per-IP rate limit. To use a different backend, change `formEndpoint` in `src/data/site.ts`. If sending fails, visitors are offered a pre-filled email and the phone number instead.

## Deploying on Render

The repo includes a `render.yaml` Blueprint:

1. Sign in at [render.com](https://render.com) with GitHub.
2. Click **New + → Blueprint**, choose this repository and click **Apply**.
3. Render runs `npm ci && npm run build` and publishes `dist/`. The site goes live at `https://lokmangal-multistate.onrender.com` (or a similar address), and every push to `main` redeploys it automatically.

Render static sites do not run PHP, so on Render the enquiry forms show visitors the "email us / call us" fallback instead of sending email. To make forms send email, host on a PHP server (see below) or point `formEndpoint` in `src/data/site.ts` to a form service.

## Deploying on your own server (PHP)

1. Run `npm run build`.
2. Upload the **contents** of `dist/` to the web root.
3. For nginx, make sure clean URLs and PHP both work:

```nginx
location / {
    try_files $uri $uri/ $uri/index.html =404;
}
error_page 404 /404.html;
location ~ ^/api/.+\.php$ {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php-fpm.sock;   # match your server
}
```

Old WordPress addresses such as `/top-banks-in-pune/` redirect automatically to their new pages (see `astro.config.mjs`), so existing Google results keep working.

**Keep the `/wp-content/uploads/2025/04/` folder** on the server when you remove WordPress. The district-wise voter-list PDFs (about 530 MB in total) are linked from there and were deliberately not copied into this project.

## Before going live — please review

- **Secure the old server before reusing it.** Content from the old WordPress site was reviewed and only genuine pages and posts were carried over. Reset all WordPress, hosting and FTP passwords, and have the server checked before reusing it.
- The page text was rewritten and cleaned up (the old copy was full of SEO phrases like "top banks in pune"). Please have someone review the wording, especially the **Chairman's Message**, **Terms of Use** and **Privacy Policy** (the old site had no real content for the last two).
- Figures come from the 2026–27 scheme leaflets: 60 branches, ₹751+ Cr deposits, ₹1195+ Cr business and rates valid until 31 March 2027. The old site still said "100+ branches" in places. Update `src/data/site.ts` and `src/data/deposits.ts` whenever rates change.
- Annual reports for 2017–18 and later were never uploaded to the old site. Add PDFs to `public/docs/` and set the `file` field in `src/pages/annual-reports.astro`.
