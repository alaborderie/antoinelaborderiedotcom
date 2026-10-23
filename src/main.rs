use askama::Template;
use axum::{
    extract::Request,
    http::{header, uri::Authority, HeaderValue, StatusCode, Uri},
    middleware::{self, Next},
    response::{Html, IntoResponse, Redirect, Response},
    routing::get,
    Router,
};
use tower_http::{compression::CompressionLayer, services::ServeDir};

const SITE_URL: &str = "https://antoinelaborderie.com";
// Content revision date, not the date of the request or build.
const LAST_MODIFIED: &str = "2026-10-23";
// Bump when CSS, JavaScript or social images change, including same-day releases.
const ASSET_VERSION: &str = "2026-10-23-1";

#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    asset_version: &'static str,
    lang: &'static str,
    title: &'static str,
    description: &'static str,
    canonical: &'static str,
    og_locale: &'static str,
    og_image_alt: &'static str,
    is_french: bool,
    json_ld: &'static str,
}

#[derive(Template)]
#[template(path = "legal.html")]
struct LegalTemplate {
    asset_version: &'static str,
    is_french: bool,
    canonical: &'static str,
}

#[derive(Template)]
#[template(path = "404.html")]
struct NotFoundTemplate {
    asset_version: &'static str,
    is_french: bool,
}

fn app() -> Router {
    Router::new()
        .route("/", get(english))
        .route("/fr", get(french))
        .route("/legal-notice", get(legal_english))
        .route("/fr/mentions-legales", get(legal_french))
        .route(
            "/legal-notice/",
            get(|| async { Redirect::permanent("/legal-notice") }),
        )
        .route(
            "/fr/mentions-legales/",
            get(|| async { Redirect::permanent("/fr/mentions-legales") }),
        )
        .route("/en", get(|| async { Redirect::permanent("/") }))
        .route("/en/", get(|| async { Redirect::permanent("/") }))
        .route("/fr/", get(|| async { Redirect::permanent("/fr") }))
        .route("/concept", get(|| async { Redirect::permanent("/") }))
        .route("/concept/fr", get(|| async { Redirect::permanent("/fr") }))
        .route("/concept/", get(|| async { Redirect::permanent("/") }))
        .route("/concept/fr/", get(|| async { Redirect::permanent("/fr") }))
        .route(
            "/concept-spatial",
            get(|| async { Redirect::permanent("/") }),
        )
        .route(
            "/concept-spatial/fr",
            get(|| async { Redirect::permanent("/fr") }),
        )
        .route(
            "/concept-spatial/",
            get(|| async { Redirect::permanent("/") }),
        )
        .route(
            "/concept-spatial/fr/",
            get(|| async { Redirect::permanent("/fr") }),
        )
        .route("/robots.txt", get(robots))
        .route("/sitemap.xml", get(sitemap))
        .route("/favicon.ico", get(favicon))
        .nest_service(
            "/static",
            ServeDir::new("static").not_found_service(get(not_found)),
        )
        .fallback(not_found)
        .layer(CompressionLayer::new())
        .layer(middleware::from_fn(http_policy))
}

async fn http_policy(request: Request, next: Next) -> Response {
    let is_static = request.uri().path().starts_with("/static/");
    let is_www = request
        .headers()
        .get(header::HOST)
        .and_then(|host| host.to_str().ok())
        .and_then(|host| host.parse::<Authority>().ok())
        .is_some_and(|host| {
            host.host()
                .eq_ignore_ascii_case("www.antoinelaborderie.com")
        });

    let mut response = if is_www {
        let path = request
            .uri()
            .path_and_query()
            .map_or("/", |path| path.as_str());
        (
            StatusCode::MOVED_PERMANENTLY,
            [(header::LOCATION, format!("{SITE_URL}{path}"))],
        )
            .into_response()
    } else {
        next.run(request).await
    };

    // TLS terminates upstream. Do not redirect by URI scheme here.
    response.headers_mut().insert(
        header::STRICT_TRANSPORT_SECURITY,
        HeaderValue::from_static("max-age=31536000"),
    );
    let cache = if response.status().is_client_error() || response.status().is_server_error() {
        "no-store"
    } else if is_static {
        // Templates version asset URLs; old query versions still resolve to the
        // current files, so keep a bounded lifetime rather than immutable caching.
        "public, max-age=86400"
    } else {
        "public, max-age=300"
    };
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static(cache));
    response
}

