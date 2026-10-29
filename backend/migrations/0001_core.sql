-- Lokmangal admin platform: core schema.
-- Times are timestamptz (UTC); the admin shows Asia/Kolkata. Money and rates are numeric, never floats.

-- ---------------------------------------------------------------------------------------------
-- Identity, roles and branch scope
-- ---------------------------------------------------------------------------------------------
create table users (
    id                  uuid primary key default gen_random_uuid(),
    email               text not null,
    name                text not null,
    password_hash       text,
    status              text not null default 'invited' check (status in ('invited', 'active', 'deactivated')),
    totp_secret_enc     bytea,
    totp_key_version    smallint,
    totp_enabled_at     timestamptz,
    totp_last_step      bigint,
    password_changed_at timestamptz,
    last_login_at       timestamptz,
    deactivated_at      timestamptz,
    deactivated_reason  text,
    created_by          uuid references users (id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    check (email = lower(btrim(email)) and email like '%_@_%')
);
create unique index users_email_key on users (email);

create table permissions (
    code        text primary key,
    description text not null,
    sensitive   boolean not null default false
);

create table roles (
    id          uuid primary key default gen_random_uuid(),
    code        text not null unique,
    name        text not null,
    description text not null default '',
    is_system   boolean not null default false,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

create table role_permissions (
    role_id    uuid not null references roles (id) on delete cascade,
    permission text not null references permissions (code),
    primary key (role_id, permission)
);

create table user_roles (
    user_id    uuid not null references users (id) on delete cascade,
    role_id    uuid not null references roles (id),
    granted_by uuid references users (id),
    granted_at timestamptz not null default now(),
    primary key (user_id, role_id)
);

-- Operational branch identities (lead routing and staff scope). Public branch details are content
-- (collection "branch") linked by the same code.
create table branches (
    id                 uuid primary key default gen_random_uuid(),
    code               text not null unique check (code ~ '^[A-Z0-9-]{2,20}$'),
    name               text not null,
    region             text not null,
    is_head_office     boolean not null default false,
    active             boolean not null default true,
    notification_email text,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create table user_branch_scopes (
    user_id   uuid not null references users (id) on delete cascade,
    branch_id uuid not null references branches (id) on delete cascade,
    primary key (user_id, branch_id)
);

-- ---------------------------------------------------------------------------------------------
-- Sessions and bounded authentication workflows
-- ---------------------------------------------------------------------------------------------
create table sessions (
    id             uuid primary key default gen_random_uuid(),
    token_hash     bytea not null unique,
    user_id        uuid not null references users (id) on delete cascade,
    stage          text not null check (stage in ('password', 'enroll', 'full')),
    csrf_token     text not null,
    created_at     timestamptz not null default now(),
    last_seen_at   timestamptz not null default now(),
    expires_at     timestamptz not null,
    reauth_at      timestamptz,
    revoked_at     timestamptz,
    revoked_reason text,
    ip             inet,
    user_agent     text
);
create index sessions_user_active on sessions (user_id) where revoked_at is null;

create table recovery_codes (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id) on delete cascade,
    code_hash  text not null,
    used_at    timestamptz,
    created_at timestamptz not null default now()
);
create index recovery_codes_user on recovery_codes (user_id) where used_at is null;

create table auth_tokens (
    id         uuid primary key default gen_random_uuid(),
    kind       text not null check (kind in ('password_reset', 'invitation')),
    token_hash bytea not null unique,
    user_id    uuid not null references users (id) on delete cascade,
    expires_at timestamptz not null,
    used_at    timestamptz,
    revoked_at timestamptz,
    created_by uuid references users (id),
    created_at timestamptz not null default now()
);

create table login_attempts (
    id      bigint generated always as identity primary key,
    email   text not null,
    ip      inet,
    success boolean not null,
    at      timestamptz not null default now()
);
create index login_attempts_email on login_attempts (email, at desc);
create index login_attempts_ip on login_attempts (ip, at desc);

-- ---------------------------------------------------------------------------------------------
-- Audit: append-only for the application
-- ---------------------------------------------------------------------------------------------
create table audit_events (
    id          bigint generated always as identity primary key,
    at          timestamptz not null default now(),
    actor_id    uuid references users (id),
    actor_label text,
    action      text not null,
    entity_type text,
    entity_id   text,
    outcome     text not null default 'success' check (outcome in ('success', 'denied', 'failure')),
    request_id  text,
    ip          inet,
    details     jsonb not null default '{}'::jsonb
);
create index audit_events_at on audit_events (at desc);
create index audit_events_actor on audit_events (actor_id, at desc);
create index audit_events_entity on audit_events (entity_type, entity_id);

create function audit_events_append_only() returns trigger language plpgsql as $$
begin
    -- Only the documented retention procedure (see docs/database.md) may remove old rows.
    if tg_op = 'DELETE' and coalesce(current_setting('lokmangal.audit_retention', true), '') = 'on' then
        return old;
    end if;
    raise exception 'audit_events is append-only';
end $$;
create trigger audit_events_append_only before update or delete on audit_events
    for each row execute function audit_events_append_only();

-- ---------------------------------------------------------------------------------------------
-- Content engine: items, immutable revisions, contributors
-- ---------------------------------------------------------------------------------------------
create table content_items (
    id                uuid primary key default gen_random_uuid(),
    collection        text not null,
    slug              text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    draft_revision_id uuid,
    live_revision_id  uuid,
    archived_at       timestamptz,
    archive_pending   boolean not null default false,
    created_by        uuid references users (id),
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    unique (collection, slug)
);

create table content_revisions (
    id                 uuid primary key default gen_random_uuid(),
    item_id            uuid not null references content_items (id) on delete cascade,
    revision           integer not null check (revision > 0),
    schema_version     integer not null default 1,
    data               jsonb not null,
    status             text not null default 'draft'
                       check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'released', 'superseded')),
    lock_version       integer not null default 1,
    created_by         uuid references users (id),
    created_at         timestamptz not null default now(),
    updated_by         uuid references users (id),
    updated_at         timestamptz not null default now(),
    submitted_by       uuid references users (id),
    submitted_at       timestamptz,
    note               text,
    source_revision_id uuid references content_revisions (id),
    unique (item_id, revision)
);

