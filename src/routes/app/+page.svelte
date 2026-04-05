<script lang="ts">
    import Chat from "$lib/components/chat.svelte";
    import Call from "$lib/components/room-types/call.svelte";
    import Invite from "$lib/components/room-types/invite.svelte";
    import * as Empty from "$lib/components/ui/empty";
    import Rooms from "$lib/stores/Rooms.svelte";
</script>

<main class="flex flex-1">
    {#if Rooms.selectedRoom !== ""}
        {@const room = Rooms.rooms[Rooms.selectedRoom]}

        {#if room.room_?.getMyMembership() === "invite"}
            <Invite {room} />
        {:else if room.room_?.isCallRoom()}
            <Call {room} />
        {:else}
            <Chat room={Rooms.rooms[Rooms.selectedRoom]} />
        {/if}
    {:else}
        <Empty.Root></Empty.Root>
    {/if}
</main>