#[tokio::main]
async fn main() {
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!(
        "Server running at http://{}",
        listener.local_addr().unwrap()
    );
    axum::serve(listener, app()).await.unwrap();
}

async fn english() -> Response {
    render(IndexTemplate {
        asset_version: ASSET_VERSION,
        lang: "en",
        title: "Freelance DevEx & AI Engineer, Agentic Coding | Antoine Laborderie",
        description: "Freelance full-stack engineer in Bordeaux, France: agentic coding workflows, AI integration, developer tooling. Fixed-price projects, English or French.",
        canonical: "https://antoinelaborderie.com/",
        og_locale: "en_GB",
        og_image_alt: "Antoine Laborderie — Full-stack engineer · DevEx & AI · Agentic coding",
        is_french: false,
        json_ld: include_str!("structured_data/en.json"),
    })
}
async fn french() -> Response {
    render(IndexTemplate {
        asset_version: ASSET_VERSION,
        lang: "fr",
        title: "Développeur freelance Bordeaux · DevEx & IA, agentic coding | Antoine Laborderie",
        description: "Développeur Full Stack freelance à Bordeaux\u{a0}: workflows d’agentic coding, intégration IA, outillage DevEx (Backstage, Kubernetes). Projets au forfait.",
        canonical: "https://antoinelaborderie.com/fr",
        og_locale: "fr_FR",
        og_image_alt: "Antoine Laborderie — Développeur Full Stack · DevEx & IA · Agentic coding",
        is_french: true,
        json_ld: include_str!("structured_data/fr.json"),
    })
}

async fn legal_english() -> Response {
    render(LegalTemplate {
        asset_version: ASSET_VERSION,
        is_french: false,
        canonical: "https://antoinelaborderie.com/legal-notice",
    })
}

async fn legal_french() -> Response {
    render(LegalTemplate {
        asset_version: ASSET_VERSION,
        is_french: true,
        canonical: "https://antoinelaborderie.com/fr/mentions-legales",
    })
}

async fn not_found(uri: Uri) -> Response {
    let mut response = render(NotFoundTemplate {
        asset_version: ASSET_VERSION,
        is_french: uri.path().starts_with("/fr/"),
    });
    if response.status().is_success() {
        *response.status_mut() = StatusCode::NOT_FOUND;
    }
    response
}

fn render(template: impl Template) -> Response {
    match template.render() {
        Ok(body) => Html(body).into_response(),
        Err(error) => {
            eprintln!("Template rendering failed: {error}");
            StatusCode::INTERNAL_SERVER_ERROR.into_response()
        }
    }
}

