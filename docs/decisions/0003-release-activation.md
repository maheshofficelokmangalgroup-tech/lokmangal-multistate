# 0003: How a release goes live, and how it is recovered

**Decision.** A release is an immutable folder (`RELEASES_ROOT/<release-id>`) containing the built site, a `release.json` marker and copies of the media it uses. Activation makes Caddy serve that folder and answer that release's redirects.

**Why this way.** The database and the filesystem cannot change in one atomic step, and a symlink alone cannot switch redirects together with files. So the controller renders a Caddyfile from `deploy/caddy/Caddyfile.template` (root directory and redirect rules tied to the same release id) and loads it through Caddy's admin API. Caddy validates a configuration before applying it and reloads without dropping connections, so a bad render leaves the previous release serving. Old release folders stay on disk so requests that began before the switch finish, and so rollback is the same operation again.

**Steps (`releases::activate_job`).**
1. Take a database advisory lock (one activation at a time) and reconcile any earlier interrupted activation.
2. Re-check that the release is `ready` or due `scheduled`, and that its rate set is still the approved one in force today (an expiry-notice release is exempt).
3. Mark it `activating` and record an activation event.
4. Render and load the configuration; **verify** by fetching `/release.json` from the serving host until it names this release.
5. In one transaction: previous live → `superseded`, this one → `live`, set each content item's live revision, audit and notify. On any failure the previous release's configuration is loaded again and this one is marked `failed` with the reason.

**Crash recovery.** If the process dies after Caddy switched but before step 5, the release is stuck `activating`. On the next start (and before every activation) the controller asks the serving host which release it really serves: if it is this one the activation is completed; otherwise it is marked failed. No success is ever shown from a queued job or a database flag alone.

**Rollback** reactivates a retained release (default last 10). It is refused when that release's rate set is not the one in force, so rollback cannot quietly bring back expired or replaced rates; a corrective release is published instead. Database data is never rolled back by this.

**Scheduled releases and expiry.**
- Approving a rate set that starts in the future queues `prepare_rate_release`: a release is built for 00:00 IST on its first day from the content live now, and left `scheduled`. The scheduler (every 30 s) queues the activation when due.
- A watchdog in the same scheduler publishes an *expiry notice* release (calculators paused, validity notice shown) if the live release's rates have ended and no approved replacement is due, and alerts approvers. Pages also carry `data-rates-valid-until`, and a small script pauses calculators on cached pages past that date.

**Dev driver.** `ACTIVATION_DRIVER=file` writes `RELEASES_ROOT/current.json`, which the development site server reads; the same verification applies. The Caddy driver has not been exercised against a real Caddy yet (see the README).

**Previews** never enter the live state: they are built into `PREVIEWS_ROOT/<id>`, opened through a 2-minute single-use grant exchanged for a host-only cookie scoped to that preview, and removed after two days.
