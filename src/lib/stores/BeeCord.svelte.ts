interface Store {
    get: <T>(k: string) => Promise<T | undefined>;
    set: (k: string, v: unknown) => Promise<void>;
    delete: (k: string) => Promise<boolean | undefined>;
}

class Beecord {
    notification = new Audio("/notification_buz.mp3")
    store: Store | null = $state(null);
    platform: string = $state("");
    fetch = fetch;

    async init(): Promise<void> {
        //@ts-ignore
        if (!window.__TAURI_OS_PLUGIN_INTERNALS__) this.platform = "web";
        else {
            let { platform } = await import("@tauri-apps/plugin-os");
            let { load } = await import("@tauri-apps/plugin-store");
            let { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
            this.store = await load("BeeCord.json");
            this.platform = platform();
            this.fetch = tauriFetch;
        }
    }

    async get<T>(key: string): Promise<T | undefined> {
        if (this.platform == "web") {
            let item = localStorage.getItem(key);
            if (item) {
                try {
                    return JSON.parse(item) as T;
                } catch (e) {
                    return item as T;
                }
            } else return undefined;
        }
        return await this.store?.get<T>(key);
    }

    async set(key: string, val: unknown): Promise<void> {
        if (this.platform == "web")
            return localStorage.setItem(key, JSON.stringify(val));
        return await this.store?.set(key, val);
    }

    async delete(key: string): Promise<boolean | undefined> {
        if (this.platform == "web") return (localStorage.removeItem(key), true);
        return await this.store?.delete(key);
    }
}

const BeeCord = new Beecord();

export default BeeCord;
