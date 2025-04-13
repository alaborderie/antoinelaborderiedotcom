use askama::Template;
use axum::{
    response::Html,
    routing::get,
    Router,
};
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    // Build our app with routes
    let app = Router::new()
        .route("/", get(index))
        .nest_service("/static", ServeDir::new("static"))
        .fallback(get(index));

    // Run on localhost:3000
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Server running at http://{}", listener.local_addr().unwrap());
    axum::serve(listener, app)
        .await
        .unwrap();
}

// Templates
#[derive(Template)]
#[template(path = "index.html")]
struct IndexTemplate;

// Handlers
async fn index() -> Html<String> {
    let template = IndexTemplate;
    Html(template.render().unwrap())
}
