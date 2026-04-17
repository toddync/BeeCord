import * as sdk from "matrix-js-sdk";
import { CryptoEvent } from "matrix-js-sdk/lib/crypto-api";
import type { VerificationRequest } from "matrix-js-sdk/lib/crypto-api/verification";
import BeeCord from "./BeeCord.svelte";
import Rooms from "./Rooms.svelte";
import { SecretStorageDialog } from "./SecretStorage.svelte";

class Matrix_ {
    device: string | null = $state(null);
    user_id: string | null = $state(null);
    username: string | null = $state(null);
    password: string | null = $state(null);
    access_token: string | null = $state(null);
    homeserver: string = $state("https://matrix.org");

    loading: boolean = $state(true);
    ready: boolean = $state(false);
    client: sdk.MatrixClient | null = $state(null);

    verificationRequest: VerificationRequest | null = $state(null);
    isCrossSigningReady: boolean = $state(false);
    isDeviceVerified: boolean | null = $state(null);
    isSecretStorageReady: boolean = $state(false);
    hasSecretStorage: boolean | null = $state(null);

    private secretStorageKeys: Record<string, Uint8Array> = {};

    async init() {
        this.device = (await BeeCord.get<string>("device_id")) || "";
        this.user_id = (await BeeCord.get<string>("user_id")) || "";
        this.username = (await BeeCord.get<string>("username")) || "";
        this.access_token = (await BeeCord.get<string>("access_token")) || "";
        this.homeserver =
            (await BeeCord.get<string>("homeserver")) ?? "https://matrix.org";
    }

    async checkCrossSigningStatus() {
        if (!this.client || !this.client.getCrypto()) return;
        try {
            const crypto = this.client.getCrypto()!;
            const userId = this.client.getUserId();
            const deviceId = this.client.getDeviceId();

            if (userId && deviceId) {
                const status = await crypto.getDeviceVerificationStatus(
                    userId,
                    deviceId,
                );
                this.isDeviceVerified = status?.crossSigningVerified ?? false;
            }
        } catch (err) {
            console.error("Error checking device verification status", err);
        }
    }

    hasSession(): boolean {
        return !!this.device && !!this.access_token;
    }

    async login() {
        const baseUrl = this.homeserver;
        console.log(this.homeserver, baseUrl);
        const loginClient = sdk.createClient({ baseUrl });

        const { access_token, device_id, user_id } =
            await loginClient.loginRequest({
                type: "m.login.password",
                identifier: { type: "m.id.user", user: this.username },
                password: this.password!,
                device_id: this.device || undefined,
            });

        await BeeCord.set("access_token", access_token);
        await BeeCord.set("device_id", device_id);
        await BeeCord.set("homeserver", baseUrl);
        await BeeCord.set("user_id", user_id);

        this.device = device_id;
        this.access_token = access_token;
        this.user_id = user_id;

        // if ("serviceWorker" in navigator) {
        //     navigator.serviceWorker.ready.then((reg) => {
        //         reg.active?.postMessage({
        //             type: "SET_TOKEN",
        //             token: this.access_token,
        //         });
        //     });
        // }

        await this.start();
    }

    async start() {
        const access_token = this.access_token;
        const device_id = this.device;
        const userId = this.user_id;
        const url = formatHomeServer(this.homeserver);

        if (userId && !userId.startsWith("@")) {
            console.warn(
                "Stored userId has no '@' sigil — clearing stale session.",
            );

            ["access_token", "user_id", "device_id", "homeserver"].forEach(
                (k) => BeeCord.delete(k),
            );

            this.loading = false;
            return;
        }

        if (userId && device_id && access_token && url) {
            const store = new sdk.IndexedDBStore({
                indexedDB: window.indexedDB,
                localStorage: window.localStorage,
                dbName: "matrix-js-sdk:default",
            });
            await store.startup();

            this.client = sdk.createClient({
                userId,
                baseUrl: url,
                deviceId: device_id,
                // timelineSupport: true,
                accessToken: access_token,
                store: store,
                // cryptoCallbacks: {
                //     getSecretStorageKey: async ({ keys }, name) => {
                //         console.log(`Matrix SDK requested secret storage key for ${name} with keys:`, keys);
                //         const keyIds = Object.keys(keys);
                //         for (const keyId of keyIds) {
                //             if (this.secretStorageKeys[keyId]) {
                //                 return [keyId, this.secretStorageKeys[keyId] as unknown as Uint8Array<ArrayBuffer>];
                //             }
                //         }

                //         const userInputKey = await SecretStorageDialog.requestKey(keys);
                //         if (userInputKey) {
                //             // Find preferred key id
                //             const selectedKeyId = (keys as any).default || keyIds[0];
                //             return [selectedKeyId, userInputKey as unknown as Uint8Array<ArrayBuffer>];
                //         }
                //         return null;
                //     },
                //     cacheSecretStorageKey: (keyId, keyInfo, key) => {
                //         this.secretStorageKeys[keyId] = key;
                //     }
                // }
            });

            try {
                await this.client.initRustCrypto();
                await this.client.startClient({ initialSyncLimit: 10 });

                Rooms.start();

                this.client.on(sdk.ClientEvent.Sync, async (state) => {
                    if (state !== "PREPARED") return;

                    const crypto = this.client?.getCrypto();
                    if (crypto) {
                        crypto.getCrossSigningKeyId().then((keyId) => {
                            this.isCrossSigningReady = !!keyId;
                        });
                        this.checkAndRestoreKeyBackup();
                        // this.checkSecretStorageStatus();
                    }

                    await this.checkCrossSigningStatus();
                    this.ready = true;
                });

                this.client.on(
                    CryptoEvent.VerificationRequestReceived,
                    (request) => {
                        if (request.isSelfVerification) {
                            this.verificationRequest = request;
                        }
                    },
                );
            } catch (e) {
                console.error(e);
            }
        }

        this.loading = false;
    }

