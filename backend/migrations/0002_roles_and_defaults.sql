-- Permission catalogue and the starting role templates (specification §8).
-- Roles can be adjusted later in Users & roles; the maker–checker rule is enforced in the database
-- (approvals_independent_reviewer) and cannot be switched off by role changes.

insert into permissions (code, description, sensitive) values
    ('dashboard.view',               'See the dashboard', false),
    ('leads.view.all',               'See enquiries from every branch', true),
    ('leads.view.own_branch',        'See enquiries for the user''s own branches', true),
    ('leads.contact.reveal',         'See full phone numbers and email addresses of enquiries', true),
    ('leads.update',                 'Change status, follow-ups and notes on enquiries', false),
    ('leads.assign',                 'Assign enquiries to branches and staff', false),
    ('leads.export',                 'Export enquiries to CSV / Excel', true),
    ('applications.view',            'See job applications', true),
    ('applications.update',          'Change job application status and notes', false),
    ('applications.resume.download', 'Download applicants'' résumés', true),
    ('content.view',                 'View website content and drafts', false),
    ('content.edit',                 'Edit pages, homepage, people, news, gallery, notices, navigation and SEO', false),
    ('careers.edit',                 'Edit job openings', false),
    ('products.edit',                'Edit deposit schemes and loans', false),
    ('rates.edit',                   'Prepare interest rate sets', false),
    ('financial.approve',            'Approve or reject rates, schemes and loans (never one''s own changes)', true),
    ('content.approve',              'Approve editorial content that requires review', false),
    ('branches.edit',                'Edit branches', false),
    ('branches.suggest',             'Suggest changes to the user''s own branch', false),
    ('media.upload',                 'Upload images and documents', false),
    ('media.manage',                 'Edit, replace and retire media', false),
    ('site.preview',                 'Build and open previews', false),
    ('site.publish',                 'Publish and schedule website releases', true),
    ('site.rollback',                'Roll the website back to an earlier release', true),
    ('users.manage',                 'Invite, edit and deactivate staff accounts', true),
    ('roles.manage',                 'Change roles and their permissions', true),
    ('security.reset_2fa',           'Reset another user''s two-factor authentication', true),
    ('settings.manage',              'Change organisation and system settings', true),
    ('audit.view',                   'Read the audit log', true),
    ('audit.export',                 'Export the audit log', true),
    ('system.health',                'See job failures, backups and service health', false);

insert into roles (code, name, description, is_system) values
    ('super_admin',    'Super Admin',        'Users, roles, settings, publication and organisation-wide administration.', true),
    ('admin',          'Admin',              'Content, branches, leads, jobs and releases.', true),
    ('editor',         'Editor',             'Pages, homepage, people, news, gallery, notices, media and navigation.', true),
    ('finance_maker',  'Finance (maker)',    'Prepares rates, deposit terms and loan terms for review.', true),
    ('approver',       'Approver (checker)', 'Reviews financial changes and publishes approved releases.', true),
    ('branch_manager', 'Branch Manager',     'Own-branch enquiries, follow-ups and branch-change suggestions.', true),
    ('hr',             'HR',                 'Job openings, applications and résumés.', true),
    ('auditor',        'Auditor',            'Read-only access to content, releases and the audit log.', true);

insert into role_permissions (role_id, permission)
select r.id, p.code
from roles r
join (values
    ('super_admin', 'dashboard.view'), ('super_admin', 'leads.view.all'), ('super_admin', 'leads.contact.reveal'),
    ('super_admin', 'leads.update'), ('super_admin', 'leads.assign'), ('super_admin', 'leads.export'),
    ('super_admin', 'content.view'), ('super_admin', 'content.edit'), ('super_admin', 'careers.edit'),
    ('super_admin', 'products.edit'), ('super_admin', 'rates.edit'), ('super_admin', 'branches.edit'),
    ('super_admin', 'media.upload'), ('super_admin', 'media.manage'), ('super_admin', 'site.preview'),
    ('super_admin', 'site.publish'), ('super_admin', 'site.rollback'), ('super_admin', 'users.manage'),
    ('super_admin', 'roles.manage'), ('super_admin', 'security.reset_2fa'), ('super_admin', 'settings.manage'),
    ('super_admin', 'audit.view'), ('super_admin', 'audit.export'), ('super_admin', 'system.health'),
    ('super_admin', 'financial.approve'), ('super_admin', 'content.approve'),

    ('admin', 'dashboard.view'), ('admin', 'leads.view.all'), ('admin', 'leads.contact.reveal'), ('admin', 'leads.update'),
    ('admin', 'leads.assign'), ('admin', 'leads.export'), ('admin', 'content.view'), ('admin', 'content.edit'),
    ('admin', 'careers.edit'), ('admin', 'branches.edit'), ('admin', 'media.upload'), ('admin', 'media.manage'),
    ('admin', 'site.preview'), ('admin', 'site.publish'), ('admin', 'site.rollback'), ('admin', 'audit.view'),
    ('admin', 'applications.view'), ('admin', 'applications.update'), ('admin', 'content.approve'), ('admin', 'system.health'),

    ('editor', 'dashboard.view'), ('editor', 'content.view'), ('editor', 'content.edit'), ('editor', 'media.upload'),
    ('editor', 'site.preview'),

    ('finance_maker', 'dashboard.view'), ('finance_maker', 'content.view'), ('finance_maker', 'products.edit'),
    ('finance_maker', 'rates.edit'), ('finance_maker', 'media.upload'), ('finance_maker', 'site.preview'),

    ('approver', 'dashboard.view'), ('approver', 'content.view'), ('approver', 'financial.approve'),
    ('approver', 'site.preview'), ('approver', 'site.publish'), ('approver', 'audit.view'),

    ('branch_manager', 'dashboard.view'), ('branch_manager', 'leads.view.own_branch'), ('branch_manager', 'leads.contact.reveal'),
    ('branch_manager', 'leads.update'), ('branch_manager', 'branches.suggest'),

    ('hr', 'dashboard.view'), ('hr', 'careers.edit'), ('hr', 'applications.view'), ('hr', 'applications.update'),
    ('hr', 'applications.resume.download'), ('hr', 'content.view'),

    ('auditor', 'dashboard.view'), ('auditor', 'content.view'), ('auditor', 'leads.view.all'), ('auditor', 'audit.view'),
    ('auditor', 'applications.view')
) as g(role_code, permission) on g.role_code = r.code
join permissions p on p.code = g.permission;

insert into consent_versions (id, purpose, wording) values
    ('2026-10-enquiry', 'enquiry',
     'I agree to be contacted by Lokmangal Multistate about my enquiry.'),
    ('2026-10-application', 'application',
     'I agree that Lokmangal Multistate may use these details and my résumé to consider my job application.');

insert into app_settings (key, value) values
    ('notifications', '{"defaultRecipients": [], "byKind": {}, "applicationRecipients": []}'),
    ('privacy', '{"leadRetentionMonths": 24, "applicationRetentionMonths": 12, "exportExpiryHours": 24}'),
    ('publishing', '{"timezone": "Asia/Kolkata", "rateExpiryWarningDays": 30, "releaseRetention": 10, "batchSeconds": 60}'),
    ('access', '{"idleTimeoutMinutes": 30, "absoluteTimeoutHours": 12, "officeNetworks": []}');
