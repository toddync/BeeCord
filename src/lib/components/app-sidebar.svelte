<script lang="ts">
    import * as Sidebar from "$lib/components/ui/sidebar/index.js";
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import * as Tooltip from "$lib/components/ui/tooltip";
    import BeeCord from "$lib/stores/BeeCord.svelte";
    import Matrix from "$lib/stores/Matrix.svelte";
    import Rooms from "$lib/stores/Rooms.svelte";
    import { hexagons7 } from "@lucide/lab";
    import { Icon } from "lucide-svelte";
    import Room from "./room.svelte";
    import CreateRoomMenu from "./create-room-menu.svelte";

    let { children } = $props();
    let { toggle, setOpen } = Sidebar.useSidebar();
</script>

<main
    class="h-full bg-sidebar border-r w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)] z-20 flex flex-col gap-1.5 pt-2 rounded-r-lg"
>
    <Tooltip.Root>
        <Tooltip.Trigger
            onclick={() => {
                if (Rooms.selectedSpace == "") {
                    toggle();
                } else {
                    Rooms.selectSpace("");
                    setOpen(true);
                }
            }}
            class="cursor-pointer relative"
        >
            {#if Rooms.selectedSpace == ""}
                <div
                    class="bg-primary/60 h-full w-1 rounded-md left-0.5 translate-x-1/2 absolute"
                ></div>
            {/if}

            <div
                class="w-10 aspect-square mx-auto rounded-md overflow-hidden border border-primary/40"
            >
                <div
                    class="w-full h-full flex items-center justify-center rounded-md font-extrabold select-none bg-radial from-primary/1 to-primary/30"
                >
                    <Icon
                        iconNode={hexagons7}
                        class="text-primary stroke-[1.5]"
                    />
                </div>
            </div>
        </Tooltip.Trigger>
        <Tooltip.Content side="right">All Rooms</Tooltip.Content>
    </Tooltip.Root>

    <hr class="w-[80%] mx-auto" />

    {#each Object.values(Rooms.spaces) as space (space.roomId)}
        {@const image = space.getAvatarUrl?.(
            Matrix.homeserver,
            100,
            100,
            "scale",
        )}
        {@const [color, gradient] = Rooms.getColorFromId(space.roomId)}

        <Tooltip.Root>
            <Tooltip.Trigger
                onclick={() => {
                    if (Rooms.selectedSpace == space.roomId) {
                        toggle();
                    } else {
                        Rooms.selectSpace(space.roomId);
                        setOpen(true);
                    }
                }}
                class="cursor-pointer relative"
            >
                {#if Rooms.selectedSpace == space.roomId}
                    <div
                        class="h-full w-1 rounded-md left-0.5 translate-x-1/2 absolute"
                        style="background-color: hsla({color}, 0.6)"
                    ></div>
                {/if}

                <div
                    class="w-10 aspect-square mx-auto rounded-md overflow-hidden"
                >
                    {#if image}
                        <img
                            src={image}
                            class="rounded-md w-full h-full object-cover"
                            alt=""
                        />
                    {:else}
                        <div
                            class="w-full h-full flex items-center justify-center rounded-md text-white font-extrabold select-none"
                            style="background: {gradient}; color: hsl({color}); border: 1px solid hsla({color}, 0.3)"
                        >
                            {Rooms.getInitials(space.name ?? space.roomId)}
                        </div>
                    {/if}
                </div>
            </Tooltip.Trigger>
            <Tooltip.Content side="right">
                {space.name}
            </Tooltip.Content>
        </Tooltip.Root>
    {/each}
</main>

<main class="flex-1 flex">
    <Sidebar.Root
        class="ml-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)] {![
            'ios',
            'android',
            'web',
        ].includes(BeeCord.platform) && 'max-h-[calc(100svh-32px)] mt-8'}"
        variant="floating"
        collapsible="offcanvas"
    >
        <Sidebar.Content>
            <Sidebar.Menu class="py-2 px-1">
                {@const rooms =
                    (Rooms.selectedSpace == "" && Object.values(Rooms.rooms)) ||
                    Rooms.spaces[Rooms.selectedSpace].childs.map(
                        (c) => Rooms.rooms[c],
                    )}

                <Tabs.Root value="all">
                    <div class="flex">
                        <Tabs.List class="mx-auto">
                            <Tabs.Trigger value="all">All</Tabs.Trigger>
                            <Tabs.Trigger value="text">Text</Tabs.Trigger>
                            <Tabs.Trigger value="video">Video</Tabs.Trigger>
                            <Tabs.Trigger value="invite">Invite</Tabs.Trigger>
                        </Tabs.List>

                        <CreateRoomMenu />
                    </div>

                    <Tabs.Content value="all">
                        {#each rooms as room (room.roomId)}
                            <Room {room} />
                        {/each}
                    </Tabs.Content>
                    <Tabs.Content value="text">
                        {#each rooms.filter((r) => !r.room_?.isCallRoom()) as room (room.roomId)}
                            <Room {room} />
                        {/each}
                    </Tabs.Content>
                    <Tabs.Content value="video">
                        {#each rooms.filter( (r) => r.room_?.isCallRoom(), ) as room (room.roomId)}
                            <Room {room} />
                        {/each}
                    </Tabs.Content>
                    <Tabs.Content value="invite">
                        {#each rooms.filter((r) => r.room_?.getMyMembership() === "invite") as room (room.roomId)}
                            <Room {room} />
                        {/each}
                    </Tabs.Content>
                </Tabs.Root>
            </Sidebar.Menu>
        </Sidebar.Content>
    </Sidebar.Root>

    {@render children?.()}
</main>
