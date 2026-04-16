<script lang="ts">
    import * as sdk from "matrix-js-sdk";
    import * as Dialog from "$lib/components/ui/dialog";
    import Button from "$lib/components/ui/button/button.svelte";
    import Input from "$lib/components/ui/input/input.svelte";
    import Label from "$lib/components/ui/label/label.svelte";
    import Matrix from "$lib/stores/Matrix.svelte";
    import { Upload, X } from "lucide-svelte";

    let { open = $bindable(false) } = $props();

    let spaceName = $state("");
    let spaceTopic = $state("");
    let spaceVisibility: "private" | "public" = $state("private");
    let isLoading = $state(false);
    let error = $state("");

    // Avatar state
    let avatarFile: File | null = $state(null);
    let avatarPreview: string | null = $state(null);
    let fileInput: HTMLInputElement;

    function resetForm() {
        spaceName = "";
        spaceTopic = "";
        spaceVisibility = "private";
        isLoading = false;
        error = "";
        clearAvatar();
    }

    $effect(() => {
        if (!open) resetForm();
    });

    function clearAvatar() {
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        avatarFile = null;
        avatarPreview = null;
        if (fileInput) fileInput.value = "";
    }

    function onAvatarPicked(e: Event) {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            error = "Avatar must be an image file";
            return;
        }
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        avatarFile = file;
        avatarPreview = URL.createObjectURL(file);
    }

    async function uploadAvatar(): Promise<string | null> {
        if (!avatarFile || !Matrix.client) return null;
        const res = await Matrix.client.uploadContent(avatarFile, {
            type: avatarFile.type,
            name: avatarFile.name,
        });
        return res.content_uri;
    }

    async function handleCreateSpace() {
        if (!spaceName.trim()) {
            error = "Space name is required";
            return;
        }

        isLoading = true;
        error = "";
        try {
            const avatarMxc = await uploadAvatar();
            const initial_state = avatarMxc
                ? [
                      {
                          type: "m.room.avatar",
                          state_key: "",
                          content: { url: avatarMxc },
                      },
                  ]
                : undefined;

            const res = (await Matrix.client?.createRoom({
                creation_content: { type: "m.space" },
                name: spaceName.trim(),
                topic: spaceTopic.trim() || undefined,
                visibility:
                    spaceVisibility === "private"
                        ? sdk.Visibility.Private
                        : sdk.Visibility.Public,
                preset:
                    spaceVisibility === "public"
                        ? sdk.Preset.PublicChat
                        : sdk.Preset.PrivateChat,
                ...(initial_state && { initial_state }),
            })) as { room_id: string };
            console.log("Created space:", res.room_id);
            open = false;
        } catch (e: any) {
            error = e.message ?? "Failed to create space";
        } finally {
            isLoading = false;
        }
    }
</script>

<input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    class="hidden"
    onchange={onAvatarPicked}
/>

<Dialog.Root bind:open>
    <Dialog.Content>
        <Dialog.Header>
            <Dialog.Title>New Space</Dialog.Title>
            <Dialog.Description
                >Create a space to group your rooms.</Dialog.Description
            >
        </Dialog.Header>

        <div class="py-2 flex flex-col gap-4">
            <!-- Avatar -->
            <button
                type="button"
                onclick={() => fileInput.click()}
                class="relative size-40 mx-auto shrink-0 rounded-lg border-2 border-dashed border-input bg-muted flex items-center justify-center overflow-hidden hover:border-primary transition-colors"
                aria-label="Upload space avatar"
                title="Upload space avatar"
            >
                {#if avatarPreview}
                    <img
                        src={avatarPreview}
                        alt="Space avatar preview"
                        class="size-full object-cover"
                    />
                    <div
                        class="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                        <Upload class="size-6 text-white" />
                    </div>
                {:else}
                    <Upload class="size-10 stroke-1 stroke-primary" />
                {/if}
            </button>
            {#if avatarPreview}
                <Button
                    variant="ghost"
                    size="sm"
                    class="mx-auto -mt-2"
                    onclick={clearAvatar}
                >
                    <X class="size-3.5 mr-1" /> Remove avatar
                </Button>
            {/if}

            <div class="flex flex-col gap-1.5">
                <Label for="space-name">Space name *</Label>
                <Input
                    id="space-name"
                    bind:value={spaceName}
                    placeholder="My Space"
                />
            </div>
            <div class="flex flex-col gap-1.5">
                <Label for="space-topic">Topic</Label>
                <Input
                    id="space-topic"
                    bind:value={spaceTopic}
                    placeholder="What's this space about?"
                />
            </div>
            <div class="flex flex-col gap-1.5">
                <Label for="space-visibility">Visibility</Label>
                <select
                    id="space-visibility"
                    bind:value={spaceVisibility}
                    class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                </select>
            </div>
            {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
        </div>

        <Dialog.Footer>
            <Button variant="outline" onclick={() => (open = false)}
                >Cancel</Button
            >
            <Button onclick={handleCreateSpace} disabled={isLoading}>
                {isLoading ? "Creating…" : "Create space"}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
