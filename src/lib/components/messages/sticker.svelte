<script lang="ts">
    import Rooms from "$lib/stores/Rooms.svelte";
    import * as sdk from "matrix-js-sdk";
    import ChatBubbleTimestamp from "../ui/chat/chat-bubble/chat-bubble-timestamp.svelte";

    let {
        event,
        timestamp,
    }: {
        event: sdk.MatrixEvent;
        room: sdk.Room;
        isMe: boolean;
        timestamp: string;
    } = $props();

    // svelte-ignore state_referenced_locally
    const content = event.getContent();

    let height = $state(0);
    let objectUrl = $state<string | null>(null);
    let h = content.info?.h || content.info?.thumbnail_info?.h || 128;
    let w = content.info?.w || content.info?.thumbnail_info?.w || 128;

    $effect(() => {
        let cancelled = false;

        //@ts-ignore
        Rooms.loadMediaObjectUrl({
            msgtype: sdk.MsgType.Image,
            url: content.url,
            info: content.info,
        }).then((url) => {
            if (!cancelled && url) objectUrl = url;
        });

        return () => {
            cancelled = true;
            objectUrl = null;
        };
    });
</script>

<div bind:clientHeight={height} class="flex flex-col mb-1 relative group">
    {#if objectUrl}
        <img
            height={h}
            width={w}
            src={objectUrl}
            alt={content.body}
            class="object-contain"
        />
    {:else}
        <div
            class="rounded-md bg-muted animate-pulse max-w-96 max-h-96"
            style="height: {h}px; width: {w}px"
        ></div>
    {/if}

    <ChatBubbleTimestamp
        class="absolute bottom-0 right-1 px-1.5 py-0.5 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        {timestamp}
    />
</div>
