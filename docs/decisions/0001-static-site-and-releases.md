# 0001: The public site stays static; changes go live as releases

**Decision.** Visitors are served pre-built HTML files. Staff content lives in PostgreSQL. A *release* freezes approved content into a snapshot, the builder turns it into an immutable folder of files, and only then does the server switch to it.

**Why.** The previous WordPress site was compromised. A static site has nothing on the public host to log into or inject into, keeps working when the API or database is down, and is as fast as before. Building from a frozen snapshot also means what was reviewed is exactly what is published, later edits cannot leak into an in-flight build, and rolling back is switching to an earlier folder.

**Consequences.**
- A content change reaches visitors after a build (about 20 seconds here), not instantly.
- Anything that must change with the date (rate expiry) is handled by scheduled releases and a watchdog (see 0003), plus a client-side guard on cached pages.
- Forms still need the API. If it is down the page shows the email/phone fallback.
- Content and design stay separate: staff edit typed fields; layouts, scripts and calculator formulas are code, reviewed and tested.

**Alternatives considered.** A server-rendered site reading the database per request (rejected: database and application exposed on the public path, slower, and an outage takes the site down); a headless CMS product (rejected: a second system to secure and no maker–checker for rates).
