<script lang="ts">
    import Matrix from "$lib/stores/Matrix.svelte";
    import type { RoomState } from "$lib/stores/Rooms.svelte";
    import { layout, prepare, type PreparedText } from "@chenglou/pretext";
    import * as sdk from "matrix-js-sdk";
    //@ts-ignore
    import VirtualList from "svelte-tiny-virtual-list";
    import Avatar from "../avatar.svelte";
    import Message from "../message.svelte";
    import ChatBubbleMessage from "../ui/chat/chat-bubble/chat-bubble-message.svelte";
    import ChatBubble from "../ui/chat/chat-bubble/chat-bubble.svelte";
    import type { ImageContent, VideoContent } from "matrix-js-sdk/lib/types";

    let {
        room,
        messages = $bindable([]),
        typing = $bindable([]),
    }: {
        room: RoomState;
        messages: sdk.MatrixEvent[];
        typing: string[];
    } = $props();

    // -- Virtual list --
    const TEXT_FONT = "16px ui-sans-serif, system-ui, sans-serif";
    const LINE_HEIGHT = 24;
    const BUBBLE_CHROME = 56;

    const GAP = 24;
    const FALLBACK_HEIGHT = 72; // images, files, polls, redacted events, …

    const prepareCache = new Map<string, PreparedText>();

    let containerWidth = $state(0);
    let viewportHeight = $state(0);

    let scrollToIndex = $state(-1);
    // True while the user is at (or near) the bottom.
    let pinnedToBottom = $state(true);

    // -------------------------------------------------------------------------
    // Height calculation (pretext)
    // -------------------------------------------------------------------------

    function getMessageHeight(event: sdk.MatrixEvent): number {
        const type = event.getType();
        let content = event.getContent();

        let sender: number = (event.getSender() !== Matrix.user_id && 16) || 0;

        if (type === "m.room.message") {
            switch (content.msgtype) {
                case "m.text":
                    const text: string = content.body ?? "";
                    if (!text) return FALLBACK_HEIGHT + sender;

                    // Replicate the CSS constraint chain:
                    //   outer: max-w-[60%]  →  bubble: max-w-2xl (672px)  →  minus p-4×2
                    const bubbleMax = Math.min(containerWidth * 0.6, 672);
                    const textWidth = bubbleMax - 32;

                    const cacheKey = event.getId() ?? text;
                    if (!prepareCache.has(cacheKey)) {
                        prepareCache.set(
                            cacheKey,
                            prepare(text, TEXT_FONT, {
                                whiteSpace: "pre-wrap",
                            }),
                        );
                    }

                    const { height } = layout(
                        prepareCache.get(cacheKey)!,
                        textWidth,
                        LINE_HEIGHT,
                    );
                    return height + BUBBLE_CHROME + sender;

                case "m.audio":
                    return 58 + sender;
                case "m.image":
                case "m.video":
                    content = content as ImageContent;

                    return (
                        Math.min(
                            384,
                            content.info?.h || content.info?.thumbnail_info?.h,
                        ) +
                        BUBBLE_CHROME +
                        sender
                    );
            }
        }

        return FALLBACK_HEIGHT + sender;
    }

    // -------------------------------------------------------------------------
    // Auto-scroll to bottom on new messages (when pinned)
    // -------------------------------------------------------------------------

    // $effect(() => {
    //     const len = messages.length;
    //     if (pinnedToBottom && len > 0) {
    //         scrollToIndex = len - 1;
    //     }
    // });

    // function onScroll(
    //     _event: Event,
    //     offset: number,
    //     _direction: "forward" | "backward",
    // ) {
    //     // Reset after the jump so VirtualList doesn't fight the user.
    //     if (scrollToIndex !== -1) scrollToIndex = -1;

    //     // Re-pin if the user scrolls back near the bottom.
    //     const totalHeight = messages.reduce(
    //         (sum, _, i) => sum + (itemSize as (i: number) => number)(i),
    //         0,
    //     );
    //     pinnedToBottom = totalHeight - offset - viewportHeight < 60;
    // }
    $inspect(messages);
</script>

<div
    class="min-h-0 overflow-hidden"
    bind:clientWidth={containerWidth}
    bind:clientHeight={viewportHeight}
>
    <VirtualList
        width="100%"
        height={viewportHeight}
        itemCount={messages.length}
        scrollToAlignment="end"
        itemSize={(index: number) =>
            getMessageHeight(messages[index]) +
            (index < messages.length - 1 ? GAP : 0)}
        scrollToIndex={scrollToIndex >= 0 && scrollToIndex < messages.length
            ? scrollToIndex
            : undefined}
    >
        {#snippet item({ style, index }: { style: string; index: number })}
            <div {style} class="px-4 box-border">
                <Message event={messages[index]} room={room.room_!} />
            </div>
        {/snippet}

        {#snippet footer()}
            {#if typing.length > 0}
                <div class="px-4 pb-4">
                    <ChatBubble variant="received">
                        {#each typing as typer, i (typer)}
                            {@const member = room.room_?.getMember(typer)!}
                            <span class={(i > 0 && "-ml-1/3") || ""}>
                                <Avatar
                                    name={member.name}
                                    url={member.getMxcAvatarUrl()}
                                    id={member.userId}
                                />
                            </span>
                        {/each}
                        <ChatBubbleMessage
                            variant="received"
                            isLoading={true}
                        />
                    </ChatBubble>
                </div>
            {/if}
        {/snippet}
    </VirtualList>
</div>
