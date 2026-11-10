// verify-redirect-graph: every URL a visitor can type, up to a bound, through the real `app()` router.
// Appended to a scratch copy of src/main.rs by check.sh (never to the repo):
//   #[cfg(test)] #[path = "redirect_graph.rs"] mod redirect_graph;
// Each request goes through the full router (http_policy, CompressionLayer, routes, ServeDir, fallback),
// and every redirect is followed like a browser does, up to MAX_HOPS.
use super::*;
use axum::{
    body::{to_bytes, Body},
    http::{Method, Request},
};
use std::collections::BTreeMap;
use tower::ServiceExt;

const SEGMENTS: &[&str] = &[
    "", "fr", "FR", "en", "concept", "concept-spatial", "legal-notice", "mentions-legales",
    "static", "styles.css", "favicon.svg", "x", "..", "%2e%2e", "%2F", "src", "main.rs",
];
const HOSTS: &[&str] = &["antoinelaborderie.com", "www.antoinelaborderie.com", "WWW.antoinelaborderie.com:443"];
const QUERIES: &[&str] = &["", "?utm_source=x&v=1"];
const MAX_HOPS: usize = 4;
const PAGES: &[&str] = &["/", "/fr", "/legal-notice", "/fr/mentions-legales"];

#[allow(dead_code)]
struct Hop {
    status: StatusCode,
    location: Option<String>,
    cache: String,
    hsts: bool,
    body: String,
}

async fn send(method: Method, host: &str, target: &str) -> Hop {
    let response = app()
        .oneshot(Request::builder().method(method).uri(target).header(header::HOST, host).body(Body::empty()).unwrap())
        .await
        .unwrap();
    let h = response.headers();
    let hop = |name| h.get(name).map(|v: &HeaderValue| v.to_str().unwrap_or("<non-ascii>").to_owned());
    let (status, location, cache, hsts) = (
        response.status(),
        hop(header::LOCATION),
        hop(header::CACHE_CONTROL).unwrap_or_default(),
        hop(header::STRICT_TRANSPORT_SECURITY).as_deref() == Some("max-age=31536000"),
    );
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    Hop { status, location, cache, hsts, body: String::from_utf8_lossy(&body).into_owned() }
}

fn lang_of_path(path: &str) -> &'static str {
    if path == "/fr" || path.starts_with("/fr/") { "fr" } else { "en" }
}

#[tokio::test]
async fn redirect_graph() {
    let mut targets = vec![];
    for a in SEGMENTS {
        targets.push(format!("/{a}"));
        for b in SEGMENTS {
            targets.push(format!("/{a}/{b}"));
            for c in ["", "fr", "styles.css", "x", ".."] {
                targets.push(format!("/{a}/{b}/{c}"));
            }
        }
    }
    targets.sort();
    targets.dedup();
    // Bytes of every file under static/ (cargo test runs in the crate root, like ServeDir::new("static")).
    let static_files: Vec<String> = std::fs::read_dir("static")
        .unwrap()
        .map(|e| String::from_utf8_lossy(&std::fs::read(e.unwrap().path()).unwrap()).into_owned())
        .collect();
    // rule -> (count, first example)
    let mut broken: BTreeMap<&str, (usize, String)> = BTreeMap::new();
    let mut note = |rule: &'static str, example: String| {
        let e = broken.entry(rule).or_insert((0, example));
        e.0 += 1;
    };
    let mut requests = 0usize;
    for host in HOSTS {
        for query in QUERIES {
            for start in &targets {
                let first = format!("{start}{query}");
                let (mut host_now, mut target) = (host.to_string(), first.clone());
                let mut seen = vec![];
                let mut hops = 0;
                loop {
                    requests += 1;
                    let hop = send(Method::GET, &host_now, &target).await;
                    let example = format!("Host {host} GET {first} ... hop {hops}: {target} -> {}", hop.status);
                    if !hop.hsts { note("EveryResponseHasHsts", example.clone()); }
                    if (hop.status.is_client_error() || hop.status.is_server_error()) && hop.cache != "no-store" {
                        note("ErrorsAreNeverCached", format!("{example} cache-control {}", hop.cache));
                    }
                    if hop.status.is_server_error() { note("NoServerError", example.clone()); }
                    let path = target.split('?').next().unwrap().to_owned();
                    if hop.status == StatusCode::NOT_FOUND && host_now == "antoinelaborderie.com" && hop.body.contains("<html") {
                        let lang = if hop.body.contains("<html lang=\"fr\"") { "fr" } else { "en" };
                        let want = if path.starts_with("/fr/") || path.starts_with("/static/fr/") { "fr" } else { "en" };
                        if lang != want { note("NotFoundPageSpeaksTheUrlLanguage", format!("{example} page lang {lang}")); }
                    }
                    if hop.status == StatusCode::OK && !PAGES.contains(&path.as_str()) && !path.starts_with("/static/")
                        && !["/robots.txt", "/sitemap.xml", "/favicon.ico"].contains(&path.as_str()) {
                        note("OnlyKnownPagesAnswer200", example.clone());
                    }
                    if hop.status == StatusCode::OK && path.starts_with("/static/") && !static_files.contains(&hop.body) {
                        note("StaticServesOnlyFilesUnderStatic", example.clone());
                    }
                    if !hop.status.is_redirection() { break; }
                    let Some(location) = hop.location else { note("RedirectHasLocation", example.clone()); break; };
                    let next = if let Some(rest) = location.strip_prefix(SITE_URL) {
                        host_now = "antoinelaborderie.com".into();
                        rest.to_owned()
                    } else if location.starts_with('/') && !location.starts_with("//") {
                        location.clone()
                    } else {
                        note("RedirectsStayOnSite", format!("{example} Location {location}"));
                        break;
                    };
                    let next_path = next.split('?').next().unwrap();
                    if lang_of_path(next_path) != lang_of_path(&path) && lang_of_path(&path) == "fr" && PAGES.contains(&next_path) {
                        note("RedirectsKeepTheLanguage", format!("{example} Location {location}"));
                    }
                    if !query.is_empty() && !next.ends_with(query) {
                        note("RedirectsKeepTheQuery", format!("{example} Location {location}"));
                    }
                    hops += 1;
                    if seen.contains(&(host_now.clone(), next.clone())) { note("NoRedirectLoop", example.clone()); break; }
                    seen.push((host_now.clone(), next.clone()));
                    if hops > 2 { note("AtMostTwoRedirects", example.clone()); }
                    if hops >= MAX_HOPS { break; }
                    target = next;
                }
            }
        }
    }
    println!("ENUMERATED {} start URLs, {requests} requests", targets.len() * HOSTS.len() * QUERIES.len());
    for (rule, (count, example)) in &broken {
        println!("BROKEN {rule} {count}x, e.g. {example}");
    }
}
