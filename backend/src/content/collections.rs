//! The registry of editable content types. Each collection has a typed schema (unknown fields are
//! rejected), business checks, sanitising of rich text, and its own edit permission. The output shape is
//! exactly what the public website's snapshot adapters (frontend/src/data/*.ts) read.

use std::sync::LazyLock;

use regex::Regex;
use serde::{Deserialize, Serialize, de::DeserializeOwned};
use serde_json::{Number, Value};

use crate::{error::FieldErrors, text::is_slug};

pub struct CollectionDef {
    pub name: &'static str,
    pub label: &'static str,
    pub singleton: bool,
    /// Revisions must be approved by an independent checker before they can be released.
    pub requires_approval: bool,
    pub financial: bool,
    pub edit_permission: &'static str,
}

const fn def(
    name: &'static str,
    label: &'static str,
    singleton: bool,
    requires_approval: bool,
    financial: bool,
    edit_permission: &'static str,
) -> CollectionDef {
    CollectionDef {
        name,
        label,
        singleton,
        requires_approval,
        financial,
        edit_permission,
    }
}

pub static COLLECTIONS: &[CollectionDef] = &[
    def(
        "settings",
        "Organisation settings",
        true,
        false,
        false,
        "settings.manage",
    ),
    def("home", "Homepage", true, false, false, "content.edit"),
    def(
        "navigation",
        "Navigation & footer",
        true,
        false,
        false,
        "content.edit",
    ),
    def("people", "People", true, false, false, "content.edit"),
    def("faq", "FAQ", true, false, false, "content.edit"),
    def(
        "services",
        "Other services & Rural Wealth Manager",
        true,
        false,
        false,
        "content.edit",
    ),
    def(
        "csr",
        "Social responsibility",
        true,
        false,
        false,
        "content.edit",
    ),
    def(
        "deposit_page",
        "Deposit page (documents, benefits)",
        true,
        true,
        true,
        "products.edit",
    ),
    def(
        "loan_page",
        "Loan page (benefits, form options)",
        true,
        true,
        true,
        "products.edit",
    ),
    def(
        "deposit_scheme",
        "Deposit schemes",
        false,
        true,
        true,
        "products.edit",
    ),
    def("loan", "Loans", false, true, true, "products.edit"),
    def("branch", "Branches", false, false, false, "branches.edit"),
    def("post", "Blog & news", false, false, false, "content.edit"),
    def("notice", "Notices", false, false, false, "content.edit"),
    def("document", "Documents", false, false, false, "content.edit"),
    def(
        "gallery_album",
        "Gallery albums",
        false,
        false,
        false,
        "content.edit",
    ),
    def(
        "job_opening",
        "Job openings",
        false,
        false,
        false,
        "careers.edit",
    ),
    def("redirect", "Redirects", false, false, false, "content.edit"),
];

pub fn get(name: &str) -> Option<&'static CollectionDef> {
    COLLECTIONS.iter().find(|c| c.name == name)
}

// ------------------------------------------------------------------------------------------------
// Shared checks
// ------------------------------------------------------------------------------------------------

static EMBED_MAPS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^https://www\.google\.com/maps/embed\?").unwrap());
static EMBED_YOUTUBE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^https://www\.youtube(-nocookie)?\.com/embed/[A-Za-z0-9_-]+").unwrap()
});
static ICON: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[a-z0-9-]{2,40}$").unwrap());
static DATE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d{4}-\d{2}-\d{2}").unwrap());

struct Ctx<'a> {
    errors: &'a mut FieldErrors,
}

