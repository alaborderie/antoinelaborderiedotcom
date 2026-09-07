use askama::Template;
use axum::{
    http::{header, StatusCode},
    response::{Html, IntoResponse, Redirect, Response},
    routing::get,
    Router,
};
use tower_http::services::ServeDir;

const SITE_URL: &str = "https://antoinelaborderie.com";

#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate {
    lang: &'static str,
    title: &'static str,
    description: &'static str,
    canonical: &'static str,
    og_locale: &'static str,
    og_image_alt: &'static str,
    is_french: bool,
    json_ld: &'static str,
}

fn app() -> Router {
    Router::new()
        .route("/", get(english))
        .route("/fr", get(french))
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
        .nest_service("/static", ServeDir::new("static"))
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
    render(IndexTemplate { lang:"en", title:"Antoine Laborderie | Freelance Platform Engineer, Bordeaux", description:"Platform Engineer in Bordeaux specializing in Kubernetes, developer experience and AI-assisted software delivery.", canonical:"https://antoinelaborderie.com/", og_locale:"en_GB", og_image_alt:"Antoine Laborderie — Platform Engineer and Developer Experience specialist", is_french:false, json_ld:json_ld("en", "https://antoinelaborderie.com/") })
}
async fn french() -> Response {
    render(IndexTemplate { lang:"fr", title:"Antoine Laborderie | Ingénieur DevEx freelance à Bordeaux", description:"Platform Engineer à Bordeaux, spécialisé en Kubernetes, expérience développeur et développement logiciel assisté par IA.", canonical:"https://antoinelaborderie.com/fr", og_locale:"fr_FR", og_image_alt:"Antoine Laborderie — spécialiste Platform Engineering et expérience développeur", is_french:true, json_ld:json_ld("fr", "https://antoinelaborderie.com/fr") })
}

fn render(template: IndexTemplate) -> Response {
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
    (
        [(header::CONTENT_TYPE, "application/xml; charset=utf-8")],
        format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml"><url><loc>{SITE_URL}/</loc><xhtml:link rel="alternate" hreflang="en" href="{SITE_URL}/"/><xhtml:link rel="alternate" hreflang="fr" href="{SITE_URL}/fr"/></url><url><loc>{SITE_URL}/fr</loc><xhtml:link rel="alternate" hreflang="en" href="{SITE_URL}/"/><xhtml:link rel="alternate" hreflang="fr" href="{SITE_URL}/fr"/></url></urlset>"#
        ),
    )
}
async fn favicon() -> impl IntoResponse {
    (
        [(header::CONTENT_TYPE, "image/svg+xml")],
        include_str!("../static/favicon.svg"),
    )
}

fn json_ld(lang: &'static str, _url: &'static str) -> &'static str {
    if lang == "fr" {
        JSON_LD_FR
    } else {
        JSON_LD_EN
    }
}
const JSON_LD_EN: &str = r#"{"@context":"https://schema.org","@graph":[{"@type":"Person","@id":"https://antoinelaborderie.com/#person","name":"Antoine Laborderie","jobTitle":"Platform Engineer","url":"https://antoinelaborderie.com/","image":"https://antoinelaborderie.com/static/antoine-laborderie.webp","address":{"@type":"PostalAddress","addressLocality":"Bordeaux","addressCountry":"FR"},"sameAs":["https://github.com/alaborderie","https://www.linkedin.com/in/antoine-laborderie","https://www.malt.fr/profile/antoinelaborderie"]},{"@type":"WebSite","@id":"https://antoinelaborderie.com/#website","url":"https://antoinelaborderie.com/","name":"Antoine Laborderie","inLanguage":["en","fr"],"publisher":{"@id":"https://antoinelaborderie.com/#person"}},{"@type":"ProfilePage","url":"https://antoinelaborderie.com/","inLanguage":"en","mainEntity":{"@id":"https://antoinelaborderie.com/#person"},"isPartOf":{"@id":"https://antoinelaborderie.com/#website"}}]}"#;
const JSON_LD_FR: &str = r#"{"@context":"https://schema.org","@graph":[{"@type":"Person","@id":"https://antoinelaborderie.com/#person","name":"Antoine Laborderie","jobTitle":"Platform Engineer","url":"https://antoinelaborderie.com/fr","image":"https://antoinelaborderie.com/static/antoine-laborderie.webp","address":{"@type":"PostalAddress","addressLocality":"Bordeaux","addressCountry":"FR"},"sameAs":["https://github.com/alaborderie","https://www.linkedin.com/in/antoine-laborderie","https://www.malt.fr/profile/antoinelaborderie"]},{"@type":"WebSite","@id":"https://antoinelaborderie.com/#website","url":"https://antoinelaborderie.com/","name":"Antoine Laborderie","inLanguage":["en","fr"],"publisher":{"@id":"https://antoinelaborderie.com/#person"}},{"@type":"ProfilePage","url":"https://antoinelaborderie.com/fr","inLanguage":"fr","mainEntity":{"@id":"https://antoinelaborderie.com/#person"},"isPartOf":{"@id":"https://antoinelaborderie.com/#website"}}]}"#;

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
        assert!(en
            .contains("<title>Antoine Laborderie | Freelance Platform Engineer, Bordeaux</title>"));
        assert!(en.contains("Reliable platforms and more effective developers"));
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
        assert!(
            fr.contains("<title>Antoine Laborderie | Ingénieur DevEx freelance à Bordeaux</title>")
        );
        assert!(fr.contains("Des plateformes fiables et des développeurs plus efficaces"));
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
    async fn permanently_redirects_legacy_locale_and_concept_routes() {
        for (path, location) in [
            ("/en", "/"),
            ("/en/", "/"),
            ("/fr/", "/fr"),
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

    fn assert_json_ld_is_valid(document: &str) {
        let marker = "<script type=\"application/ld+json\">";
        let start = document.find(marker).unwrap() + marker.len();
        let end = document[start..].find("</script>").unwrap() + start;
        let value: serde_json::Value = serde_json::from_str(&document[start..end]).unwrap();
        assert_eq!(value["@context"], "https://schema.org");
        assert_eq!(value["@graph"][0]["name"], "Antoine Laborderie");
    }
}
