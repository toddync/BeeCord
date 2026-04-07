<script lang="ts">
    import Rooms from "$lib/stores/Rooms.svelte";
    import * as sdk from "matrix-js-sdk";
    import type {
        FileContent
    } from "matrix-js-sdk/lib/types";
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
    const content: FileContent = event.getContent();

    let objectUrl = $state<string | null>(null);

    $effect(() => {
        let revoked = false;
        Rooms.loadMediaObjectUrl(content).then((url) => {
            console.log(url)
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
    class="max-w-2xl min-w-20 h-18"
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
        <!-- <div class="w-full h-full rounded-md bg-muted animate-pulse "></div> -->
    {/if}
    <ChatBubbleTimestamp class="whitespace-pre" {timestamp} />
</ChatBubbleMessage>