impl Ctx<'_> {
    fn req(&mut self, field: &str, value: &str, max: usize) {
        let n = value.trim().chars().count();
        if n == 0 {
            self.errors.add(field, "This field is required.");
        } else if n > max {
            self.errors
                .add(field, format!("Use at most {max} characters."));
        }
    }
    fn max(&mut self, field: &str, value: &str, max: usize) {
        if value.chars().count() > max {
            self.errors
                .add(field, format!("Use at most {max} characters."));
        }
    }
    /// Internal paths ("/deposits/"), https/http URLs, mailto: and tel: — never javascript: or data:.
    fn link(&mut self, field: &str, href: &str) {
        let ok = (href.starts_with('/')
            && !href.starts_with("//")
            && !href.contains(['<', '>', '"', ' ']))
            || ((href.starts_with("https://") || href.starts_with("http://"))
                && url::Url::parse(href).is_ok())
            || href.starts_with("mailto:")
            || href.starts_with("tel:+");
        if !ok {
            self.errors.add(
                field,
                "Use a site path starting with / or a full https:// address.",
            );
        }
    }
    /// Images and files come from the site's own folders or the media library.
    fn asset(&mut self, field: &str, path: &str) {
        let ok = (path.starts_with("/images/")
            || path.starts_with("/media/")
            || path.starts_with("/docs/")
            || path.starts_with("/wp-content/uploads/"))
            && !path.contains("..")
            && !path.contains(['<', '>', '"', ' ', '?', '#']);
        if !ok {
            self.errors
                .add(field, "Choose a file from the media library.");
        }
    }
    fn icon(&mut self, field: &str, icon: &str) {
        if !ICON.is_match(icon) {
            self.errors.add(field, "Choose an icon from the list.");
        }
    }
    fn date(&mut self, field: &str, d: &str) {
        if !DATE.is_match(d) || chrono::NaiveDate::parse_from_str(&d[..10], "%Y-%m-%d").is_err() {
            self.errors.add(field, "Use a valid date.");
        }
    }
}

/// Allow-list sanitiser for rich text (headings, paragraphs, lists, links, tables). Links get rel attributes;
/// scripts, styles, event handlers and embeds are removed.
pub fn sanitize_html(html: &str) -> String {
    ammonia::Builder::default()
        .tags(
            [
                "p",
                "br",
                "strong",
                "em",
                "b",
                "i",
                "u",
                "ul",
                "ol",
                "li",
                "h2",
                "h3",
                "h4",
                "blockquote",
                "a",
                "table",
                "thead",
                "tbody",
                "tr",
                "th",
                "td",
                "caption",
            ]
            .into(),
        )
        .link_rel(Some("noopener noreferrer"))
        .url_schemes(["https", "http", "mailto", "tel"].into())
        .clean(html)
        .to_string()
}

trait Check {
    fn check(&mut self, cx: &mut Ctx<'_>);
}

fn validated<T: DeserializeOwned + Serialize + Check>(
    data: Value,
    errors: &mut FieldErrors,
) -> Option<Value> {
    match serde_json::from_value::<T>(data) {
        Ok(mut v) => {
            v.check(&mut Ctx { errors });
            serde_json::to_value(v).ok()
        }
        Err(e) => {
            errors.add(
                "data",
                format!("The content does not match the expected structure: {e}"),
            );
            None
        }
    }
}

/// Validates and normalises content for a collection. Returns the cleaned JSON to store.
pub fn validate(collection: &str, mut data: Value) -> Result<Value, FieldErrors> {
    let mut errors = FieldErrors::new();
    // Marathi text lives in an optional "mr" overlay with the same shape as the English content.
    let overlay = data.as_object_mut().and_then(|o| o.remove("mr"));
    let out = match collection {
        "settings" => validated::<SiteSettings>(data, &mut errors),
        "home" => validated::<Home>(data, &mut errors),
        "navigation" => validated::<Navigation>(data, &mut errors),
        "people" => validated::<People>(data, &mut errors),
        "faq" => validated::<Faq>(data, &mut errors),
        "services" => validated::<Services>(data, &mut errors),
        "csr" => validated::<Csr>(data, &mut errors),
        "deposit_page" => validated::<DepositPage>(data, &mut errors),
        "loan_page" => validated::<LoanPage>(data, &mut errors),
        "deposit_scheme" => validated::<DepositScheme>(data, &mut errors),
        "loan" => validated::<Loan>(data, &mut errors),
        "branch" => validated::<Branch>(data, &mut errors),
        "post" => validated::<Post>(data, &mut errors),
        "notice" => validated::<Notice>(data, &mut errors),
        "document" => validated::<Document>(data, &mut errors),
        "gallery_album" => validated::<GalleryAlbum>(data, &mut errors),
        "job_opening" => validated::<JobOpening>(data, &mut errors),
        "redirect" => validated::<Redirect>(data, &mut errors),
        _ => {
            errors.add("collection", "Unknown content type.");
            None
        }
    };
    let out = match (out, overlay) {
        (Some(Value::Object(mut o)), Some(ov)) => {
            if let Some(clean) = check_overlay(&ov, &mut errors) {
                o.insert("mr".into(), clean);
            }
            Some(Value::Object(o))
        }
        (out, _) => out,
    };
    let tokens = out.as_ref().map(super::tokens::scan);
    if let Some(t) = &tokens {
        if !t.malformed.is_empty() {
            errors.add(
                "data",
                format!(
                    "These placeholders are not valid: {}",
                    t.malformed.join(", ")
                ),
            );
        }
        if !get(collection).is_some_and(|c| c.financial) && (!t.rate_keys.is_empty() || t.uses_calc)
        {
            errors.add(
                "data",
                "Rate placeholders can only be used in schemes, loans and product pages.",
            );
        }
        if t.uses_calc && collection != "deposit_scheme" {
            errors.add(
                "data",
                "{calc} placeholders can only be used in deposit schemes.",
            );
        }
    }
    match out {
        Some(v) if errors.is_empty() => Ok(v),
        _ => Err(errors),
    }
}

/// Keys a translation may never carry: they decide structure, links and money, not wording.
const OVERLAY_FORBIDDEN: &[&str] = &[
    "slug",
    "code",
    "rateKey",
    "calc",
    "kind",
    "order",
    "id",
    "language",
    "icon",
    "image",
    "src",
    "photo",
    "cover",
    "href",
    "featured",
    "published",
    "date",
];
const OVERLAY_MAX_DEPTH: usize = 8;
const OVERLAY_MAX_TEXT: usize = 20_000;

static HTML_TAG: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"</?[a-zA-Z][^>]*>").unwrap());