alter table content_items
    add constraint content_items_draft_fk foreign key (draft_revision_id) references content_revisions (id),
    add constraint content_items_live_fk foreign key (live_revision_id) references content_revisions (id);

create table revision_contributors (
    revision_id uuid not null references content_revisions (id) on delete cascade,
    user_id     uuid not null references users (id),
    first_at    timestamptz not null default now(),
    primary key (revision_id, user_id)
);

-- Data in a revision may change only while it is an editable draft.
create function content_revisions_freeze() returns trigger language plpgsql as $$
begin
    if old.data is distinct from new.data and old.status not in ('draft', 'changes_requested') then
        raise exception 'revision % is % and cannot be edited; create a new draft', old.id, old.status;
    end if;
    return new;
end $$;
create trigger content_revisions_freeze before update on content_revisions
    for each row execute function content_revisions_freeze();

-- ---------------------------------------------------------------------------------------------
-- Rates: relational, numeric, with an enforced non-overlapping approved timeline
-- ---------------------------------------------------------------------------------------------
create table rate_sets (
    id              uuid primary key default gen_random_uuid(),
    lineage_id      uuid not null,
    revision        integer not null default 1,
    label           text not null,
    valid_from      date not null,
    valid_until     date not null,
    status          text not null default 'draft'
                    check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'superseded', 'archived')),
    source_document text,
    change_reason   text,
    finance_policy  text not null,
    lock_version    integer not null default 1,
    supersedes_id   uuid references rate_sets (id),
    created_by      uuid references users (id),
    created_at      timestamptz not null default now(),
    updated_by      uuid references users (id),
    updated_at      timestamptz not null default now(),
    submitted_by    uuid references users (id),
    submitted_at    timestamptz,
    check (valid_until > valid_from),
    unique (lineage_id, revision)
);
alter table rate_sets add constraint rate_sets_approved_no_overlap
    exclude using gist (daterange(valid_from, valid_until, '[)') with &&) where (status = 'approved');

create table rate_entries (
    id              uuid primary key default gen_random_uuid(),
    rate_set_id     uuid not null references rate_sets (id) on delete cascade,
    key             text not null check (key ~ '^[a-z0-9]+([.+_-][a-z0-9]+)*$'),
    section         text not null check (section in ('fd_slab', 'deposit', 'doubling', 'loan')),
    label           text not null,
    category        text check (category in ('regular', 'special')),
    tenure_min_days integer check (tenure_min_days >= 0),
    tenure_max_days integer,
    value           numeric(9, 3) not null check (value >= 0),
    unit            text not null check (unit in ('percent', 'months')),
    sort_order      integer not null default 0,
    unique (rate_set_id, key),
    check (unit <> 'percent' or value < 100),
    check (tenure_max_days is null or tenure_max_days >= tenure_min_days),
    check (section <> 'fd_slab' or (tenure_min_days is not null and category is not null))
);