async fn robots() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "text/plain; charset=utf-8")],
        format!("User-agent: *\nAllow: /\nSitemap: {SITE_URL}/sitemap.xml\n"),
    )
}
async fn sitemap() -> impl IntoResponse {
    let entries = [
        ("/", "/", "/fr"),
        ("/fr", "/", "/fr"),
        ("/legal-notice", "/legal-notice", "/fr/mentions-legales"),
        ("/fr/mentions-legales", "/legal-notice", "/fr/mentions-legales"),
    ].map(|(path, en, fr)| format!(
        r#"<url><loc>{SITE_URL}{path}</loc><lastmod>{LAST_MODIFIED}</lastmod><xhtml:link rel="alternate" hreflang="en" href="{SITE_URL}{en}"/><xhtml:link rel="alternate" hreflang="fr" href="{SITE_URL}{fr}"/><xhtml:link rel="alternate" hreflang="x-default" href="{SITE_URL}{en}"/></url>"#
    )).join("\n");
    (
        [(header::CONTENT_TYPE, "application/xml; charset=utf-8")],
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
{entries}
</urlset>"#
        ),
    )
}
async fn favicon() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/svg+xml")],
        include_str!("../static/favicon.svg"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::{to_bytes, Body},
        http::Request,
    };
    use tower::ServiceExt;

    async fn request(path: &str) -> (StatusCode, axum::http::HeaderMap, String) {
        let response = app()
            .oneshot(Request::get(path).body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let headers = response.headers().clone();
        let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
        (status, headers, String::from_utf8(body.to_vec()).unwrap())
    }

    #[tokio::test]
    async fn serves_indexable_localized_pages_with_complete_metadata() {
        let (status, _, en) = request("/").await;
        assert_eq!(status, StatusCode::OK);
        assert!(en.contains("<html lang=\"en\""));
        assert!(
            en.contains("Freelance DevEx &#38; AI Engineer, Agentic Coding | Antoine Laborderie")
        );
        assert!(en.contains("I build agentic coding workflows and internal tools"));
        assert!(en.contains("rel=\"canonical\" href=\"https://antoinelaborderie.com/\""));
        assert!(en.contains("property=\"og:type\" content=\"profile\""));
        assert!(en.contains("name=\"twitter:card\" content=\"summary_large_image\""));
        assert!(en.contains("href=\"/fr\""));
        assert!(!en.contains("noindex"));
        assert_eq!(en.matches("<h1").count(), 1);
        assert_json_ld_is_valid(&en);

        let (status, _, fr) = request("/fr").await;
        assert_eq!(status, StatusCode::OK);
        assert!(fr.contains("<html lang=\"fr\""));
        assert!(fr.contains(
            "Développeur freelance Bordeaux · DevEx &#38; IA, agentic coding | Antoine Laborderie"
        ));
        assert!(fr.contains("Je conçois des workflows d’agentic coding"));
        assert!(fr.contains("rel=\"canonical\" href=\"https://antoinelaborderie.com/fr\""));
        assert!(fr.contains("property=\"og:locale\" content=\"fr_FR\""));
        assert!(fr.contains("href=\"/\""));
        assert!(!fr.contains("noindex"));
        assert_eq!(fr.matches("<h1").count(), 1);
        assert_json_ld_is_valid(&fr);
    }

    #[tokio::test]
    async fn serves_machine_and_public_assets_with_real_404s() {
        let (_, headers, robots) = request("/robots.txt").await;
        assert_eq!(headers[header::CONTENT_TYPE], "text/plain; charset=utf-8");
        assert!(robots.contains("Sitemap:"));
        let (_, headers, sitemap) = request("/sitemap.xml").await;
        assert_eq!(
            headers[header::CONTENT_TYPE],
            "application/xml; charset=utf-8"
        );
        assert!(sitemap.contains("<loc>https://antoinelaborderie.com/fr</loc>"));
        assert!(!sitemap.contains("concept"));
        assert_eq!(request("/favicon.ico").await.0, StatusCode::OK);
        assert_eq!(request("/static/styles.css").await.0, StatusCode::OK);
        assert_eq!(request("/static/main.js").await.0, StatusCode::OK);
        assert_eq!(
            request("/static/concept.css").await.0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(
            request("/static/concept-spatial.js").await.0,
            StatusCode::NOT_FOUND
        );
        assert_eq!(request("/missing").await.0, StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn permanently_redirects_legacy_and_trailing_slash_routes() {
        for (path, location) in [
            ("/en", "/"),
            ("/en/", "/"),
            ("/fr/", "/fr"),
            ("/legal-notice/", "/legal-notice"),
            ("/fr/mentions-legales/", "/fr/mentions-legales"),
            ("/concept", "/"),
            ("/concept/", "/"),
            ("/concept/fr", "/fr"),
            ("/concept/fr/", "/fr"),
            ("/concept-spatial", "/"),
            ("/concept-spatial/", "/"),
            ("/concept-spatial/fr", "/fr"),
            ("/concept-spatial/fr/", "/fr"),
        ] {
            let (status, headers, _) = request(path).await;
            assert_eq!(status, StatusCode::PERMANENT_REDIRECT);
            assert_eq!(headers[header::LOCATION], location);
        }
    }

    #[tokio::test]
    async fn serves_localized_legal_notices_with_publisher_and_host_details() {
        for (path, lang, heading, alternate) in [
            (
                "/legal-notice",
                "en",
                "Legal notice",
                "/fr/mentions-legales",
            ),
            (
                "/fr/mentions-legales",
                "fr",
                "Mentions légales",
                "/legal-notice",
            ),
        ] {
            let (status, _, body) = request(path).await;
            assert_eq!(status, StatusCode::OK);
            for text in [
                heading,
                "Antoine Laborderie",
                "844 240 168 00030",
                "55 rue de la Peloue",
                "33127 Saint-Jean-d’Illac",
                "OVH SAS",
                "2 rue Kellermann",
                "59100 Roubaix",
                "https://www.ovhcloud.com",
                "mailto:antoine.laborderie@gmail.com",
                "Umami",
            ] {
                assert!(body.contains(text), "{path}: missing {text}");
            }
            assert!(body.contains(&format!("<html lang=\"{lang}\"")));
            assert!(body.contains(&format!(
                "rel=\"canonical\" href=\"https://antoinelaborderie.com{path}\""
            )));
            assert!(body.contains(&format!("href=\"{alternate}\"")));
            assert!(!body.contains("TODO"));
        }
    }

    #[tokio::test]
    async fn missing_pages_offer_bilingual_navigation_with_404_status() {
        for path in ["/missing", "/fr/missing", "/static/missing.css"] {
            let (status, headers, body) = request(path).await;
            assert_eq!(status, StatusCode::NOT_FOUND);
            assert_eq!(headers[header::CONTENT_TYPE], "text/html; charset=utf-8");
            assert!(body.contains("Page not found"));
            assert!(body.contains("Page introuvable"));
            assert!(body.contains("href=\"/\""));
            assert!(body.contains("href=\"/fr\""));
            assert!(body.contains("noindex"));
        }
    }

    #[tokio::test]
    async fn redirects_only_www_host_to_apex_preserving_path_and_query() {
        for host in [
            "www.antoinelaborderie.com",
            "WWW.ANTOINELABORDERIE.COM",
            "www.antoinelaborderie.com:443",
        ] {
            let response = app()
                .oneshot(
                    Request::get("/fr?source=www&lang=fr")
                        .header(header::HOST, host)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::MOVED_PERMANENTLY);
            assert_eq!(
                response.headers()[header::LOCATION],
                "https://antoinelaborderie.com/fr?source=www&lang=fr"
            );
            assert_eq!(
                response.headers()[header::STRICT_TRANSPORT_SECURITY],
                "max-age=31536000"
            );
        }
        for host in [
            "antoinelaborderie.com",
            "localhost:3000",
            "www.antoinelaborderie.com.attacker.example",
        ] {
            let response = app()
                .oneshot(
                    Request::get("/")
                        .header(header::HOST, host)
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
            assert!(!response.headers().contains_key(header::LOCATION));
        }
    }

    #[tokio::test]
    async fn sends_security_and_content_appropriate_cache_headers() {
        for (path, cache) in [
            ("/", "public, max-age=300"),
            ("/fr", "public, max-age=300"),
            ("/legal-notice", "public, max-age=300"),
            ("/static/styles.css", "public, max-age=86400"),
            ("/static/main.js", "public, max-age=86400"),
            ("/missing", "no-store"),
            ("/static/missing.css", "no-store"),
        ] {
            let (_, headers, _) = request(path).await;
            assert_eq!(
                headers[header::STRICT_TRANSPORT_SECURITY],
                "max-age=31536000",
                "{path}"
            );
            assert_eq!(headers[header::CACHE_CONTROL], cache, "{path}");
        }
    }

    #[tokio::test]
    async fn links_versioned_assets_on_every_page_and_serves_them_with_caching() {
        let (_, _, home) = request("/").await;
        let version = home
            .split("href=\"/static/styles.css?v=")
            .nth(1)
            .expect("Home stylesheet must have a version query")
            .split('"')
            .next()
            .unwrap();
        assert!(!version.is_empty());
        assert!(version
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-'));

        for path in [
            "/",
            "/fr",
            "/legal-notice",
            "/fr/mentions-legales",
            "/missing",
            "/fr/missing",
            "/static/missing.css",
        ] {
            let (_, _, body) = request(path).await;
            assert!(
                body.contains(&format!("href=\"/static/styles.css?v={version}\"")),
                "{path}"
            );
            assert!(!body.contains("href=\"/static/styles.css\""));
            if path == "/" || path == "/fr" {
                assert!(body.contains(&format!("src=\"/static/main.js?v={version}\"")));
                assert_eq!(
                    body.matches(&format!(
                        "content=\"https://antoinelaborderie.com/static/og-image.png?v={version}\""
                    ))
                    .count(),
                    2
                );
            }
        }

        for asset in ["styles.css", "main.js", "og-image.png"] {
            let response = app()
                .oneshot(
                    Request::get(format!("/static/{asset}?v={version}"))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK, "{asset}");
            assert_eq!(
                response.headers()[header::CACHE_CONTROL],
                "public, max-age=86400"
            );
        }
    }

    #[tokio::test]
    async fn negotiates_gzip_and_brotli_for_html_and_styles() {
        for path in ["/", "/static/styles.css"] {
            for encoding in ["gzip", "br"] {
                let response = app()
                    .oneshot(
                        Request::get(path)
                            .header(header::ACCEPT_ENCODING, encoding)
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap();
                assert_eq!(response.status(), StatusCode::OK);
                assert_eq!(response.headers()[header::CONTENT_ENCODING], encoding);
                assert!(response.headers()[header::VARY]
                    .to_str()
                    .unwrap()
                    .to_ascii_lowercase()
                    .contains("accept-encoding"));
                let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
                assert!(!bytes.is_empty());
            }
        }
    }

    #[tokio::test]
    async fn sitemap_lists_localized_pages_with_lastmod_and_reciprocal_alternates() {
        let (_, _, xml) = request("/sitemap.xml").await;
        assert_eq!(xml.matches("<url>").count(), 4);
        for (path, en, fr) in [
            ("/", "/", "/fr"),
            ("/fr", "/", "/fr"),
            ("/legal-notice", "/legal-notice", "/fr/mentions-legales"),
            (
                "/fr/mentions-legales",
                "/legal-notice",
                "/fr/mentions-legales",
            ),
        ] {
            let entry = xml
                .split("<url>")
                .find(|entry| {
                    entry.contains(&format!("<loc>https://antoinelaborderie.com{path}</loc>"))
                })
                .unwrap();
            assert!(entry.contains("<lastmod>2026-10-23</lastmod>"));
            for (lang, target) in [("en", en), ("fr", fr), ("x-default", en)] {
                assert!(entry.contains(&format!(
                    "hreflang=\"{lang}\" href=\"https://antoinelaborderie.com{target}\""
                )));
            }
        }
    }

    #[tokio::test]
    async fn positions_fixed_price_services_and_email_contact_in_both_languages() {
        for (path, title, cta, services, legal) in [
            (
                "/",
                "Full-stack engineer · DevEx & AI · Agentic coding",
                "Discuss your project",
                [
                    "DevEx & AI audit",
                    "Agentic coding kit for your team",
                    "AI integration in your product (MVP)",
                    "Internal tooling / Backstage portal",
                    "Multi-repository automation",
                ],
                "/legal-notice",
            ),
            (
                "/fr",
                "Développeur Full Stack · DevEx & IA · Agentic coding",
                "Discuter de votre projet",
                [
                    "Audit DevEx & IA",
                    "Kit agentic coding pour votre équipe",
                    "Intégration IA dans votre produit (MVP)",
                    "Outillage interne / portail Backstage",
                    "Automatisation multi-repos",
                ],
                "/fr/mentions-legales",
            ),
        ] {
            let (_, _, body) = request(path).await;
            assert!(body.contains("href=\"#services\""));
            assert!(body.contains(cta));
            assert!(body.contains("Shepherd"));
            assert!(body.contains(&format!("href=\"{legal}\"")));
            for forbidden in [
                "LLM",
                "Claude Code",
                "600 €",
                "€600",
                "Platform Engineer —",
                "href=\"https://cosmoconnected.com\"",
            ] {
                assert!(!body.contains(forbidden), "{path}: {forbidden}");
            }
            assert!(body.contains("Cosmo Connected"));
            let hero = body
                .split("<header class=\"threshold\"")
                .nth(1)
                .unwrap()
                .split("</header>")
                .next()
                .unwrap();
            assert!(hero.contains("href=\"mailto:antoine.laborderie@gmail.com"));
            assert!(hero.contains(title));
            let primary = body
                .split("class=\"final-primary\"")
                .nth(1)
                .unwrap()
                .split('>')
                .next()
                .unwrap();
            assert!(primary.contains("href=\"mailto:antoine.laborderie@gmail.com"));
            let data = assert_json_ld_is_valid(&body);
            assert_eq!(data["@graph"][0]["jobTitle"], title);
            let offered: Vec<_> = data["@graph"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|item| item["@type"] == "Service")
                .collect();
            assert_eq!(offered.len(), 5);
            let visible_services = body
                .split("id=\"services\"")
                .nth(1)
                .unwrap()
                .split("</section>")
                .next()
                .unwrap();
            assert_eq!(visible_services.matches("<article>").count(), 5);
            for service in services {
                assert!(
                    visible_services.contains(&format!("<h3>{service}</h3>")),
                    "{path}: {service}"
                );
                assert!(offered.iter().any(|item| item["name"] == service));
            }
        }
    }

    fn assert_json_ld_is_valid(document: &str) -> serde_json::Value {
        let marker = "<script type=\"application/ld+json\">";
        let start = document.find(marker).unwrap() + marker.len();
        let end = document[start..].find("</script>").unwrap() + start;
        let value: serde_json::Value = serde_json::from_str(&document[start..end]).unwrap();
        assert_eq!(value["@context"], "https://schema.org");
        assert_eq!(value["@graph"][0]["name"], "Antoine Laborderie");
        value
    }
}
