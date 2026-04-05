<script lang="ts">
    import * as sdk from "matrix-js-sdk";
    import ChatBubbleMessage from "../ui/chat/chat-bubble/chat-bubble-message.svelte";
    import ChatBubbleTimestamp from "../ui/chat/chat-bubble/chat-bubble-timestamp.svelte";
    import type { MediaEventContent } from "matrix-js-sdk/lib/types";
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
    const content: MediaEventContent = event.getContent();

    let objectUrl = $state<string | null>(null);

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

<ChatBubbleMessage
    class="max-w-2xl min-w-20"
    variant={isMe ? "sent" : "received"}
>
    {#if objectUrl}
        <a
            href={objectUrl}
            download
            target="_blank"
            class="text-blue-500 hover:underline mb-1 whitespace-pre-wrap"
            >{content.body}</a
        >
    {:else}
        <div class="w-20 h-20 rounded-md bg-muted animate-pulse mb-1"></div>
    {/if}
    <ChatBubbleTimestamp class="whitespace-pre" {timestamp} />
</ChatBubbleMessage>