create table rate_set_contributors (
    rate_set_id uuid not null references rate_sets (id) on delete cascade,
    user_id     uuid not null references users (id),
    first_at    timestamptz not null default now(),
    primary key (rate_set_id, user_id)
);

create function rate_sets_freeze() returns trigger language plpgsql as $$
begin
    if old.status not in ('draft', 'changes_requested')
       and (old.valid_from, old.valid_until, old.label, old.source_document, old.change_reason)
           is distinct from (new.valid_from, new.valid_until, new.label, new.source_document, new.change_reason) then
        raise exception 'rate set % is % and cannot be edited; create a new revision', old.id, old.status;
    end if;
    return new;
end $$;
create trigger rate_sets_freeze before update on rate_sets for each row execute function rate_sets_freeze();

create function rate_entries_freeze() returns trigger language plpgsql as $$
declare st text;
begin
    select status into st from rate_sets where id = coalesce(new.rate_set_id, old.rate_set_id);
    if st is not null and st not in ('draft', 'changes_requested') then
        raise exception 'entries of a % rate set cannot be changed', st;
    end if;
    return coalesce(new, old);
end $$;
create trigger rate_entries_freeze before insert or update or delete on rate_entries
    for each row execute function rate_entries_freeze();

-- ---------------------------------------------------------------------------------------------
-- Approvals (maker–checker) for content revisions and rate sets
-- ---------------------------------------------------------------------------------------------
create table approvals (
    id           uuid primary key default gen_random_uuid(),
    subject_type text not null check (subject_type in ('content_revision', 'rate_set')),
    subject_id   uuid not null,
    submitted_by uuid not null references users (id),
    submitted_at timestamptz not null default now(),
    submit_note  text,
    status       text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
    reviewer_id  uuid references users (id),
    decided_at   timestamptz,
    comment      text,
    check (reviewer_id is null or reviewer_id <> submitted_by),
    check ((status in ('approved', 'rejected')) = (reviewer_id is not null and decided_at is not null)),
    check (status <> 'rejected' or length(btrim(coalesce(comment, ''))) > 0)
);
create unique index approvals_one_pending on approvals (subject_type, subject_id) where status = 'pending';

-- The checker may not have contributed to (or submitted) what they decide on — no exceptions for any role.
create function approvals_independent_reviewer() returns trigger language plpgsql as $$
begin
    if new.reviewer_id is null then
        return new;
    end if;
    if new.subject_type = 'content_revision' and exists (
        select 1 from revision_contributors where revision_id = new.subject_id and user_id = new.reviewer_id
        union all
        select 1 from content_revisions where id = new.subject_id and (created_by = new.reviewer_id or submitted_by = new.reviewer_id)
    ) then
        raise exception 'reviewer contributed to this revision' using errcode = 'P0001';
    end if;
    if new.subject_type = 'rate_set' and exists (
        select 1 from rate_set_contributors where rate_set_id = new.subject_id and user_id = new.reviewer_id
        union all
        select 1 from rate_sets where id = new.subject_id and (created_by = new.reviewer_id or submitted_by = new.reviewer_id)
    ) then
        raise exception 'reviewer contributed to this rate set' using errcode = 'P0001';
    end if;
    return new;
end $$;
create trigger approvals_independent_reviewer before insert or update on approvals
    for each row execute function approvals_independent_reviewer();

-- ---------------------------------------------------------------------------------------------
-- Media (public assets, versioned) and private files (résumés)
-- ---------------------------------------------------------------------------------------------
create table media (
    id                 uuid primary key default gen_random_uuid(),
    kind               text not null check (kind in ('image', 'document')),
    title              text not null,
    alt                text,
    decorative         boolean not null default false,
    current_version_id uuid,
    created_by         uuid references users (id),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now(),
    deleted_at         timestamptz
);