/// Checks and cleans a translation overlay: only text, lists and groups of text; no numbers, links or
/// structural keys; markup in text goes through the same sanitiser as English rich text.
fn check_overlay(value: &Value, errors: &mut FieldErrors) -> Option<Value> {
    fn walk(v: &Value, depth: usize, path: &str, errors: &mut FieldErrors) -> Option<Value> {
        if depth > OVERLAY_MAX_DEPTH {
            errors.add(
                "mr",
                format!("The Marathi text is nested too deeply at {path}."),
            );
            return None;
        }
        match v {
            Value::String(s) => {
                if s.chars().count() > OVERLAY_MAX_TEXT {
                    errors.add("mr", format!("The Marathi text at {path} is too long."));
                    return None;
                }
                let s = if HTML_TAG.is_match(s) {
                    sanitize_html(s)
                } else {
                    s.clone()
                };
                if s.trim().is_empty() {
                    None
                } else {
                    Some(Value::String(s))
                }
            }
            Value::Array(items) => {
                // Positions must line up with the English list, so empty entries stay as empty objects.
                let cleaned: Vec<Value> = items
                    .iter()
                    .enumerate()
                    .map(|(i, x)| {
                        walk(x, depth + 1, &format!("{path}.{i}"), errors)
                            .unwrap_or(Value::Object(Default::default()))
                    })
                    .collect();
                if cleaned
                    .iter()
                    .all(|c| c.as_object().is_some_and(|o| o.is_empty()))
                {
                    None
                } else {
                    Some(Value::Array(cleaned))
                }
            }
            Value::Object(map) => {
                let mut out = serde_json::Map::new();
                for (k, x) in map {
                    if OVERLAY_FORBIDDEN.contains(&k.as_str()) {
                        errors.add(
                            "mr",
                            format!(
                                "\"{k}\" cannot be translated; it is the same in every language."
                            ),
                        );
                        continue;
                    }
                    if let Some(c) = walk(x, depth + 1, &format!("{path}.{k}"), errors) {
                        out.insert(k.clone(), c);
                    }
                }
                if out.is_empty() {
                    None
                } else {
                    Some(Value::Object(out))
                }
            }
            Value::Null => None,
            Value::Number(_) | Value::Bool(_) => {
                errors.add("mr", format!("The Marathi content at {path} must be text."));
                None
            }
        }
    }
    if !value.is_object() {
        errors.add("mr", "The Marathi content must be an object.");
        return None;
    }
    walk(value, 0, "mr", errors)
}

/// The slug or code an item's URL is built from, which must match the item's slug.
pub fn natural_slug(collection: &str, data: &Value) -> Option<String> {
    match collection {
        "deposit_scheme" | "loan" => data.get("slug").and_then(Value::as_str).map(str::to_owned),
        "branch" => data
            .get("code")
            .and_then(Value::as_str)
            .map(|c| c.to_lowercase()),
        _ => None,
    }
}

