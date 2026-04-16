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
        <div class="size-8 relative shrink-0 overflow-visible">
            <Avatar
                id={room.roomId}
                bind:name={room.name}
                bind:url={room.avatar}
                class="rounded-md font-extrabold"
            />
            {#if room.type?.includes("call")}
                <Tooltip.Root>
                    <Tooltip.Trigger
                        class="rounded-full size-7 bg-sidebar flex bottom-0 right-0 translate-x-1/2 translate-y-1/2 absolute"
                    >
                        <Video
                            class="size-4 stroke-[1.5] stroke-primary mx-auto my-auto"
                        />
                    </Tooltip.Trigger>
                    <Tooltip.Content>Video call room</Tooltip.Content>
                </Tooltip.Root>
            {/if}
        </div>

        <div
            class="flex min-w-0 flex-1 items-center gap-1 text-sm leading-tight"
        >
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                <div class="flex items-center gap-1">
                    <span class="truncate font-medium">{room.name}</span>
                    {#if room.unreadCount}
                        <span
                            class="ml-auto flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary"
                        >
                            {room.unreadCount}
                        </span>
                    {/if}
                </div>

                {#if room.lastMessage}
                    <div class="flex items-center gap-1 overflow-hidden">
                        <p class="truncate text-xs text-muted-foreground">
                            <span class="font-medium">
                                {Matrix.client?.getUser(
                                    room.lastMessage.getSender() || "",
                                )?.displayName}:
                            </span>
                            {room.lastMessage?.getContent().body}
                        </p>
                        <time class="ml-auto shrink-0 text-xs text-primary/50">
                            {new Date(
                                room.lastMessage.getTs(),
                            ).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </time>
                    </div>
                {/if}
            </div>

            {#if room.room_?.getMyMembership() == "invite"}
                <Tooltip.Root>
                    <Tooltip.Trigger class="ml-auto shrink-0 self-center">
                        <MailPlus class="size-4 stroke-[1.5] stroke-primary" />
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        You were invited to this room
                    </Tooltip.Content>
                </Tooltip.Root>
            {/if}
        </div>
    </Sidebar.MenuButton>
</Sidebar.MenuItem>
