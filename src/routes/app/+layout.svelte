<script lang="ts">
    import AppSidebar from "$lib/components/app-sidebar.svelte";
    import ElementCallWidget from "$lib/components/calls/element-call-widget.svelte";
    import { Button } from "$lib/components/ui/button";
    import * as Card from "$lib/components/ui/card";
    import * as Sidebar from "$lib/components/ui/sidebar";
    import Matrix from "$lib/stores/Matrix.svelte";
    import Verification from "$lib/stores/Verification.svelte";
    import SecretStorageModal from "$lib/components/SecretStorageModal.svelte";
    import Sidebars from "$lib/stores/Sidebars.svelte";
    import RightSidebar from "$lib/components/right-sidebar.svelte";

    let { children } = $props();

    $effect(() => {
        Matrix.client?.setPresence({
            presence: "online",
        });

        return () => {
            Matrix.client?.setPresence({
                presence: "offline",
            });
        };
    });

    async function handleSetupSecureBackup() {
        const passphrase = window.prompt(
            "Enter a strong passphrase to secure your backup:",
        );
        if (passphrase) {
            try {
                await Matrix.setupSecretStorage(passphrase);
                await Matrix.checkSecretStorageStatus();
                alert("Secure backup has been successfully set up!");
            } catch (e) {
                console.error(e);
                alert("Failed to set up secure backup.");
            }
        }
    }
</script>

<Sidebar.Provider bind:open={Sidebars.left}>
    <ElementCallWidget />
    {#if Matrix.isDeviceVerified !== null && !Matrix.isDeviceVerified}
        <Card.Root class="fixed bottom-5 right-5 z-50">
            <Card.Content>
                <div class="flex flex-col gap-2 pt-4">
                    <Button
                        class="bg-yellow-500 text-zinc-900 font-semibold px-4 py-2 rounded-md transition-all hover:bg-yellow-400 whitespace-nowrap"
                        onclick={() => Verification.startVerification()}
                    >
                        Verify Session
                    </Button>
                    {#if !Matrix.hasSecretStorage}
                        <Button
                            class="bg-blue-500 text-white font-semibold px-4 py-2 rounded-md transition-all hover:bg-blue-400 whitespace-nowrap"
                            onclick={handleSetupSecureBackup}
                        >
                            Setup Secure Backup
                        </Button>
                    {/if}
                </div>
            </Card.Content>
        </Card.Root>
    {:else if !Matrix.hasSecretStorage && Matrix.ready && false}
        <Card.Root class="fixed bottom-5 right-5 z-50">
            <Card.Content>
                <div class="flex flex-col gap-2 pt-4">
                    <Button
                        class="bg-blue-500 text-white font-semibold px-4 py-2 rounded-md transition-all hover:bg-blue-400 whitespace-nowrap"
                        onclick={handleSetupSecureBackup}
                    >
                        Setup Secure Backup
                    </Button>
                </div>
            </Card.Content>
        </Card.Root>
    {/if}

    <AppSidebar>
        <!-- <Sidebar.Provider bind:open={Sidebars.right} style="--sidebar-width: 18rem;"> -->
        {@render children()}
        <!-- <RightSidebar /> -->
        <!-- </Sidebar.Provider> -->
    </AppSidebar>

    <SecretStorageModal />
</Sidebar.Provider>
