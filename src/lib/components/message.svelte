<script lang="ts">
    import Matrix from "$lib/stores/Matrix.svelte";
    import * as sdk from "matrix-js-sdk";
    import Avatar from "./avatar.svelte";
    import * as types from "./messages";
    import ChatBubble from "./ui/chat/chat-bubble/chat-bubble.svelte";

    let { event, room }: { event: sdk.MatrixEvent; room: sdk.Room } = $props();

    const isMe = event.getSender() === Matrix.client?.getUserId();
    const msgtype = event.getContent().msgtype || "m.text";
    const member = room.getMember(event.getSender()!);
    const timestamp = new Date(event.getTs()).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
    const senderName = member?.name || event.getSender();

    function getMessageComponent(event: sdk.MatrixEvent) {
        const eventType = event.getType();
        if (eventType === "org.matrix.msc3381.poll.start") return types.Poll;

        const msgtype = event.getContent().msgtype || "m.text";
        const key = msgtype.split(".")[1];
        const capitalized = key ? key.charAt(0).toUpperCase() + key.slice(1) : "";
        return (types as Record<string, any>)[capitalized] ?? types.Text;
    }

    const MessageComponent = getMessageComponent(event);
</script>

<ChatBubble variant={isMe ? "sent" : "received"} class={isMe ? "ml-auto" : "mr-auto"}>
    {#if !isMe}
        <Avatar
            id={member!.userId!}
            name={member!.name!}
            url={member!.getMxcAvatarUrl()!}
        />
    {/if}

    <div class="flex flex-col {isMe ? 'items-end' : 'items-start'}">
        {#if !isMe}
            <span class="text-xs text-muted-foreground ml-1 mb-1">
                {senderName}
            </span>
        {/if}

        <!-- svelte-ignore svelte_component_deprecated -->
        <svelte:component
            this={MessageComponent}
            {event}
            {room}
            {isMe}
            {timestamp}
        />
    </div>
</ChatBubble>
