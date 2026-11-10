// Appended to a scratch copy of src/main.rs by check.sh (never to the repo):
//   #[cfg(test)] #[path = "asset_facts.rs"] mod asset_facts;
// Reads, from the real router, the code facts that set the constants of AssetRollout.tla.
use super::*;
use axum::{
    body::{to_bytes, Body},
    http::Request,
};
use tower::ServiceExt;

async fn get(path: &str) -> (StatusCode, axum::http::HeaderMap, String) {
    let response = app()
        .oneshot(Request::get(path).body(Body::empty()).unwrap())
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, headers, String::from_utf8_lossy(&body).into_owned())
}

#[tokio::test]
async fn asset_facts() {
    let mut links_versioned = true;
    let mut inline_assets = true;
    let mut page_cache = Vec::new();
    for path in ["/", "/fr"] {
        let (_, headers, html) = get(path).await;
        links_versioned &= html.contains(&format!("href=\"/static/styles.css?v={ASSET_VERSION}\""))
            && html.contains(&format!("src=\"/static/main.js?v={ASSET_VERSION}\""));
        inline_assets &= html.contains(include_str!("../static/styles.css"))
            && html.contains(include_str!("../static/main.js"))
            && !html.contains("href=\"/static/styles.css")
            && !html.contains("src=\"/static/main.js");
        page_cache.push(headers[header::CACHE_CONTROL].to_str().unwrap().to_owned());
    }
    let (status, headers, _) = get("/static/styles.css?v=not-this-release").await;
    println!("FACT inline_assets={inline_assets}");
    println!("FACT asset_version={ASSET_VERSION}");
    println!("FACT links_versioned={links_versioned}");
    println!("FACT server_checks_version={}", status != StatusCode::OK);
    println!("FACT other_version_status={}", status.as_u16());
    println!(
        "FACT other_version_cache={}",
        headers[header::CACHE_CONTROL].to_str().unwrap()
    );
    println!("FACT page_cache={}", page_cache.join(" | "));
}
