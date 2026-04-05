<script lang="ts">
    import * as Sidebar from "$lib/components/ui/sidebar/index.js";
    import * as Tooltip from "$lib/components/ui/tooltip/index.js";
    import Rooms, { RoomState } from "$lib/stores/Rooms.svelte";
    import { MailPlus, Video } from "@lucide/svelte";
    import Avatar from "./avatar.svelte";
    import Matrix from "$lib/stores/Matrix.svelte";

    let { room }: { room: RoomState } = $props();
    let selected = $derived.by(() => Rooms.selectedRoom == room.roomId);
</script>

<Sidebar.MenuItem>
    <Sidebar.MenuButton
        size="lg"
        data-selected={selected || null}
        class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground data-selected:bg-primary/10"
        onclick={() => Rooms.selectRoom(room.roomId)}
    >
        <div class="size-8 relative overflow-visible">
            <Avatar
                id={room.roomId}
                bind:name={room.name}
                bind:url={room.avatar}
                class="rounded-md font-extrabold"
            />

            {#if room.type?.includes("call")}
                <Tooltip.Root>
                    <Tooltip.Trigger
                        class="rounded-full size-6 bg-sidebar flex bottom-0 right-0 translate-x-1/2 translate-y-1/2 absolute"
                    >
                        <Video
                            class="size-4 stroke-1.5 stroke-primary mx-auto my-auto"
                        />
                    </Tooltip.Trigger>
                    <Tooltip.Content>Video call room</Tooltip.Content>
                </Tooltip.Root>
            {/if}
        </div>
        <div class="flex flex-1 text-start text-sm leading-tight">
            <div class="flex flex-col">
                <span class="truncate font-medium">
                    {room.name}
                    {room.unreadCount}
                </span>

                {#if room.lastMessage}
                    <span
                        class="truncate text-ellipsis text-xs text-muted-foreground"
                    >
                        {Matrix.client?.getUser(
                            room.lastMessage.getSender() || "",
                        )?.displayName}:
                        {room.lastMessage?.getContent().body}
                    </span>
                {/if}
            </div>

            {#if room.room_?.getMyMembership() == "invite"}
                <Tooltip.Root>
                    <Tooltip.Trigger class="ml-auto my-auto">
                        <MailPlus class="stroke-1.5 stroke-primary size-4" />
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        You where invited to this room
                    </Tooltip.Content>
                </Tooltip.Root>
            {/if}
        </div>
    </Sidebar.MenuButton>
</Sidebar.MenuItem>