// ------------------------------------------------------------------------------------------------
// Schemas
// ------------------------------------------------------------------------------------------------

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Address {
    line1: String,
    line2: String,
    city: String,
    pin: String,
    state: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LinkItem {
    label: String,
    href: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Social {
    label: String,
    icon: String,
    href: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SiteSettings {
    name: String,
    legal_name: String,
    name_mr: String,
    tagline: String,
    tagline_mr: String,
    url: String,
    description: String,
    registration: String,
    act: String,
    founded: i32,
    operations_since: i32,
    ifsc: String,
    phone: String,
    phone_href: String,
    email: String,
    hr_email: String,
    address: Address,
    map_embed: String,
    map_link: String,
    app_url: String,
    about_video: String,
    foundation_url: String,
    social: Vec<Social>,
    head_office_code: String,
}

impl Check for SiteSettings {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        for (f, v, m) in [
            ("name", &self.name, 80),
            ("legalName", &self.legal_name, 160),
            ("tagline", &self.tagline, 120),
            ("registration", &self.registration, 60),
            ("ifsc", &self.ifsc, 11),
            ("phone", &self.phone, 30),
        ] {
            cx.req(f, v, m);
        }
        cx.req("description", &self.description, 320);
        for (f, e) in [("email", &self.email), ("hrEmail", &self.hr_email)] {
            if !crate::text::valid_email(e) {
                cx.errors.add(f, "Enter a valid email address.");
            }
        }
        if !self.phone_href.starts_with("tel:+") {
            cx.errors
                .add("phoneHref", "Use the form tel:+91XXXXXXXXXX.");
        }
        if !EMBED_MAPS.is_match(&self.map_embed) {
            cx.errors.add(
                "mapEmbed",
                "Paste a Google Maps “embed” link (https://www.google.com/maps/embed?…).",
            );
        }
        if !EMBED_YOUTUBE.is_match(&self.about_video) {
            cx.errors.add(
                "aboutVideo",
                "Paste a YouTube embed link (https://www.youtube.com/embed/…).",
            );
        }
        for (f, u) in [
            ("url", &self.url),
            ("mapLink", &self.map_link),
            ("appUrl", &self.app_url),
            ("foundationUrl", &self.foundation_url),
        ] {
            cx.link(f, u);
        }
        for s in &self.social {
            cx.link("social", &s.href);
            cx.icon("social", &s.icon);
        }
        if !(1900..=2100).contains(&self.founded) {
            cx.errors.add("founded", "Enter a valid year.");
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Stat {
    value: i64,
    prefix: String,
    suffix: String,
    label: String,
    sub: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    as_of: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Announcement {
    enabled: bool,
    label: String,
    text: String,
    href: String,
    link_text: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Home {
    stats: Vec<Stat>,
    announcement: Announcement,
}

impl Check for Home {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        if self.stats.len() != 4 {
            cx.errors
                .add("stats", "The homepage shows exactly four statistics.");
        }
        for s in &self.stats {
            cx.req("stats", &s.label, 40);
            cx.max("stats", &s.sub, 80);
            if s.value < 0 {
                cx.errors.add("stats", "Statistics cannot be negative.");
            }
            if let Some(d) = &s.as_of {
                cx.date("stats", d);
            }
        }
        if self.announcement.enabled {
            cx.req("announcement.text", &self.announcement.text, 160);
            cx.req("announcement.linkText", &self.announcement.link_text, 40);
            cx.link("announcement.href", &self.announcement.href);
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NavChild {
    label: String,
    href: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    desc: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    icon: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NavItem {
    label: String,
    href: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    children: Option<Vec<NavChild>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    mega: Option<bool>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FooterLinks {
    quick: Vec<LinkItem>,
    other: Vec<LinkItem>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Navigation {
    nav: Vec<NavItem>,
    footer_links: FooterLinks,
}

impl Check for Navigation {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        if self.nav.is_empty() || self.nav.len() > 9 {
            cx.errors
                .add("nav", "The main menu needs between 1 and 9 items.");
        }
        for item in &self.nav {
            cx.req("nav", &item.label, 30);
            cx.link("nav", &item.href);
            if item.mega == Some(true) && item.children.is_some() {
                cx.errors.add(
                    "nav",
                    "A menu item is either a product mega-menu or a dropdown, not both.",
                );
            }
            for c in item.children.iter().flatten() {
                cx.req("nav", &c.label, 40);
                cx.link("nav", &c.href);
                if let Some(i) = &c.icon {
                    cx.icon("nav", i);
                }
            }
        }
        for l in self
            .footer_links
            .quick
            .iter()
            .chain(&self.footer_links.other)
        {
            cx.req("footerLinks", &l.label, 40);
            cx.link("footerLinks", &l.href);
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Person {
    name: String,
    role: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    photo: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    bio: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct People {
    chairman: Person,
    mentor: Person,
    board: Vec<Person>,
}

impl Check for People {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        if self.chairman.photo.is_none() {
            cx.errors
                .add("chairman.photo", "The chairman needs a portrait.");
        }
        for p in std::iter::once(&self.chairman)
            .chain(std::iter::once(&self.mentor))
            .chain(&self.board)
        {
            cx.req("people", &p.name, 100);
            cx.req("people", &p.role, 80);
            if let Some(ph) = &p.photo {
                cx.asset("people", ph);
            }
            if let Some(b) = &p.bio {
                cx.max("people", b, 2000);
            }
        }
        for p in &self.board {
            if p.photo.is_none() {
                cx.errors
                    .add("board", "Every board member needs a portrait.");
            }
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct FaqItem {
    q: String,
    a: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Faq {
    items: Vec<FaqItem>,
}

impl Check for Faq {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        for i in &mut self.items {
            cx.req("items", &i.q, 300);
            i.a = sanitize_html(&i.a);
            cx.req("items", &i.a, 6000);
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Service {
    icon: String,
    title: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    image: Option<String>,
    text: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RwmCategory {
    icon: String,
    title: String,
    title_mr: String,
    items: Vec<Vec<String>>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Services {
    services: Vec<Service>,
    rwm_categories: Vec<RwmCategory>,
}

impl Check for Services {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        for s in &self.services {
            cx.icon("services", &s.icon);
            cx.req("services", &s.title, 60);
            cx.req("services", &s.text, 400);
            if let Some(i) = &s.image {
                cx.asset("services", i);
            }
        }
        for c in &self.rwm_categories {
            cx.icon("rwmCategories", &c.icon);
            cx.req("rwmCategories", &c.title, 60);
            if c.items.iter().any(|row| row.is_empty() || row.len() > 2) {
                cx.errors.add(
                    "rwmCategories",
                    "Each row needs an English and an optional Marathi label.",
                );
            }
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Pillar {
    icon: String,
    title: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Initiative {
    icon: String,
    title: String,
    stat: String,
    text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    link: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    image: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Csr {
    pillars: Vec<Pillar>,
    initiatives: Vec<Initiative>,
}

impl Check for Csr {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        for p in &self.pillars {
            cx.icon("pillars", &p.icon);
            cx.req("pillars", &p.title, 60);
        }
        for i in &self.initiatives {
            cx.icon("initiatives", &i.icon);
            cx.req("initiatives", &i.title, 80);
            cx.req("initiatives", &i.text, 600);
            if let Some(l) = &i.link {
                cx.link("initiatives", l);
            }
            if let Some(im) = &i.image {
                cx.asset("initiatives", im);
            }
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Benefit {
    icon: String,
    title: String,
    text: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DepositPage {
    special_categories: String,
    documents: Vec<String>,
    benefits: Vec<Benefit>,
}

impl Check for DepositPage {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        cx.req("specialCategories", &self.special_categories, 400);
        for d in &self.documents {
            cx.req("documents", d, 120);
        }
        for b in &self.benefits {
            cx.icon("benefits", &b.icon);
            cx.req("benefits", &b.title, 60);
            cx.req("benefits", &b.text, 200);
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LoanPage {
    benefits: Vec<Benefit>,
    extra_form_types: Vec<String>,
}

impl Check for LoanPage {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        for b in &self.benefits {
            cx.icon("benefits", &b.icon);
            cx.req("benefits", &b.title, 60);
        }
        for t in &self.extra_form_types {
            cx.req("extraFormTypes", t, 60);
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LabelValue {
    label: String,
    value: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SchemeCalc {
    mode: String,
    amount: i64,
    months: i32,
    rate_key: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DepositScheme {
    slug: String,
    name: String,
    name_mr: String,
    kind: String,
    rate_note: String,
    pitch: String,
    intro: String,
    facts: Vec<LabelValue>,
    highlight: Vec<LabelValue>,
    features: Vec<String>,
    eligibility: String,
    image: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    image_alt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    featured: Option<bool>,
    rate_key: Option<String>,
    calc: SchemeCalc,
    order: i32,
}

impl Check for DepositScheme {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        if !is_slug(&self.slug) {
            cx.errors
                .add("slug", "Use lowercase letters, numbers and dashes.");
        }
        cx.req("name", &self.name, 80);
        cx.req("nameMr", &self.name_mr, 80);
        cx.req("pitch", &self.pitch, 160);
        cx.req("intro", &self.intro, 1200);
        cx.req("eligibility", &self.eligibility, 600);
        cx.asset("image", &self.image);
        if !["fd", "rd", "monthly", "double"].contains(&self.kind.as_str()) {
            cx.errors
                .add("kind", "Choose FD, RD, monthly income or doubling.");
        }
        if self.kind != "double" && self.rate_key.is_none() {
            cx.errors
                .add("rateKey", "Link the scheme to a rate in the rate set.");
        }
        if !["fd", "rd", "monthly"].contains(&self.calc.mode.as_str()) {
            cx.errors.add(
                "calc.mode",
                "Choose the FD, RD or monthly income calculator.",
            );
        }
        if !(1..=1_000_000_000).contains(&self.calc.amount) {
            cx.errors
                .add("calc.amount", "Enter an example amount in rupees.");
        }
        if !(1..=240).contains(&self.calc.months) {
            cx.errors
                .add("calc.months", "Enter a tenure between 1 and 240 months.");
        }
        if self.facts.len() > 12 || self.highlight.len() > 3 {
            cx.errors
                .add("facts", "Use at most 12 key facts and 3 highlights.");
        }
        for f in self.facts.iter().chain(&self.highlight) {
            cx.req("facts", &f.label, 40);
            cx.req("facts", &f.value, 120);
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Loan {
    slug: String,
    name: String,
    icon: String,
    image: String,
    rate: String,
    amount: String,
    summary: String,
    details: Vec<LabelValue>,
    rate_key: String,
    show_in_form: bool,
    order: i32,
}

impl Check for Loan {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        if !is_slug(&self.slug) {
            cx.errors
                .add("slug", "Use lowercase letters, numbers and dashes.");
        }
        cx.req("name", &self.name, 80);
        cx.icon("icon", &self.icon);
        cx.asset("image", &self.image);
        cx.req("rate", &self.rate, 80);
        cx.req("amount", &self.amount, 60);
        cx.req("summary", &self.summary, 300);
        for d in &self.details {
            cx.req("details", &d.label, 40);
            cx.req("details", &d.value, 200);
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GeoPoint {
    lat: f64,
    lng: f64,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Branch {
    code: String,
    name: String,
    region: String,
    head_office: bool,
    address: String,
    phones: Vec<String>,
    active: bool,
    order: i32,
    region_order: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    email: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    map: Option<GeoPoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    hours: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    manager: Option<String>,
}

static BRANCH_CODE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Z0-9-]{2,20}$").unwrap());

impl Check for Branch {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        self.code = self.code.trim().to_uppercase();
        if !BRANCH_CODE.is_match(&self.code) {
            cx.errors
                .add("code", "Use 2–20 capital letters, numbers or dashes.");
        }
        cx.req("name", &self.name, 80);
        cx.req("region", &self.region, 60);
        cx.req("address", &self.address, 300);
        if self.phones.is_empty() {
            cx.errors.add("phones", "Add at least one phone number.");
        }
        for p in &self.phones {
            if crate::text::normalize_phone(p).is_none() {
                cx.errors
                    .add("phones", format!("{p} is not a valid phone number."));
            }
        }
        if let Some(e) = &self.email {
            if !crate::text::valid_email(e) {
                cx.errors.add("email", "Enter a valid email address.");
            }
        }
        if let Some(m) = &self.map {
            // India's bounding box, roughly.
            if !(6.0..=37.5).contains(&m.lat) || !(68.0..=97.5).contains(&m.lng) {
                cx.errors.add("map", "These coordinates are outside India.");
            }
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(untagged)]
enum PostId {
    Number(Number),
    Text(String),
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Post {
    id: PostId,
    slug: String,
    title: String,
    date: String,
    image: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    image_alt: Option<String>,
    excerpt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    language: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    category: Option<String>,
    order: i32,
}

impl Check for Post {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        if self.slug.is_empty() || self.slug.len() > 200 || self.slug.contains(['/', '?', '#', ' '])
        {
            cx.errors
                .add("slug", "Use a short web address without spaces or slashes.");
        }
        cx.req("title", &self.title, 200);
        cx.date("date", &self.date);
        cx.max("excerpt", &self.excerpt, 400);
        if let Some(i) = &self.image {
            cx.asset("image", i);
        }
        if let Some(c) = &mut self.content {
            *c = sanitize_html(c);
            cx.max("content", c, 100_000);
        }
        if !["en", "mr"].contains(&self.language.as_str()) {
            cx.errors.add("language", "Choose English or Marathi.");
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NoticeItem {
    label: String,
    href: String,
    kind: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Notice {
    title: String,
    category: String,
    date: String,
    pinned: bool,
    items: Vec<NoticeItem>,
    order: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    expires: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    language: Option<String>,
}

impl Check for Notice {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        cx.req("title", &self.title, 200);
        cx.req("category", &self.category, 40);
        cx.date("date", &self.date);
        if let Some(e) = &self.expires {
            cx.date("expires", e);
            if e.as_str() < self.date.as_str() {
                cx.errors
                    .add("expires", "The expiry date must be after the notice date.");
            }
        }
        for i in &self.items {
            cx.req("items", &i.label, 200);
            cx.link("items", &i.href);
            if !["pdf", "page", "drive", "link"].contains(&i.kind.as_str()) {
                cx.errors.add(
                    "items",
                    "Each item is a PDF, a page, a Google Drive file or a link.",
                );
            }
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Document {
    category: String,
    title: String,
    year: Option<String>,
    cover: Option<String>,
    href: Option<String>,
    size_mb: Option<Number>,
    order: i32,
}

impl Check for Document {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        if !["annual-report", "member-list", "form"].contains(&self.category.as_str()) {
            cx.errors
                .add("category", "Choose annual report, member list or form.");
        }
        cx.req("title", &self.title, 120);
        if self.category == "annual-report" && self.year.as_deref().is_none_or(str::is_empty) {
            cx.errors.add(
                "year",
                "Annual reports need a financial year, e.g. 2024–25.",
            );
        }
        if let Some(c) = &self.cover {
            cx.asset("cover", c);
        }
        if let Some(h) = &self.href {
            cx.link("href", h);
        }
        if self.category != "annual-report" && self.href.is_none() {
            cx.errors.add("href", "Attach the document file.");
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GalleryImage {
    src: String,
    caption: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    alt: Option<String>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GalleryAlbum {
    title: String,
    date: Option<String>,
    description: String,
    images: Vec<GalleryImage>,
    order: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cover: Option<String>,
}

impl Check for GalleryAlbum {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        cx.req("title", &self.title, 120);
        cx.max("description", &self.description, 600);
        if let Some(d) = &self.date {
            cx.date("date", d);
        }
        for i in &self.images {
            cx.asset("images", &i.src);
            cx.max("images", &i.caption, 200);
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct JobOpening {
    icon: String,
    title: String,
    text: String,
    location: String,
    open: bool,
    order: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    employment_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    closing_date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    requirements: Option<String>,
}

impl Check for JobOpening {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        cx.icon("icon", &self.icon);
        cx.req("title", &self.title, 80);
        cx.req("text", &self.text, 400);
        cx.max("location", &self.location, 80);
        if self.title == "Other" {
            cx.errors
                .add("title", "“Other” is reserved for the application form.");
        }
        if let Some(d) = &self.closing_date {
            cx.date("closingDate", d);
        }
        if let Some(r) = &mut self.requirements {
            *r = sanitize_html(r);
        }
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Redirect {
    from: String,
    to: String,
    status: u16,
    reason: String,
    order: i32,
}

impl Check for Redirect {
    fn check(&mut self, cx: &mut Ctx<'_>) {
        if !self.from.starts_with('/')
            || self.from.starts_with("//")
            || self.from.contains(['?', '#', ' ', '*'])
        {
            cx.errors.add(
                "from",
                "Use an old path starting with /, without query strings.",
            );
        }
        cx.link("to", &self.to);
        if self.from.trim_end_matches('/') == self.to.trim_end_matches('/') {
            cx.errors.add("to", "A redirect cannot point to itself.");
        }
        if ![301, 302].contains(&self.status) {
            cx.errors
                .add("status", "Use 301 (permanent) or 302 (temporary).");
        }
        cx.req("reason", &self.reason, 200);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn marathi_overlay_keeps_text_and_refuses_structure() {
        let seed: Value =
            serde_json::from_str(include_str!("../../../frontend/seed/snapshot.json")).unwrap();
        let base = seed["collections"]["notice"][0]["data"].clone();
        let mut with = base.clone();
        with["mr"] = json!({
            "title": "<p onclick=\"x()\">सूचना <b>महत्त्वाची</b></p><script>alert(1)</script>",
            "items": [{ "label": "कार्यक्रम" }]
        });
        let out = validate("notice", with).unwrap_or_else(|e| panic!("{:?}", e.0));
        let title = out["mr"]["title"].as_str().unwrap();
        assert!(
            title.contains("महत्त्वाची") && !title.contains("script") && !title.contains("onclick")
        );
        assert_eq!(out["mr"]["items"][0]["label"], "कार्यक्रम");

        let mut bad = base.clone();
        bad["mr"] = json!({ "kind": "pdf", "title": "सूचना" });
        assert!(validate("notice", bad).is_err());
        let mut numbers = base.clone();
        numbers["mr"] = json!({ "title": 5 });
        assert!(validate("notice", numbers).is_err());
        // Picture captions can be translated, the pictures themselves cannot.
        let album = seed["collections"]["gallery_album"][0]["data"].clone();
        let mut captions = album.clone();
        captions["mr"] = json!({ "images": [{ "caption": "स्वच्छता अभियान" }] });
        let out = validate("gallery_album", captions).unwrap_or_else(|e| panic!("{:?}", e.0));
        assert_eq!(out["mr"]["images"][0]["caption"], "स्वच्छता अभियान");
        let mut moved = album;
        moved["mr"] = json!({ "images": [{ "src": "/images/other.webp" }] });
        assert!(validate("gallery_album", moved).is_err());

        let mut empty = base;
        empty["mr"] = json!({ "title": "  " });
        let out = validate("notice", empty).unwrap();
        assert!(out.get("mr").is_none());
    }

    #[test]
    fn every_seed_item_validates() {
        let seed: Value =
            serde_json::from_str(include_str!("../../../frontend/seed/snapshot.json"))
                .expect("seed parses");
        for (name, data) in seed["singletons"].as_object().unwrap() {
            let cleaned =
                validate(name, data.clone()).unwrap_or_else(|e| panic!("{name}: {:?}", e.0));
            if name != "faq" {
                assert_eq!(&cleaned, data, "{name} round-trips unchanged");
            }
        }
        for (name, items) in seed["collections"].as_object().unwrap() {
            for item in items.as_array().unwrap() {
                let cleaned = validate(name, item["data"].clone())
                    .unwrap_or_else(|e| panic!("{name}/{}: {:?}", item["slug"], e.0));
                if name != "post" {
                    assert_eq!(
                        cleaned, item["data"],
                        "{name}/{} round-trips unchanged",
                        item["slug"]
                    );
                }
            }
        }
    }

    #[test]
    fn unsafe_content_is_rejected_or_cleaned() {
        assert_eq!(
            sanitize_html("<p onclick=\"x()\">Hi<script>alert(1)</script></p>"),
            "<p>Hi</p>"
        );
        let bad = json!({ "from": "/old", "to": "javascript:alert(1)", "status": 301, "reason": "x", "order": 1 });
        assert!(validate("redirect", bad).is_err());
        let extra = json!({ "from": "/old", "to": "/new/", "status": 301, "reason": "x", "order": 1, "html": "<b>" });
        assert!(
            validate("redirect", extra).is_err(),
            "unknown fields are refused"
        );
        let loop_ =
            json!({ "from": "/same/", "to": "/same", "status": 301, "reason": "x", "order": 1 });
        assert!(validate("redirect", loop_).is_err());
    }

    #[test]
    fn rate_tokens_only_in_financial_content() {
        let job = json!({ "icon": "users", "title": "Clerk", "text": "Earn {rate:fd.365-plus.regular}%", "location": "", "open": true, "order": 1 });
        assert!(validate("job_opening", job).is_err());
    }
}
