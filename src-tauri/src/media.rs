use base64::{engine::general_purpose, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_http::reqwest;
use tokio::fs;
use tokio::sync::Mutex;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone)]
pub struct CacheEntry {
    /// Filename of the binary blob, relative to the cache dir.
    pub filename: String,
    pub content_type: String,
}

pub struct MediaCache {
    /// In-memory index: download URL → entry metadata.
    pub index: Mutex<HashMap<String, CacheEntry>>,
    /// Absolute path to the cache directory on disk.
    pub dir: PathBuf,
}

/// Serializable form of the index, written to `index.json`.
#[derive(Serialize, Deserialize, Default)]
struct CacheIndex {
    entries: HashMap<String, CacheEntry>,
}

// ── Paths ─────────────────────────────────────────────────────────────────────

fn index_path(dir: &Path) -> PathBuf {
    dir.join("index.json")
}

/// Stable filename for a URL: SHA-256 hex, no extension needed.
fn filename_for_url(url: &str) -> String {
    let hash = Sha256::digest(url.as_bytes());
    format!("{:x}.bin", hash)
}

// ── Init ──────────────────────────────────────────────────────────────────────

/// Call once from `setup`. Creates the cache dir if needed and loads the index.
pub fn init_cache(app: &AppHandle) -> Result<MediaCache, String> {
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| format!("Could not resolve cache dir: {e}"))?
        .join("media");

    std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create media cache dir: {e}"))?;

    // Load existing index if present, otherwise start empty.
    let index = if index_path(&dir).exists() {
        let raw = std::fs::read_to_string(index_path(&dir))
            .map_err(|e| format!("Failed to read cache index: {e}"))?;
        serde_json::from_str::<CacheIndex>(&raw)
            .unwrap_or_default()
            .entries
    } else {
        HashMap::new()
    };

    Ok(MediaCache {
        index: Mutex::new(index),
        dir,
    })
}

// ── Persistence helpers ───────────────────────────────────────────────────────

/// Write a blob to disk and update the in-memory index + `index.json`.
async fn persist_entry(
    cache: &State<'_, MediaCache>,
    url: &str,
    bytes: &[u8],
    content_type: &str,
) -> Result<(), String> {
    let filename = filename_for_url(url);
    let blob_path = cache.dir.join(&filename);

    fs::write(&blob_path, bytes)
        .await
        .map_err(|e| format!("Failed to write media blob: {e}"))?;

    let entry = CacheEntry {
        filename,
        content_type: content_type.to_string(),
    };

    let serialized = {
        let mut guard = cache.index.lock().await;
        guard.insert(url.to_string(), entry);
        serde_json::to_string(&CacheIndex {
            entries: guard.clone(),
        })
        .map_err(|e| format!("Failed to serialise cache index: {e}"))?
    }; // ← guard dropped before the write await

    fs::write(index_path(&cache.dir), serialized)
        .await
        .map_err(|e| format!("Failed to write cache index: {e}"))?;

    Ok(())
}

/// Read a cached blob from disk by URL. Returns `None` if the file is missing.
async fn read_cached(cache: &State<'_, MediaCache>, url: &str) -> Option<(Vec<u8>, String)> {
    let entry = {
        let guard = cache.index.lock().await;
        guard.get(url)?.clone()
    }; // ← guard dropped here, before any await

    let blob_path = cache.dir.join(&entry.filename);
    let bytes = fs::read(&blob_path).await.ok()?;
    Some((bytes, entry.content_type))
}

// ── Shared fetch helper ───────────────────────────────────────────────────────

async fn fetch_authenticated(
    url: &str,
    token: &str,
    cache: &State<'_, MediaCache>,
) -> Result<Option<(Vec<u8>, String)>, String> {
    // 1. Memory-index hit → read blob from disk.
    if let Some(result) = read_cached(cache, url).await {
        return Ok(Some(result));
    }

    // 2. Network fetch.
    let response = reqwest::Client::new()
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("HTTP error: {e}"))?;

    if !response.status().is_success() {
        return Ok(None);
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/octet-stream")
        .to_string();

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Body read error: {e}"))?
        .to_vec();

    // 3. Write through to disk.
    persist_entry(cache, url, &bytes, &content_type).await?;

    Ok(Some((bytes, content_type)))
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct MediaResult {
    pub data: String, // base64
    pub content_type: String,
    pub from_cache: bool,
}

#[tauri::command]
pub async fn fetch_mxc_media(
    mxc: String,
    homeserver: String,
    token: String,
    cache: State<'_, MediaCache>,
) -> Result<Option<MediaResult>, String> {
    if !mxc.starts_with("mxc://") {
        return Ok(None);
    }

    let url = format!(
        "{}/_matrix/client/v1/media/download/{}",
        homeserver.trim_end_matches('/'),
        &mxc[6..]
    );

    let from_cache = cache.index.lock().await.contains_key(&url);

    match fetch_authenticated(&url, &token, &cache).await? {
        None => Ok(None),
        Some((bytes, content_type)) => Ok(Some(MediaResult {
            data: general_purpose::STANDARD.encode(&bytes),
            content_type,
            from_cache,
        })),
    }
}

#[tauri::command]
pub async fn load_media(
    mxc: String,
    homeserver: String,
    token: String,
    encrypted: bool,
    cache: State<'_, MediaCache>,
) -> Result<Option<MediaResult>, String> {
    if !mxc.starts_with("mxc://") {
        return Ok(None);
    }

    let url = format!(
        "{}/_matrix/client/v1/media/download/{}",
        homeserver.trim_end_matches('/'),
        &mxc[6..]
    );

    let from_cache = cache.index.lock().await.contains_key(&url);

    match fetch_authenticated(&url, &token, &cache).await? {
        None => Ok(None),
        Some((bytes, content_type)) => Ok(Some(MediaResult {
            data: general_purpose::STANDARD.encode(&bytes),
            content_type,
            from_cache,
        })),
    }
}

/// Removes all cached files and clears the index. Useful for a "clear cache" settings button.
#[tauri::command]
pub async fn clear_media_cache(cache: State<'_, MediaCache>) -> Result<(), String> {
    let filenames: Vec<String> = {
        let mut guard = cache.index.lock().await;
        let names = guard.values().map(|e| e.filename.clone()).collect();
        guard.clear();
        names
    }; // ← guard dropped before awaits

    for name in filenames {
        let _ = fs::remove_file(cache.dir.join(&name)).await;
    }

    fs::write(
        index_path(&cache.dir),
        serde_json::to_string(&CacheIndex::default()).unwrap(),
    )
    .await
    .map_err(|e| format!("Failed to clear index: {e}"))?;

    Ok(())
}
