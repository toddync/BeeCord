<script lang="ts">
    import * as sdk from "matrix-js-sdk";
    import Button from "$lib/components/ui/button/button.svelte";
    import Input from "$lib/components/ui/input/input.svelte";
    import Label from "$lib/components/ui/label/label.svelte";
    import * as Dialog from "$lib/components/ui/dialog";
    import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
    import * as Tooltip from "$lib/components/ui/tooltip";
    import {
        Check,
        Hash,
        MessageSquare,
        Plus,
        Search,
        Upload,
        Video,
        X,
    } from "@lucide/svelte";
    import Matrix from "$lib/stores/Matrix.svelte";
    import Rooms from "$lib/stores/Rooms.svelte";

    let openDialog: "chat" | "room" | "video" | null = $state(null);
    let step: 1 | 2 = $state(1);

    let roomName = $state("");
    let roomTopic = $state("");
    let roomVisibility: "private" | "public" = $state("private");
    let isLoading = $state(false);
    let error = $state("");

    // Avatar state
    let avatarFile: File | null = $state(null);
    let avatarPreview: string | null = $state(null);
    let fileInput: HTMLInputElement;

    // Invite state
    let manualInvite = $state("");
    let selectedMxids = $state<Set<string>>(new Set());
    let userSearch = $state("");

    // All known users (excluding self)
    const knownUsers = $derived(
        (Matrix.client?.getUsers() ?? []).filter(
            (u) => u.userId !== Matrix.client?.getUserId(),
        ),
    );

    const filteredUsers = $derived(
        userSearch.trim()
            ? knownUsers.filter(
                  (u) =>
                      u.userId
                          .toLowerCase()
                          .includes(userSearch.toLowerCase()) ||
                      (u.displayName ?? "")
                          .toLowerCase()
                          .includes(userSearch.toLowerCase()),
              )
            : knownUsers,
    );

    function toggleUser(mxid: string) {
        const next = new Set(selectedMxids);
        next.has(mxid) ? next.delete(mxid) : next.add(mxid);
        selectedMxids = next;
    }

    function addManualInvite() {
        const id = manualInvite.trim();
        if (!id.startsWith("@") || !id.includes(":")) {
            error = "Invalid MXID format — must be @user:server.org";
            return;
        }
        selectedMxids = new Set([...selectedMxids, id]);
        manualInvite = "";
        error = "";
    }

    function removeSelected(mxid: string) {
        const next = new Set(selectedMxids);
        next.delete(mxid);
        selectedMxids = next;
    }

    function allInvites(): string[] {
        return [...selectedMxids];
    }

    function openChat() {
        openDialog = "chat";
        step = 1;
        resetForm();
    }
    function openRoom() {
        openDialog = "room";
        step = 1;
        resetForm();
    }
    function openVideo() {
        openDialog = "video";
        step = 1;
        resetForm();
    }
    function close() {
        openDialog = null;
        step = 1;
        resetForm();
    }

    function nextStep() {
        if (openDialog !== "chat" && !roomName.trim()) {
            error = "Room name is required";
            return;
        }
        error = "";
        step = 2;
    }

    function resetForm() {
        roomName = "";
        roomTopic = "";
        roomVisibility = "private";
        manualInvite = "";
        selectedMxids = new Set();
        userSearch = "";
        isLoading = false;
        error = "";
        clearAvatar();
    }

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

    async function handleCreateChat() {
        const invites = allInvites();
        if (invites.length === 0) {
            error = "Select or enter at least one user";
            return;
        }
        isLoading = true;
        error = "";
        try {
            const res = (await Matrix.client?.createRoom({
                is_direct: true,
                invite: invites,
                preset: sdk.Preset.TrustedPrivateChat,
            })) as { room_id: string };
            console.log("Created DM:", res.room_id);
            close();
        } catch (e: any) {
            error = e.message ?? "Failed to create chat";
        } finally {
            isLoading = false;
        }
    }

    async function handleCreateRoom(isVideo = false) {
        isLoading = true;
        error = "";
        try {
            const avatarMxc = await uploadAvatar();
            const videoState = {
                type: "im.vector.room.set_restrict_room_membership",
                state_key: "",
                content: { type: "video_room" },
            };
            const avatarState = avatarMxc
                ? {
                      type: "m.room.avatar",
                      state_key: "",
                      content: { url: avatarMxc },
                  }
                : null;
            const initial_state: any[] = [
                avatarState,
                isVideo ? videoState : null,
            ].filter(Boolean);

            if (Rooms.selectedSpace && Matrix.client) {
                initial_state.push({
                    type: "m.space.parent",
                    state_key: Rooms.selectedSpace,
                    content: {
                        via: [Matrix.client.getDomain()],
                        canonical: true,
                    },
                });
            }

            const res = (await Matrix.client?.createRoom({
                name: roomName.trim(),
                topic: roomTopic.trim() || undefined,
                visibility:
                    roomVisibility === "private"
                        ? sdk.Visibility.Private
                        : sdk.Visibility.Public,
                preset:
                    roomVisibility === "private"
                        ? sdk.Preset.PrivateChat
                        : sdk.Preset.PublicChat,
                invite: allInvites(),
                ...(initial_state.length > 0 && { initial_state }),
                ...(isVideo &&
                    !avatarMxc && { room_version: "org.matrix.msc3898" }),
            })) as { room_id: string };
            console.log("Created room:", res.room_id);

            if (Rooms.selectedSpace && Matrix.client) {
                await Matrix.client.sendStateEvent(
                    Rooms.selectedSpace,
                    sdk.EventType.SpaceChild,
                    { via: [Matrix.client.getDomain()!] },
                    res.room_id,
                );
            }

            close();
        } catch (e: any) {
            error = e.message ?? "Failed to create room";
        } finally {
            isLoading = false;
        }
    }
