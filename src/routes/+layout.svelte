<script lang="ts">
    import { goto } from "$app/navigation";
    import TopBar from "$lib/components/top-bar.svelte";
    import { Toaster } from "$lib/components/ui/sonner";
    import VerificationModal from "$lib/components/verification-modal.svelte";
    import BeeCord from "$lib/stores/BeeCord.svelte";
    import Matrix from "$lib/stores/Matrix.svelte";
    import Rooms from "$lib/stores/Rooms.svelte";
    import { untrack } from "svelte";
    import "./layout.css";

    const { children } = $props();
    let logged = $derived.by(() => Matrix.hasSession());

    let of = fetch;
    globalThis.fetch = (input, init, ...r) => {
        if (
            input instanceof URL &&
            input.href.endsWith("matrix_sdk_crypto_wasm_bg.wasm")
        )
            input = "/matrix_sdk_crypto_wasm_bg.wasm";
        return of(input, init, ...r);
    };

    // $effect(() => {
    //     if ("serviceWorker" in navigator) {
    //         navigator.serviceWorker
    //             .register("/sw.js", { scope: "/" })
    //             .catch((err) => console.warn("SW registration failed:", err));
    //     }
    // });

    let loading = $state(true);
    $effect(() => {
        goto("/");
        untrack(async () => {
            if (loading == true) {
                await BeeCord.init();
                await Matrix.init();

                if (BeeCord.platform != "web") {
                    let { getCurrentWebview } = await import(
                        "@tauri-apps/api/webview"
                    );

                    getCurrentWebview().setZoom(
                        (await BeeCord.get<number>("zoom")) || 1,
                    );
                }

                loading = false;
            }
        });
    });

    $effect(() => {
        if (!loading) {
            if (!logged) {
                goto("/login");
            } else {
                untrack(() => {
                    if (!Matrix.client) {
                        Matrix.start();
                    }
                });

                if (Matrix.ready && Rooms.ready) {
                    goto("/app");
                }
            }
        }
    });
</script>

<svelte:window
    onresize={() => {
        let zoom =
            Math.round(((window.outerWidth - 10) / window.innerWidth) * 100) /
            100;
        BeeCord.store?.set("zoom", zoom);
    }}
/>

<Toaster expand richColors />

{#if ["android", "ios", "web"].includes(BeeCord.platform)}
    <main class="h-svh w-svw overflow-hidden flex">
        {@render children()}
        <VerificationModal />
    </main>
{:else}
    <main class="grid grid-template-rows-[32px_1fr] h-svh w-svw">
        <TopBar />
        <main class="flex-1 h-[calc(100svh-32px)] overflow-hidden flex">
            {@render children()}
            <VerificationModal />
        </main>
    </main>
{/if}
