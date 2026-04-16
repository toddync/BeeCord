<script lang="ts">
    import Rooms from "$lib/stores/Rooms.svelte";
    import * as sdk from "matrix-js-sdk";
    import type { ImageContent } from "matrix-js-sdk/lib/types";
    import ChatBubbleMessage from "../ui/chat/chat-bubble/chat-bubble-message.svelte";
    import ChatBubbleTimestamp from "../ui/chat/chat-bubble/chat-bubble-timestamp.svelte";

    let {
        event,
        room,
        isMe,
        timestamp,
    }: {
        event: sdk.MatrixEvent;
        room: sdk.Room;
        isMe: boolean;
        timestamp: string;
    } = $props();
    // svelte-ignore state_referenced_locally
    const content: ImageContent = event.getContent();

    let height = $state(0);

    let objectUrl = $state<string | null>(null);
    let h = content.info?.h || content.info?.thumbnail_info?.h || 80;
    let w = content.info?.w || content.info?.thumbnail_info?.w || 80;
    $effect(() => {
        let cancelled = false;

        Rooms.loadMediaObjectUrl(content).then((url) => {
            if (!cancelled && url) objectUrl = url;
        });

        return () => {
            cancelled = true;
            objectUrl = null;
        };
    });
</script>

<div bind:clientHeight={height} class="flex">
    <ChatBubbleMessage class="min-w-20" variant={isMe ? "sent" : "received"}>
        {#if objectUrl}
            <img
                height={h}
                width={w}
                src={objectUrl}
                alt={content.body}
                class="rounded-md object-contain"
            />

            {#if content.filename && content.filename != content.body}
                <p class="break-word whitespace-pre-wrap min-w-12 pt-1">
                    {content.body}
                </p>
            {/if}
        {:else}
            <div
                class="rounded-md bg-muted animate-pulse max-w-96 max-h-96"
                style="height: {h}px; width: {w}px"
            ></div>
        {/if}

        <ChatBubbleTimestamp class="whitespace-pre" {timestamp} />
    </ChatBubbleMessage>
</div>
