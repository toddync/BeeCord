<script lang="ts">
    import Avatar from "$lib/components/avatar.svelte";
    import { Button } from "$lib/components/ui/button";
    import * as Sidebar from "$lib/components/ui/sidebar/index.js";
    import BeeCord from "$lib/stores/BeeCord.svelte";
    import Matrix from "$lib/stores/Matrix.svelte";
    import Rooms from "$lib/stores/Rooms.svelte";
    import Sidebars from "$lib/stores/Sidebars.svelte";
    import { createHotkey } from "@tanstack/svelte-hotkeys";
    import { Shield, ShieldAlert, UserPlus, X } from "lucide-svelte";
    import * as sdk from "matrix-js-sdk";

    let activeRoom = $derived(
        Rooms.selectedRoom ? Rooms.rooms[Rooms.selectedRoom] : null,
    );
    let activeSpace = $derived(
        !Rooms.selectedRoom && Rooms.selectedSpace
            ? Rooms.spaces[Rooms.selectedSpace]
            : null,
    );

    let id = $derived(activeRoom?.roomId || activeSpace?.roomId);
    let name = $derived(activeRoom?.name || activeSpace?.name || "Settings");
    let avatarUrl = $derived(
        activeRoom?.avatar || activeSpace?.getMxcAvatarUrl?.(),
    );
    let matrixRoom = $derived(activeRoom?.room_ || activeSpace);

    // Matrix room members state
    let members = $derived(matrixRoom?.getJoinedMembers() || []);

    // Power level mapping helper
    function getPowerLevelIcon(powerLevel: number) {
        if (powerLevel >= 100) return ShieldAlert; // Admin
        if (powerLevel >= 50) return Shield; // Moderator
        return null;
    }

    function getPowerLevelText(powerLevel: number) {
        if (powerLevel >= 100) return "Admin";
        if (powerLevel >= 50) return "Moderator";
        return "Default";
    }

    async function invitePrompt() {
        if (!matrixRoom) return;
        const targetUserId = prompt("Enter User ID (@user:server.com):");
        if (targetUserId) {
            try {
                await Matrix.client?.invite(matrixRoom.roomId, targetUserId);
                alert("Invited user successfully!");
            } catch (err) {
                console.error(err);
                alert("Failed to invite user");
            }
        }
    }

    createHotkey("Mod+]", () => {
        Sidebars.right = !Sidebars.right;
    });
</script>

{#if matrixRoom}
    <Sidebar.Root
        side="right"
        variant="sidebar"
        class="bg-card w-72 border-l border-border hidden md:flex {![
            'ios',
            'android',
            'web',
        ].includes(BeeCord.platform) && 'max-h-[calc(100svh-32px)] mt-8'}"
    >
        <Sidebar.Header
            class="p-4 border-b border-border flex items-center justify-between"
        >
            <h2 class="font-semibold text-lg max-w-full truncate">
                {name} Settings
            </h2>
        </Sidebar.Header>

        <Sidebar.Content class="p-4 overflow-y-auto">
            <div class="flex flex-col items-center gap-3 mb-6">
                <Avatar
                    id={id!}
                    {name}
                    url={avatarUrl}
                    class="w-20 h-20 rounded-xl"
                />
                <h3 class="font-bold text-xl text-center break-all">{name}</h3>
                {#if matrixRoom.currentState
                    ?.getStateEvents("m.room.topic", "")
                    ?.getContent().topic}
                    <p class="text-xs text-muted-foreground text-center">
                        {matrixRoom.currentState
                            ?.getStateEvents("m.room.topic", "")
                            ?.getContent().topic}
                    </p>
                {/if}
            </div>

            <div class="flex items-center justify-between mb-4 mt-6">
                <h4 class="font-semibold text-sm text-foreground/80">
                    Members ({members.length})
                </h4>
                {#if matrixRoom.canInvite(Matrix.user_id!)}
                    <Button
                        variant="ghost"
                        size="icon"
                        class="h-6 w-6"
                        onclick={invitePrompt}
                    >
                        <UserPlus class="w-4 h-4" />
                    </Button>
                {/if}
            </div>

            <div class="flex flex-col gap-2">
                {#each members as member (member.userId)}
                    {@const powerLevel = member.powerLevel}
                    {@const RoleIcon = getPowerLevelIcon(powerLevel)}

                    <div
                        class="flex items-center gap-3 w-full p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                        <Avatar
                            id={member.userId}
                            name={member.name || member.userId}
                            url={member.getMxcAvatarUrl()}
                            class="w-8 h-8 rounded-full"
                        />
                        <div class="flex-1 overflow-hidden">
                            <p class="text-sm font-medium truncate">
                                {member.name || member.userId}
                            </p>
                            <p
                                class="text-xs text-muted-foreground truncate"
                                title={getPowerLevelText(powerLevel)}
                            >
                                {getPowerLevelText(powerLevel)}
                            </p>
                        </div>
                        {#if RoleIcon}
                            <RoleIcon class="w-4 h-4 text-primary shrink-0" />
                        {/if}
                    </div>
                {/each}
            </div>
        </Sidebar.Content>
    </Sidebar.Root>
{/if}
