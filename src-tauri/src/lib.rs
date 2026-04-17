mod media;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port: u16 = 9527;
    let mut builder = tauri::Builder::default();
    
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        builder = builder.plugin(tauri_plugin_barcode_scanner::init());
    }

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_localhost::Builder::new(port).build());
    }

    
    builder = builder
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            media::clear_media_cache,
            media::fetch_mxc_media,
            media::load_media,
        ]);

    builder
        .setup(|app| {
            let cache = media::init_cache(app.handle()).expect("Failed to initialise media cache");
            app.manage(cache);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