create table media_versions (
    id            uuid primary key default gen_random_uuid(),
    media_id      uuid not null references media (id) on delete cascade,
    version       integer not null,
    original_name text not null,
    mime          text not null,
    size_bytes    bigint not null,
    width         integer,
    height        integer,
    sha256        text not null,
    variants      jsonb not null default '[]'::jsonb,
    status        text not null default 'processing' check (status in ('processing', 'ready', 'rejected')),
    error         text,
    created_by    uuid references users (id),
    created_at    timestamptz not null default now(),
    unique (media_id, version)
);
alter table media add constraint media_current_version_fk foreign key (current_version_id) references media_versions (id);

create table media_usage (
    media_id    uuid not null references media (id),
    revision_id uuid not null references content_revisions (id) on delete cascade,
    primary key (media_id, revision_id)
);

create table private_files (
    id            uuid primary key default gen_random_uuid(),
    purpose       text not null check (purpose in ('resume', 'export')),
    original_name text not null,
    mime          text not null,
    size_bytes    bigint not null,
    sha256        text not null,
    status        text not null default 'quarantined' check (status in ('quarantined', 'clean', 'rejected')),
    created_at    timestamptz not null default now(),
    deleted_at    timestamptz
);

-- ---------------------------------------------------------------------------------------------
-- Releases: frozen snapshots, builds and activation history
-- ---------------------------------------------------------------------------------------------
create table releases (
    id             uuid primary key default gen_random_uuid(),
    number         bigint generated always as identity unique,
    kind           text not null check (kind in ('preview', 'live')),
    status         text not null default 'queued'
                   check (status in ('queued', 'building', 'validating', 'ready', 'scheduled', 'activating',
                                     'live', 'superseded', 'failed', 'cancelled')),
    snapshot       jsonb not null,
    content_hash   text not null,
    schema_version integer not null,
    finance_policy text not null,
    rate_set_id    uuid references rate_sets (id),
    source_commit  text,
    builder_image  text,
    idempotency_key text unique,
    requested_by   uuid references users (id),
    requested_at   timestamptz not null default now(),
    note           text,
    activate_when_ready boolean not null default false,
    -- Built automatically when published rates expired with no approved replacement ready.
    expiry_fallback boolean not null default false,
    scheduled_for  timestamptz,
    activated_at   timestamptz,
    activated_by   uuid references users (id),
    superseded_at  timestamptz,
    rollback_of    uuid references releases (id),
    page_count     integer,
    build_log      text,
    error          text,
    updated_at     timestamptz not null default now()
);
create unique index releases_one_live on releases ((true)) where kind = 'live' and status = 'live';
create unique index releases_one_activating on releases ((true)) where status = 'activating';
create index releases_scheduled on releases (scheduled_for) where status = 'scheduled';

create table release_items (
    release_id  uuid not null references releases (id) on delete cascade,
    item_id     uuid not null references content_items (id),
    revision_id uuid not null references content_revisions (id),
    selected    boolean not null,
    primary key (release_id, item_id)
);

create table activation_events (
    id         bigint generated always as identity primary key,
    release_id uuid not null references releases (id),
    action     text not null,
    outcome    text not null,
    actor_id   uuid references users (id),
    details    jsonb not null default '{}'::jsonb,
    at         timestamptz not null default now()
);

create table preview_grants (
    id         uuid primary key default gen_random_uuid(),
    release_id uuid not null references releases (id) on delete cascade,
    user_id    uuid not null references users (id),
    token_hash bytea not null unique,
    expires_at timestamptz not null,
    used_at    timestamptz,
    created_at timestamptz not null default now()
);