</script>

<!-- Hidden file input -->
<input
    bind:this={fileInput}
    type="file"
    accept="image/*"
    class="hidden"
    onchange={onAvatarPicked}
/>

<!-- Trigger -->
<DropdownMenu.Root>
    <DropdownMenu.Trigger>
        {#snippet child({ props })}
            <Tooltip.Root>
                <Tooltip.Trigger>
                    <Button size="icon" {...props}><Plus /></Button>
                </Tooltip.Trigger>
                <Tooltip.Content side="bottom">Create a Room</Tooltip.Content>
            </Tooltip.Root>
        {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content class="bg-black/10 backdrop-blur-sm border-2">
        <DropdownMenu.Group>
            <DropdownMenu.Item onclick={openChat}>
                <MessageSquare
                    class="stroke-[1.5] stroke-primary opacity-100"
                /> Start chat
            </DropdownMenu.Item>
            <DropdownMenu.Item onclick={openRoom}>
                <Hash class="stroke-[1.5] stroke-primary opacity-100" /> New room
            </DropdownMenu.Item>
            <DropdownMenu.Item onclick={openVideo}>
                <Video class="stroke-[1.5] stroke-primary opacity-100" /> New video
                room
            </DropdownMenu.Item>
        </DropdownMenu.Group>
    </DropdownMenu.Content>
</DropdownMenu.Root>

<!-- ─── Shared step indicator snippet ─── -->
{#snippet stepIndicator(current: number, total: number)}
    <div class="flex items-center gap-2 mb-1">
        {#each Array(total) as _, i}
            <div
                class="h-1 flex-1 rounded-full transition-colors {i + 1 <=
                current
                    ? 'bg-primary'
                    : 'bg-muted'}"
            ></div>
        {/each}
    </div>
    <p class="text-xs text-muted-foreground">Step {current} of {total}</p>
{/snippet}

<!-- ─── Shared invite step snippet ─── -->
{#snippet inviteStep()}
    <div class="flex flex-col gap-3">
        <!-- Selected chips -->
        {#if selectedMxids.size > 0}
            <div class="flex flex-wrap gap-1.5">
                {#each [...selectedMxids] as mxid}
                    <span
                        class="flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-medium"
                    >
                        {knownUsers.find((u) => u.userId === mxid)
                            ?.displayName ?? mxid}
                        <button
                            onclick={() => removeSelected(mxid)}
                            class="text-muted-foreground hover:text-foreground"
                        >
                            <X class="size-3" />
                        </button>
                    </span>
                {/each}
            </div>
        {/if}

        <!-- Search known users -->
        <div class="relative">
            <Search
                class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
            />
            <Input
                bind:value={userSearch}
                placeholder="Search users…"
                class="pl-8"
            />
        </div>

        <!-- User list -->
        <div
            class="flex flex-col gap-0.5 max-h-44 overflow-y-auto rounded-md border border-input bg-muted/30 p-1"
        >
            {#if filteredUsers.length === 0}
                <p class="text-xs text-muted-foreground text-center py-4">
                    No users found
                </p>
            {:else}
                {#each filteredUsers as user}
                    {@const selected = selectedMxids.has(user.userId)}
                    <button
                        onclick={() => toggleUser(user.userId)}
                        class="flex items-center gap-2.5 px-2 py-1.5 rounded-sm text-sm hover:bg-muted transition-colors text-left {selected
                            ? 'bg-primary/10'
                            : ''}"
                    >
                        <!-- Avatar or fallback -->
                        <span
                            class="size-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold shrink-0 overflow-hidden"
                        >
                            {#if user.avatarUrl}
                                <img
                                    src={Matrix.client?.mxcUrlToHttp(
                                        user.avatarUrl,
                                        28,
                                        28,
                                        "crop",
                                    ) ?? ""}
                                    alt=""
                                    class="size-full object-cover"
                                />
                            {:else}
                                {(user.displayName ??
                                    user.userId)[1]?.toUpperCase()}
                            {/if}
                        </span>
                        <span class="flex-1 min-w-0">
                            <p class="font-medium truncate">
                                {user.displayName ?? user.userId}
                            </p>
                            <p class="text-xs text-muted-foreground truncate">
                                {user.userId}
                            </p>
                        </span>
                        {#if selected}
                            <Check class="size-4 text-primary shrink-0" />
                        {/if}
                    </button>
                {/each}
            {/if}
        </div>

        <!-- Manual input -->
        <div class="flex flex-col gap-1.5">
            <Label>Add by MXID</Label>
            <div class="flex gap-2">
                <Input
                    bind:value={manualInvite}
                    placeholder="@user:server.org"
                    onkeydown={(e) => e.key === "Enter" && addManualInvite()}
                />
                <Button variant="outline" onclick={addManualInvite}>Add</Button>
            </div>
            <p class="text-xs text-muted-foreground">
                For users not in the list above
            </p>
        </div>

        {#if error}<p class="text-sm text-destructive">{error}</p>{/if}
    </div>
{/snippet}

<!-- ─── Start Chat ─── -->
<Dialog.Root open={openDialog === "chat"} onOpenChange={(o) => !o && close()}>
    <Dialog.Content>
        <Dialog.Header>
            <Dialog.Title>Start a Chat</Dialog.Title>
            <Dialog.Description>
                {step === 1
                    ? "Who do you want to message?"
                    : "Confirm your selection."}
            </Dialog.Description>
            {@render stepIndicator(step, 1)}
        </Dialog.Header>

        <div class="py-2">
            {@render inviteStep()}
        </div>

        <Dialog.Footer>
            <Button variant="outline" onclick={close}>Cancel</Button>
            <Button onclick={handleCreateChat} disabled={isLoading}>
                {isLoading ? "Creating…" : "Start chat"}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<!-- ─── New Room ─── -->
<Dialog.Root open={openDialog === "room"} onOpenChange={(o) => !o && close()}>
    <Dialog.Content>
        <Dialog.Header>
            <Dialog.Title>New Room</Dialog.Title>
            <Dialog.Description>
                {step === 1 ? "Set up your room." : "Invite people to join."}
            </Dialog.Description>
            {@render stepIndicator(step, 2)}
        </Dialog.Header>

        <div class="py-2">
            {#if step === 1}
                <div class="flex flex-col gap-4">
                    <!-- Avatar -->
                    <button
                        type="button"
                        onclick={() => fileInput.click()}
                        class="relative size-40 mx-auto shrink-0 rounded-lg border-2 border-dashed border-input bg-muted flex items-center justify-center overflow-hidden hover:border-primary transition-colors"
                    >
                        {#if avatarPreview}
                            <img
                                src={avatarPreview}
                                alt="Room avatar preview"
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
                        <Label for="room-name">Room name *</Label>
                        <Input
                            id="room-name"
                            bind:value={roomName}
                            placeholder="My Room"
                        />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <Label for="room-topic">Topic</Label>
                        <Input
                            id="room-topic"
                            bind:value={roomTopic}
                            placeholder="What's this room about?"
                        />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <Label for="room-visibility">Visibility</Label>
                        <select
                            id="room-visibility"
                            bind:value={roomVisibility}
                            class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        >
                            <option value="private">Private</option>
                            <option value="public">Public</option>
                        </select>
                    </div>
                    {#if error}<p class="text-sm text-destructive">
                            {error}
                        </p>{/if}
                </div>
            {:else}
                {@render inviteStep()}
            {/if}
        </div>

        <Dialog.Footer>
            {#if step === 1}
                <Button variant="outline" onclick={close}>Cancel</Button>
                <Button onclick={nextStep}>Next</Button>
            {:else}
                <Button
                    variant="outline"
                    onclick={() => {
                        step = 1;
                        error = "";
                    }}>Back</Button
                >
                <Button
                    onclick={() => handleCreateRoom(false)}
                    disabled={isLoading}
                >
                    {isLoading ? "Creating…" : "Create room"}
                </Button>
            {/if}
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

<!-- ─── New Video Room ─── -->
<Dialog.Root open={openDialog === "video"} onOpenChange={(o) => !o && close()}>
    <Dialog.Content>
        <Dialog.Header>
            <Dialog.Title>New Video Room</Dialog.Title>
            <Dialog.Description>
                {step === 1
                    ? "Set up your video room."
                    : "Invite people to join."}
            </Dialog.Description>
            {@render stepIndicator(step, 2)}
        </Dialog.Header>

        <div class="py-2">
            {#if step === 1}
                <div class="flex flex-col gap-4">
                    <!-- Avatar -->
                    <button
                        type="button"
                        onclick={() => fileInput.click()}
                        class="relative size-40 mx-auto shrink-0 rounded-lg border-2 border-dashed border-input bg-muted flex items-center justify-center overflow-hidden hover:border-primary transition-colors"
                    >
                        {#if avatarPreview}
                            <img
                                src={avatarPreview}
                                alt="Room avatar preview"
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
                        <Label for="video-room-name">Room name *</Label>
                        <Input
                            id="video-room-name"
                            bind:value={roomName}
                            placeholder="My Video Room"
                        />
                    </div>
                    {#if error}<p class="text-sm text-destructive">
                            {error}
                        </p>{/if}
                </div>
            {:else}
                {@render inviteStep()}
            {/if}
        </div>

        <Dialog.Footer>
            {#if step === 1}
                <Button variant="outline" onclick={close}>Cancel</Button>
                <Button onclick={nextStep}>Next</Button>
            {:else}
                <Button
                    variant="outline"
                    onclick={() => {
                        step = 1;
                        error = "";
                    }}>Back</Button
                >
                <Button
                    onclick={() => handleCreateRoom(true)}
                    disabled={isLoading}
                >
                    {isLoading ? "Creating…" : "Create video room"}
                </Button>
            {/if}
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>
