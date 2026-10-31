# Go-live checklist

For the person putting the full system (website, admin panel, API) on the production server. Work from top to bottom.
The commands and recovery steps are in [runbook.md](runbook.md).

## 1. Decisions and details from the society

- [ ] Branch count: the homepage says **60**, the branch directory lists **67** plus the head office. Decide which is right and correct it in the admin panel.
- [ ] Rates, the calculation policy and the validity dates are approved ([decisions/0002-calculation-policy.md](decisions/0002-calculation-policy.md)).
- [ ] A Marathi reader has checked the Marathi text, especially the FAQ (rules 66 and 67, section 80P, TDS), Terms of Use, Privacy Policy, the Chairman's message, director names and branch names.
- [ ] A legal adviser has read Terms of Use, Privacy Policy and the consent wording on the forms.
- [ ] Decide whether the 13 district voter-list PDFs may stay public. They are about 530 MB and still load from the old server's `/wp-content/uploads/2025/04/`, so they need a new home before that server is retired.
- [ ] Names of the staff who will edit, approve and publish. Approvals need two different people.
- [ ] Decide whether staff may sign in from anywhere or only from office networks.

## 2. What to buy or set up

- [ ] A new, clean Ubuntu 24.04 server in India (2 vCPU, 4 GB, 80 GB to start). **Do not reuse the old WordPress server.**
- [ ] DNS control of the domain, with A records for `@`, `www`, `admin` and `preview`.
- [ ] An email (SMTP) account for enquiry notifications and staff invitations.
- [ ] Storage for backups (any restic repository, for example S3).

## 3. Install

- [ ] Follow "First installation" in [runbook.md](runbook.md): fill in `deploy/.env` and generate the secrets with `openssl rand -base64 48`.
- [ ] Store `DATA_ENCRYPTION_KEY` and `BACKUP_PASSWORD` offline, separately. Without them, sign-in secrets and backups cannot be read.
- [ ] Push a version tag such as `v2026.11.0`. GitHub Actions builds the images.
- [ ] Start the stack, create the first Super Admin, import the starting content, and publish.

The Compose stack and Caddy have not yet been run together, so this is the first real test of them. Do it on the new server with a test domain before changing the public DNS.

## 4. Check on the new server, before changing DNS

- [ ] The website opens over HTTPS in English and Marathi, and `/release.json` shows the release.
- [ ] Send one form from each page. Each gets a reference number and appears in Leads.
- [ ] The notification email arrives. Invitation and reset emails arrive.
- [ ] Sign in, edit a loan's text, have a second person approve it, publish, and see it live.
- [ ] Upload a photo and a PDF.
- [ ] Run a backup, then restore it to a scratch database ([runbook.md](runbook.md)).
- [ ] An old address such as `/top-banks-in-pune` redirects with a 301.

## 5. Switch over

- [ ] Remove test enquiries and test accounts, if any were created on the server.
- [ ] Point the public DNS at the new server.
- [ ] Change every WordPress, hosting and FTP password, then retire the old server once the voter lists have moved.
- [ ] Submit `https://lokmangalmultistate.com/sitemap-index.xml` in Google Search Console.
- [ ] Commission an independent security test (VAPT) of the live system.