    async logout() {
        if (this.client) {
            try {
                this.client.logout();
                this.client.deleteDevice(this.device!);
                this.client.stopClient();
                this.client.store.destroy();
                this.client.removeAllListeners();
            } catch (e) { }
        }
        this.client = null;
        this.ready = false;
        this.verificationRequest = null;
        this.isCrossSigningReady = false;
        this.isDeviceVerified = null;

        await BeeCord.delete("access_token");
        await BeeCord.delete("homeserver");
        await BeeCord.delete("device_id");
        await BeeCord.delete("user_id");

        window.indexedDB.deleteDatabase("matrix-js-sdk::matrix-sdk-crypto");
        window.indexedDB.deleteDatabase("matrix-js-sdk:matrix-js-sdk:default");
        window.indexedDB.deleteDatabase("matrix-js-sdk:crypto");
        window.indexedDB.deleteDatabase("BeeCord_Auth");

        window.location.reload();
    }

    // --- Verification Accessors --- //
    async requestOwnUserVerification(): Promise<
        VerificationRequest | undefined
    > {
        const crypto = this.client?.getCrypto();
        if (!crypto) return undefined;
        return crypto.requestOwnUserVerification();
    }

    async acceptRequest(request: VerificationRequest) {
        await request.accept();
    }

    async startSas(request: VerificationRequest) {
        return request.startVerification("m.sas.v1");
    }

    async checkAndRestoreKeyBackup() {
        if (!this.client || !this.client.getCrypto()) return;
        const crypto = this.client.getCrypto()!;
        try {
            const hasBackup = await crypto.checkKeyBackupAndEnable();
            if (hasBackup) {
                console.log("Key backup enabled: ", hasBackup);
            } else {
                console.log("No key backup found.");
            }
        } catch (e) {
            console.error("Error checking key backup", e);
        }
    }

    async checkSecretStorageStatus() {
        if (!this.client || !this.client.getCrypto()) return;
        const crypto = this.client.getCrypto()!;
        try {
            const status = await crypto.getSecretStorageStatus();
            this.isSecretStorageReady = status.ready;
            this.hasSecretStorage = status.defaultKeyId !== null;
        } catch (e) {
            console.error("Error checking secret storage", e);
        }
    }

    async setupSecretStorage(passphrase?: string, forceReset: boolean = false) {
        if (!this.client || !this.client.getCrypto()) return;
        const crypto = this.client.getCrypto()!;
        try {
            await crypto.bootstrapSecretStorage({
                createSecretStorageKey: async () => {
                    return passphrase
                        ? await crypto.createRecoveryKeyFromPassphrase(passphrase)
                        : await crypto.createRecoveryKeyFromPassphrase();
                },
                setupNewKeyBackup: true,
                setupNewSecretStorage: forceReset,
            });
            console.log("Secret storage bootstrapped successfully.");
        } catch (err) {
            console.error("Failed to bootstrap secret storage:", err);
            throw err;
        }
    }
}

const Matrix = new Matrix_();
export default Matrix;

function formatHomeServer(url: string): string {
    url = (url || "").trim();
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = url.includes("localhost") ? `http://${url}` : `https://${url}`;
    }
    return url;
}
