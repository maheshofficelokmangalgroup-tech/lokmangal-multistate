# Admin guide

For staff who use the admin panel. No technical knowledge is needed. Screens you cannot use are hidden from your menu, so what you see depends on your role.

## Signing in

1. Open the admin address and enter your email and password.
2. Enter the 6-digit code from Google Authenticator or Microsoft Authenticator. Two-step sign-in is required for everyone.
3. **First time:** the invitation email link lets you choose a password (at least 12 characters; a short sentence works well), then shows a QR code to scan in the authenticator app. Save the **10 recovery codes** it shows: each works once if you lose your phone, and they are shown only once.

You are signed out after 30 minutes without activity (a warning appears two minutes before) and after 12 hours at most. **Account menu → Security and sessions** lists where you are signed in and lets you sign out other devices or change your password. Forgot the password? Use *Forgot your password?* on the sign-in page; the email link works for 30 minutes.

## The idea behind everything

- **Save draft** only saves. The website does not change.
- Content that involves money (rates, deposit schemes, loans, the deposit and loan page details) must be **approved by a different person** before it can be published.
- **Publish** (Publish center) builds the whole site from approved content and switches visitors to it once every check passes.
- You can **Preview** drafts privately first, and an earlier release can be restored.

## Everyday jobs

### Handling an enquiry (Leads)
Website forms arrive in **Leads** with a reference such as `LMS-2026-00123`. Tabs show *New*, *Contacted*, *In progress*, *Converted*, *Not interested* and *Spam*. Open one to see the details, add notes, set a **follow-up** (IST) and assign a branch or a person. Changing the status of a closed enquiry asks for a reason. A phone number seen twice within 30 days is marked *Possible duplicate*; nothing is merged or rejected automatically.

Branch managers see only their own branches' enquiries. Some roles see phone numbers and emails partly hidden (`+91 98xxxxx210`). **Export** (if your role allows it) downloads the filtered list as Excel or CSV, and every export is recorded.

### Changing interest rates (Interest rates)
1. **Prepare next rate set**: it starts as a copy of the current one. Choose the name and dates. *Valid until* is exclusive: `2028-04-01` means the rates apply up to 31 March 2028.
2. Change the rates that move. Cells you changed are marked, and the side panel lists every change against the previous set. The page warns about gaps or overlaps in the FD tenure bands.
3. Fill in the **source document** (for example the approved leaflet) and the **reason**, then **Submit for approval**.
4. An approver reviews exactly what changed under **Approvals** and approves or sends it back with a comment. You cannot approve your own work.
5. Once approved, a rate set that starts in the future is built automatically and **goes live at 00:00 IST on its first day**. A rate set that starts today is included in your next publish.

To correct approved rates, use **Create new revision**; the approved one is never edited.

### Deposit schemes and loans
Edit them like any content (New, Save draft, Submit for approval). **Rates are never typed here.** The *Headline rate* field picks a rate from the rate set, and text uses placeholders that the website fills in:

| Write | Shows |
| --- | --- |
| `{rate:deposit.vishwamangal-rd}%` | 9.50% (whole numbers stay plain: 10%) |
| `{rate2:deposit.lakshadish}%` | 9.25% (always two decimals: 10.00%) |
| `{number:doubling.general.months}` | 88 |
| `{calc}` | the calculator's maturity or payout for the scheme's example, e.g. ₹1,00,344 |
| `{calc:interest}` | the interest part of that example |

The **How it will read** panel shows the text with the current rates filled in. A placeholder for a rate that does not exist blocks submission.

### News, notices, gallery, branches, navigation
Same pattern: open the item, change it, **Save draft**, then publish. For *Blog and news* the cover image needs a description. For *Branches*, a branch that is no longer active disappears from the website and the enquiry forms with the next release but keeps its history. Pin a notice to show it on the homepage.

### Pictures and PDFs (Media library)
Upload JPEG, PNG or WebP images (up to 15 MB) and PDFs (up to 50 MB). Images are converted to three sizes automatically. **Every image needs a description for screen readers**, or must be marked decorative. The *Where used* list shows which content uses a file; files in use cannot be retired. *Upload new version* replaces a file without changing its address; the new version appears on the website only when content that uses it is published.

### Publishing (Publish center)
1. **Pending changes** lists what differs from the live site. Items waiting for approval are shown but not selectable.
2. **Preview all drafts** builds a private copy (about 30 seconds). **Open** it from the *Previews* tab; the link works once and expires, and the preview says it is not public.
3. **Publish selected**, optionally scheduling a time (IST). Watch the progress: *queued → building → validating → ready → activating → live*.
4. If a build or check fails, the previous release stays live and the page shows why. Open the release to read the build log.
5. **Restore this release** (on an earlier release, role permitting) switches back to it. It is refused if that release shows rates that are no longer in force; publish a corrected release instead.

If the published rates run out and no approved replacement is ready, the website automatically switches to a version with a clear *rates expired* notice and the calculators paused, and approvers are alerted.

## Administrators

- **Users and roles**: invite by email (a single-use link, valid 48 hours), choose roles, and for branch managers choose their branches. People are deactivated, never deleted, so history stays intact; deactivating signs them out immediately. Resetting someone's two-step sign-in needs a reason and a recent password + code confirmation. The system keeps at least one active Super Admin.
- **Audit log**: every sign-in, change, approval, export, download and release. Read-only.
- **Settings**: who is emailed for each kind of enquiry, how long enquiries and applications are kept, how many releases are kept for restore, optional office-network restriction, data-subject requests, and an **Operations** page (failed jobs, backup status).

## If something looks wrong

Note the **support reference** shown with an error (`req_…`) and tell your administrator. Nothing you do in the admin panel can break the live website directly: only a successful, checked release changes it.
