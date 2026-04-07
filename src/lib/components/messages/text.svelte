<script lang="ts">
    import * as sdk from "matrix-js-sdk";
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
    const content = event.getContent();
</script>

<ChatBubbleMessage
    class="max-w-2xl min-w-20"
    variant={isMe ? "sent" : "received"}
>
    <p class="break-word whitespace-pre-wrap min-w-12">
        {content.body}
    </p>
    <ChatBubbleTimestamp class="whitespace-pre" {timestamp} />
</ChatBubbleMessage>
