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
    const content: ImageContent = event.getContent();

    let objectUrl = $state<string | null>(null);
    let h = Math.min(
        content.info?.h || content.info?.thumbnail_info?.h || 80,
        384,
    );
    let w = Math.min(
        content.info?.w || content.info?.thumbnail_info?.w || 80,
        384,
    );

    $effect(() => {
        let revoked = false;

        Rooms.loadMediaObjectUrl(content).then((url) => {
            if (!revoked && url) objectUrl = url;
        });
        return () => {
            revoked = true;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                objectUrl = null;
            }
        };
    });
</script>

<ChatBubbleMessage class="min-w-20" variant={isMe ? "sent" : "received"}>
    {#if objectUrl}
        <img
            src={objectUrl}
            alt={content.body}
            height={h}
            width={w}
            class="rounded-md object-contain max-h-96"
        />
    {:else}
        <div
            class="rounded-md bg-muted animate-pulse max-h-96 max-w-96"
            style=" height: {h}px; width: {w}px"
        ></div>
    {/if}
    <ChatBubbleTimestamp class="whitespace-pre" {timestamp} />
</ChatBubbleMessage>
