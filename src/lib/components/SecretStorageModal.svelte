<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import * as Button from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import { Label } from "$lib/components/ui/label/index.js";
    import Matrix from "$lib/stores/Matrix.svelte";
    import { SecretStorageDialog } from "$lib/stores/SecretStorage.svelte";
    import { decodeRecoveryKey, deriveRecoveryKeyFromPassphrase } from "matrix-js-sdk/lib/crypto-api";

    let inputValue = $state("");
    let isError = $state(false);
    let isSubmitting = $state(false);

    async function handleSubmit() {
        if (!inputValue) return;
        isError = false;
        isSubmitting = true;
        try {
            let key: Uint8Array | undefined;
            const normalized = inputValue.trim();
            if (normalized.startsWith("Es")) {
                key = decodeRecoveryKey(normalized);
                if (!key) throw new Error("Invalid format");
            } else {
                const keys = SecretStorageDialog.keysDescription;
                const activeKeyId = keys.default || Object.keys(keys)[0];
                const info = keys[activeKeyId];
                if (!info.passphrase) {
                     throw new Error("No passphrase derivation info found for this key!");
                }
                const { salt, iterations, bits } = info.passphrase;
                key = await deriveRecoveryKeyFromPassphrase(normalized, salt, iterations, bits);
            }
            SecretStorageDialog.submitKey(key);
            inputValue = "";
        } catch (e) {
            console.error("Failed to decode recovery key:", e);
            isError = true;
        } finally {
            isSubmitting = false;
        }
    }

    function handleOpenChange(open: boolean) {
        if (!open) {
            SecretStorageDialog.submitKey(null);
            inputValue = "";
            isError = false;
        } else {
            SecretStorageDialog.isPrompting = true;
        }
    }

    async function handleReset() {
        if (!confirm("Are you sure you want to reset your secure backup? You will lose access to older encrypted messages!")) return;
        const newPassphrase = prompt("Enter a newly secured passphrase for your new backup:");
        if (newPassphrase) {
            isSubmitting = true;
            try {
                SecretStorageDialog.submitKey(null);
                await Matrix.setupSecretStorage(newPassphrase, true);
                await Matrix.checkSecretStorageStatus();
                alert("Backup reset successfully!");
            } catch (e) {
                console.error("Failed to reset backup", e);
                alert("Failed to reset backup");
            } finally {
                isSubmitting = false;
                SecretStorageDialog.isPrompting = false;
            }
        }
    }
</script>

<Dialog.Root bind:open={SecretStorageDialog.isPrompting} onOpenChange={handleOpenChange}>
    <Dialog.Content class="sm:max-w-[425px]">
        <Dialog.Header>
            <Dialog.Title>Enter Security Key</Dialog.Title>
            <Dialog.Description>
                To unlock your end-to-end encrypted messages, please enter your Security Key or Recovery Passphrase.
            </Dialog.Description>
        </Dialog.Header>
        <div class="grid gap-4 py-4">
            <div class="grid grid-cols-4 items-center gap-4">
                <Label for="key" class="text-right whitespace-nowrap">Passphrase</Label>
                <Input
                    id="key"
                    type="password"
                    bind:value={inputValue}
                    class="col-span-3"
                    placeholder="Es... or your passphrase"
                    disabled={isSubmitting}
                />
            </div>
            {#if isError}
                <p class="text-sm text-red-500 font-medium text-center">Invalid Security Key or Passphrase.</p>
            {/if}
        </div>
        <Dialog.Footer class="flex flex-row sm:justify-between w-full">
            <Button.Root variant="destructive" onclick={handleReset} disabled={isSubmitting}>Reset Backup</Button.Root>
            <div class="flex flex-row gap-2">
                <Button.Root variant="outline" onclick={() => handleOpenChange(false)} disabled={isSubmitting}>Cancel</Button.Root>
                <Button.Root type="submit" onclick={handleSubmit} disabled={isSubmitting || inputValue.length === 0}>
                    {isSubmitting ? "Decrypting..." : "Submit"}
                </Button.Root>
            </div>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
