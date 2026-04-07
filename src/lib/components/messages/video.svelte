<script lang="ts">
    import * as sdk from "matrix-js-sdk";
    import ChatBubbleMessage from "../ui/chat/chat-bubble/chat-bubble-message.svelte";
    import ChatBubbleTimestamp from "../ui/chat/chat-bubble/chat-bubble-timestamp.svelte";
    import type {
        MediaEventContent,
        VideoContent,
    } from "matrix-js-sdk/lib/types";
    import Rooms from "$lib/stores/Rooms.svelte";

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
    const content: VideoContent = event.getContent();

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
        return;
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

<ChatBubbleMessage
    class="max-w-2xl min-w-20"
    variant={isMe ? "sent" : "received"}
>
    {#if objectUrl}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
            src={objectUrl}
            controls
            class="rounded-md object-contain max-h-96 max-w-96"
        ></video>
    {:else}
        <div
            class="rounded-md bg-muted animate-pulse"
            style=" height: {h}px; width: {w}px"
        ></div>
    {/if}
    <ChatBubbleTimestamp class="whitespace-pre" {timestamp} />
</ChatBubbleMessage>