create table preview_sessions (
    id         uuid primary key default gen_random_uuid(),
    release_id uuid not null references releases (id) on delete cascade,
    user_id    uuid not null references users (id),
    token_hash bytea not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Enquiries (leads) and job applications
-- ---------------------------------------------------------------------------------------------
create sequence enquiry_reference_seq;
create sequence application_reference_seq;

create table enquiries (
    id                    uuid primary key default gen_random_uuid(),
    reference             text not null unique,
    kind                  text not null check (kind in ('account', 'deposit', 'loan', 'contact', 'callback', 'service')),
    name                  text not null,
    phone                 text not null,
    phone_normalized      text not null,
    email                 text,
    city                  text,
    product               text,
    amount                bigint check (amount is null or amount >= 0),
    message               text,
    details               jsonb not null default '{}'::jsonb,
    branch_id             uuid references branches (id),
    assignee_id           uuid references users (id),
    status                text not null default 'new'
                          check (status in ('new', 'contacted', 'in_progress', 'converted', 'not_interested', 'spam')),
    follow_up_at          timestamptz,
    possible_duplicate_of uuid references enquiries (id),
    source_page           text,
    consent_version       text,
    consent_at            timestamptz,
    idempotency_key       text,
    request_hash          text,
    retention_until       date,
    anonymized_at         timestamptz,
    closed_at             timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);
create unique index enquiries_idempotency on enquiries (idempotency_key) where idempotency_key is not null;
create index enquiries_list on enquiries (created_at desc);
create index enquiries_branch on enquiries (branch_id, status, created_at desc);
create index enquiries_phone on enquiries (phone_normalized, created_at desc);
create index enquiries_follow_up on enquiries (follow_up_at) where status in ('new', 'contacted', 'in_progress');

create table enquiry_notes (
    id         uuid primary key default gen_random_uuid(),
    enquiry_id uuid not null references enquiries (id) on delete cascade,
    author_id  uuid not null references users (id),
    body       text not null check (length(btrim(body)) > 0),
    created_at timestamptz not null default now()
);

create table enquiry_events (
    id         bigint generated always as identity primary key,
    enquiry_id uuid not null references enquiries (id) on delete cascade,
    actor_id   uuid references users (id),
    kind       text not null,
    from_value text,
    to_value   text,
    note       text,
    at         timestamptz not null default now()
);
create index enquiry_events_enquiry on enquiry_events (enquiry_id, at);

create table job_applications (
    id               uuid primary key default gen_random_uuid(),
    reference        text not null unique,
    job_item_id      uuid references content_items (id),
    position         text not null,
    name             text not null,
    phone            text not null,
    phone_normalized text not null,
    email            text,
    city             text,
    experience_years integer check (experience_years between 0 and 60),
    message          text,
    resume_file_id   uuid references private_files (id),
    status           text not null default 'new' check (status in ('new', 'shortlisted', 'interview', 'selected', 'rejected')),
    consent_version  text,
    consent_at       timestamptz,
    idempotency_key  text,
    request_hash     text,
    retention_until  date,
    anonymized_at    timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
create unique index job_applications_idempotency on job_applications (idempotency_key) where idempotency_key is not null;

create table application_events (
    id             bigint generated always as identity primary key,
    application_id uuid not null references job_applications (id) on delete cascade,
    actor_id       uuid references users (id),
    kind           text not null,
    from_value     text,
    to_value       text,
    note           text,
    at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Jobs (durable queue / outbox), notifications, settings, privacy, imports
-- ---------------------------------------------------------------------------------------------
create table jobs (
    id           uuid primary key default gen_random_uuid(),
    kind         text not null,
    payload      jsonb not null default '{}'::jsonb,
    status       text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    run_at       timestamptz not null default now(),
    attempts     integer not null default 0,
    max_attempts integer not null default 8,
    locked_until timestamptz,
    locked_by    text,
    last_error   text,
    progress     jsonb,
    dedupe_key   text unique,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);
create index jobs_due on jobs (run_at) where status = 'queued';
create index jobs_running on jobs (locked_until) where status = 'running';

create table notifications (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id) on delete cascade,
    kind       text not null,
    title      text not null,
    body       text not null default '',
    link       text,
    read_at    timestamptz,
    created_at timestamptz not null default now()
);
create index notifications_user on notifications (user_id, created_at desc);

create table app_settings (
    key        text primary key,
    value      jsonb not null,
    updated_by uuid references users (id),
    updated_at timestamptz not null default now()
);

create table consent_versions (
    id         text primary key,
    purpose    text not null,
    wording    text not null,
    created_at timestamptz not null default now()
);

create table data_requests (
    id            uuid primary key default gen_random_uuid(),
    kind          text not null check (kind in ('access', 'correction', 'deletion')),
    subject_phone text,
    subject_email text,
    status        text not null default 'open' check (status in ('open', 'completed', 'rejected')),
    notes         text,
    created_by    uuid references users (id),
    created_at    timestamptz not null default now(),
    completed_at  timestamptz
);

create table import_runs (
    id          uuid primary key default gen_random_uuid(),
    source      text not null,
    dry_run     boolean not null,
    summary     jsonb not null default '{}'::jsonb,
    started_by  text,
    started_at  timestamptz not null default now(),
    finished_at timestamptz
);

create table source_mappings (
    source      text not null,
    source_key  text not null,
    target_type text not null,
    target_id   uuid not null,
    checksum    text not null,
    imported_at timestamptz not null default now(),
    primary key (source, source_key)
);
