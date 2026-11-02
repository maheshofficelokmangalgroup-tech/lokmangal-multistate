# Deploying on Render

For the person setting up the full system (website, admin panel, API, database) on Render. Render's disks cannot be shared between services, so everything runs in one container, defined in [deploy/render/](../deploy/render/).

## Where things will be

| What | Address |
|---|---|
| Admin panel | The address Render gives the service, such as `https://lokmangal-app.onrender.com` |
| Website with working forms | `https://new.lokmangalmultistate.com` |
| Private previews | `https://preview.lokmangalmultistate.com` |

The website and previews need the two DNS records in step 3. The admin panel works without them. The old site and the static design preview on Render are not touched.

## 1. Create the services

1. In Render: **New + → Blueprint**, and choose this repository.
2. Set **Blueprint path** to `deploy/render/render.yaml`.
3. Check the plans and the monthly price Render shows, then press **Apply**. A paid plan needs a card on the Render account.

The first build compiles the API and takes a while. When it is done, the service shows **Live**.

## 2. Create the first Super Admin

1. Open the `lokmangal-app` service, then **Shell**.
2. Run this with your own details:

   ```
   first-admin you@example.com "Your Name"
   ```

3. Open the invitation link it prints, choose a password and set up the authenticator app. Keep the recovery codes.
4. In **Publish website**, publish everything once. The website shows a holding page until then.

## 3. Connect the website and previews

At your domain's DNS provider, add two CNAME records that point to the address Render gave the service:

| Name | Value |
|---|---|
| `new` | `lokmangal-app.onrender.com` (use your service's real address) |
| `preview` | the same |

Render issues the HTTPS certificates. See **Settings → Custom Domains** on the service.

## 4. Check the real visitor address

Sign in, open **Audit log**, and find your sign-in. Its address must be your own public address, not `127.0.0.1`. Sign-in throttling, form limits and office network limits all depend on this.

If it shows `127.0.0.1`, Render has stopped sending the `CF-Connecting-IP` header: change `header_up` in `deploy/render/global.caddy` before relying on those limits.

## 5. Before real use

- Copy `DATA_ENCRYPTION_KEY` (service → **Environment**) somewhere safe and offline. Without it, sign-in secrets cannot be read.
- For enquiry and invitation emails, add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURITY`, `SMTP_USER` and `SMTP_PASSWORD` in **Environment**. Without them nothing is emailed: enquiries still reach the admin panel, and new staff need an invitation link made in the Shell.
- Backups: Render keeps database backups and disk snapshots according to the plan. Check what your plan keeps in the Render dashboard, and test restoring once.
- Work through [go-live-checklist.md](go-live-checklist.md), which also covers moving the public domain.

## Things to know

- **Location:** Render has no India region, so data is stored in Singapore. Decide with the society whether this is acceptable for member data.
- **Deploys:** a new version deploys after GitHub's checks pass, with a short outage, because the service has a disk.
- **Moving the public domain:** change `PUBLIC_HOST` to `lokmangalmultistate.com`, add that domain and `www` under Custom Domains, update DNS, and publish once.
