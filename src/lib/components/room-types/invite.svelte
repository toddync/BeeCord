<script lang="ts">
    import Avatar from "$lib/components/avatar.svelte";
    import Button from "$lib/components/ui/button/button.svelte";
    import Matrix from "$lib/stores/Matrix.svelte";
    import Rooms from "$lib/stores/Rooms.svelte";
    import * as sdk from "matrix-js-sdk";

    let { room }: { room: sdk.Room } = $props();

    const inviterMxid =
        room.getMember(room.myUserId)?.events.member?.getSender() ?? "";
    const inviter = inviterMxid ? room.getMember(inviterMxid) : null;
    const memberCount = room.getJoinedMemberCount();
</script>

<div
    class="mx-auto my-auto flex flex-col items-center gap-4 max-w-sm text-center"
>
    <Avatar
        id={room.roomId}
        name={room.name}
        url={room.getMxcAvatarUrl()}
        class="rounded-lg font-extrabold text-2xl size-20"
    />
    <div>
        <p class="text-xl font-bold">{room.name}</p>
        {#if room.currentState
            .getStateEvents("m.room.topic", "")
            ?.getContent()?.topic}
            <p class="text-sm text-muted-foreground mt-1">
                {room.currentState
                    .getStateEvents("m.room.topic", "")
                    ?.getContent().topic}
            </p>
        {/if}
        <p class="text-xs text-muted-foreground mt-1">
            {memberCount} member{memberCount !== 1 ? "s" : ""}
        </p>
    </div>

    {#if inviterMxid}
        <div
            class="flex flex-col items-center gap-2 text-sm text-muted-foreground"
        >
            <div class="flex items-center gap-2">
                <Avatar
                    id={inviterMxid}
                    name={inviter?.name ?? inviterMxid}
                    url={inviter?.getMxcAvatarUrl() ?? null}
                    class="rounded-full size-6"
                />
                <span>
                    Invited by <span class="font-medium text-foreground"
                        >{inviter?.name ?? inviterMxid}</span
                    >
                </span>
            </div>
            {#if inviter?.name && inviter.name !== inviterMxid}
                <span class="text-xs">{inviterMxid}</span>
            {/if}
        </div>
    {/if}

    <!-- Actions -->
    <div class="flex gap-2 mt-2">
        <Button
            onclick={() =>
                Matrix.client?.joinRoom(room.roomId).then((r) => {
                    Rooms.rooms[r.roomId] = r;
                })}
        >
            Accept
        </Button>

        <Button
            onclick={() => Matrix.client?.leave(room.roomId)}
            variant="destructive"
        >
            Decline
        </Button>
    </div>
</div>
