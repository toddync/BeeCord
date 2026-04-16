<script lang="ts">
    import Matrix from "$lib/stores/Matrix.svelte";
    import type { RoomState } from "$lib/stores/Rooms.svelte";
    import { layout, prepare, type PreparedText } from "@chenglou/pretext";
    import { createVirtualizer } from "@tanstack/svelte-virtual";
    import * as sdk from "matrix-js-sdk";
    //@ts-ignore
    import type { ImageContent } from "matrix-js-sdk/lib/types";
    import { tick, untrack } from "svelte";
    import Avatar from "../avatar.svelte";
    import Message from "../message.svelte";
    import ChatBubbleMessage from "../ui/chat/chat-bubble/chat-bubble-message.svelte";
    import ChatBubble from "../ui/chat/chat-bubble/chat-bubble.svelte";

    let {
        room,
        messages = $bindable([]),
        typing = $bindable([]),
        atBottom = $bindable(true),
        onMarkRead,
        onPaginate,
        isPaginating = false,
    }: {
        room: RoomState;
        messages: sdk.MatrixEvent[];
        typing: string[];
        atBottom?: boolean;
        onMarkRead?: (event: sdk.MatrixEvent) => void;
        onPaginate?: () => void;
        isPaginating?: boolean;
    } = $props();

    let containerWidth = $state(0);
    const prepareCache = new Map<string, PreparedText>();

    // ── Shared ────────────────────────────────────────────────────────────────
    // Gap injected by the virtualizer between rows.
    const GAP = 24;
    // Height used when we can't calculate anything better.
    const FALLBACK_HEIGHT = 72;
    // Sender-name label shown above received bubbles: text-xs (16px) + mb-1 (4px).
    // Computed inline as `sender` in getMessageHeight().

    // ── Text messages (m.text) ────────────────────────────────────────────────
    const TEXT_FONT = "16px ui-sans-serif, system-ui, sans-serif";
    // line-height used by the pretext layout engine (matches Tailwind leading-6).
    const LINE_HEIGHT = 24;
    // Vertical chrome for a text bubble:
    //   ChatBubbleMessage p-4 top+bottom (32) + timestamp row (24) = 56.
    const BUBBLE_CHROME = 56;

    // ── File messages (m.file) ────────────────────────────────────────────────
    // Fixed height: p-0 bubble, file-row py-2.5 (20) + icon h-11 (44) = 64,
    // plus timestamp pb-1.5 row (~18) = 82.
    const FILE_HEIGHT = 82;

    // ── Poll messages ─────────────────────────────────────────────────────────
    const QUESTION_FONT = "500 14px ui-sans-serif, system-ui, sans-serif";
    const ANSWER_FONT = "400 14px ui-sans-serif, system-ui, sans-serif";
    // line-height for 14px text at leading-snug.
    const SNUG_LH = 19;
    // Vertical chrome for a poll bubble:
    //   ChatBubbleMessage p-4 top+bottom (32) + inner p-1 wrapper top+bottom (4)
    //   + gap-3 below question (12) + "Total: N votes" line (20)
    //   + timestamp row (20) = 88.
    const POLL_CHROME = 88;
    // py-2 padding per answer button (8 top + 8 bottom).
    const ANSWER_PY = 16;
    // gap-2 between answer buttons.
    const ANSWER_GAP = 8;
    // Progress bar height including mt-2 margin (8 + 8).
    const PROGRESS_H = 16;
    // Minimum bubble width for polls (Tailwind min-w-72).
    const POLL_MIN_W = 288;

    function getMessageHeight(event: sdk.MatrixEvent): number {
        const type = event.getType();
        let content = event.getContent();
        const msgtype =
            type === "org.matrix.msc3381.poll.start" ? type : content.msgtype;
        const sender: number =
            (event.getSender() !== Matrix.user_id && 16) || 0;

        if (
            type === "m.room.message" ||
            type === "org.matrix.msc3381.poll.start"
        ) {
            switch (msgtype) {
                case "m.text": {
                    const text: string = content.body ?? "";
                    if (!text) return FALLBACK_HEIGHT + sender;
                    const bubbleMax = Math.min(
                        (containerWidth - 40) * 0.6,
                        672,
                    );
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
                }
                case "m.audio":
                    // Fixed-height audio player row.
                    return 58 + sender;
                case "m.file":
                    // Fixed-height file attachment row:
                    // py-2.5 (20) + icon h-11 (44) + timestamp pb-1.5 row (18).
                    return FILE_HEIGHT + sender;
                case "m.image":
                case "m.video": {
                    content = content as ImageContent;
                    const h =
                        content.info?.h ?? content.info?.thumbnail_info?.h;
                    const w =
                        content.info?.w ?? content.info?.thumbnail_info?.w;
                    if (!h || !w) return BUBBLE_CHROME + sender;

                    if (containerWidth * 0.6 < w) {
                        return (
                            (containerWidth * 0.6 * h) / w +
                            BUBBLE_CHROME +
                            sender
                        );
                    }
                    return h + BUBBLE_CHROME + sender;
                }
                case "org.matrix.msc3381.poll.start":
                    return getPollHeight(event, true) + sender;
            }
        }
        return FALLBACK_HEIGHT + sender;
    }

    function getPollHeight(
        event: sdk.MatrixEvent,
        showResults: boolean,
    ): number {
        const content = event.getContent();
        const question: string =
            content["org.matrix.msc3381.poll.start"]?.question?.body ?? "";
        const answers: { id: string; "org.matrix.msc1767.text": string }[] =
            content["org.matrix.msc3381.poll.start"]?.answers ?? [];

        const bubbleMax = Math.min(containerWidth * 0.6, 672);
        const textWidth = Math.max(POLL_MIN_W, bubbleMax) - 40;

        const qKey = `poll-q-${event.getId()}`;
        if (!prepareCache.has(qKey)) {
            prepareCache.set(
                qKey,
                prepare(question, QUESTION_FONT, { whiteSpace: "pre-wrap" }),
            );
        }
        const { height: qHeight } = layout(
            prepareCache.get(qKey)!,
            textWidth,
            SNUG_LH,
        );

        let answersHeight = 0;
        for (let i = 0; i < answers.length; i++) {
            const aKey = `poll-a-${event.getId()}-${answers[i].id}`;
            if (!prepareCache.has(aKey)) {
                prepareCache.set(
                    aKey,
                    prepare(answers[i]["org.matrix.msc1767.text"], ANSWER_FONT),
                );
            }
            const answerTextWidth = textWidth - 24 - 16 - 8;
            const { height: aHeight } = layout(
                prepareCache.get(aKey)!,
                answerTextWidth,
                SNUG_LH,
            );
            answersHeight += ANSWER_PY + aHeight;
            if (showResults) answersHeight += PROGRESS_H;
            if (i < answers.length - 1) answersHeight += ANSWER_GAP;
        }
        return POLL_CHROME + qHeight + answersHeight;
    }

    // -------------------------------------------------------------------------
    // Auto-scroll to bottom on new messages
    // -------------------------------------------------------------------------
    // let prevLength = $state(0);

    // $effect(() => {
    //     const len = messages.length;
    //     if (len !== prevLength) {
    //         prevLength = len;

    //         tick().then(() => {
    //             $virtualizer.scrollToIndex(len - 1, {
    //                 align: "end",
    //                 behavior: "auto",
    //             });
    //         });
    //     }
    // });

    // -------------------------------------------------------------------------
    // Scroll position preservation on width change and pagination
    // -------------------------------------------------------------------------
    // Non‑reactive storage (no $state) to avoid update loops
    let prevContainerWidth = 0;
    let prevMessageCount = 0;
    let prevFirstMessageId: string | undefined = undefined;

    let anchorIndex: number | null = null;
    let anchorOffset = 0;
    let shouldScrollToBottom = false;

    // Capture position BEFORE the virtualizer recalculates (when width changes or items prepend)
    $effect.pre(() => {
        const width = containerWidth;
        const count = messages.length;
        const firstId = messages[0]?.getId();

        const widthChanged = width !== prevContainerWidth;
        const itemsPrepended = count > prevMessageCount && prevMessageCount > 0 && firstId !== prevFirstMessageId;

        if (!widthChanged && !itemsPrepended) return;

        untrack(() => {
            if (!scrollEl || messages.length === 0) return;

            const virtualItems = $virtualizer.getVirtualItems();
            if (virtualItems.length === 0) return;

            const firstItem = virtualItems[0];
            const scrollTop = scrollEl.scrollTop;
            const clientHeight = scrollEl.clientHeight;
            const scrollHeight = scrollEl.scrollHeight;

            // User is at the bottom if within 10px
            shouldScrollToBottom =
                scrollTop + clientHeight >= scrollHeight - 10;

            if (!shouldScrollToBottom) {
                anchorIndex = firstItem.index;
                if (itemsPrepended) {
                    anchorIndex += (count - prevMessageCount);
                }
                anchorOffset = firstItem.start - scrollTop;
            } else {
                anchorIndex = null;
            }
        });
    });

    // Restore position after width change, prepending and virtualizer update.
    $effect(() => {
        const width = containerWidth;
        const count = messages.length;
        const firstId = messages[0]?.getId();

        const widthChanged = width !== prevContainerWidth;
        const itemsPrepended = count > prevMessageCount && prevMessageCount > 0 && firstId !== prevFirstMessageId;

        if (!widthChanged && !itemsPrepended) {
            prevContainerWidth = width;
            prevMessageCount = count;
            prevFirstMessageId = firstId;
            return;
        }

        if (!scrollEl || messages.length === 0) {
            prevContainerWidth = width;
            prevMessageCount = count;
            prevFirstMessageId = firstId;
            return;
        }

        prevContainerWidth = width;
        prevMessageCount = count;
        prevFirstMessageId = firstId;

        tick().then(() => {
            untrack(() => {
                if (shouldScrollToBottom) {
                    $virtualizer.scrollToIndex(messages.length - 1, {
                        align: "end",
                        behavior: "auto",
                    });
                } else if (anchorIndex !== null) {
                    $virtualizer.scrollToIndex(anchorIndex, {
                        align: "start",
                    });
                    
                    // Subtract pixel offset
                    if (anchorOffset !== 0 && scrollEl) {
                        scrollEl.scrollTop = scrollEl.scrollTop - anchorOffset;
                    }
                }

                // Reset flags
                shouldScrollToBottom = false;
                anchorIndex = null;
            });
        });
    });

    // -------------------------------------------------------------------------
    // TanStack Virtual
    // -------------------------------------------------------------------------
    let scrollEl = $state<HTMLDivElement | null>(null);

    /**
     * Called on every scroll event. Updates `atBottom` and, when the user
     * reaches the bottom, fires `onMarkRead` with the last visible message.
     */
    function handleScroll() {
        if (!scrollEl) return;
        const { scrollTop, clientHeight, scrollHeight } = scrollEl;
        const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
        const isAtTop = scrollTop < 300;

        if (isAtTop && onPaginate) {
            onPaginate();
        }

        if (isAtBottom !== atBottom) {
            atBottom = isAtBottom;

            if (isAtBottom && onMarkRead) {
                // Find the last real (non-state) message in the timeline
                for (let i = messages.length - 1; i >= 0; i--) {
                    const e = messages[i];
                    if (e && !e.isState() && e.getId()) {
                        onMarkRead(e);
                        break;
                    }
                }
            }
        }
    }

    // Created once – never recreated on width/count changes.
    // Updates are pushed via setOptions() in the effect below.
    const virtualizer = createVirtualizer({
        gap: GAP,
        overscan: 3,
        paddingEnd: 20,
        paddingStart: 20,
        count: messages.length,
        getScrollElement: () => scrollEl,
        getItemKey: (i) => messages[i].getId()!,
        estimateSize: (index: number) => {
            if (!messages[index]) return FALLBACK_HEIGHT;
            return getMessageHeight(messages[index]);
        },
    });

    // Keep virtualizer in sync with reactive state without recreating it.
    $effect(() => {
        // Reading containerWidth and messages.length makes this effect
        // re-run whenever either changes.
        const _w = containerWidth;
        const _c = messages.length;
        untrack(() => {
            $virtualizer.setOptions({
                count: _c,
                estimateSize: (index: number) => {
                    if (!messages[index]) return FALLBACK_HEIGHT;
                    return getMessageHeight(messages[index]);
                },
            });
        });
    });
</script>

<div bind:clientWidth={containerWidth} class="flex min-h-0 flex-col">
    <div
        class="min-h-0 flex-1 overflow-y-auto relative"
        bind:this={scrollEl}
        onscroll={handleScroll}
    >
        {#if isPaginating}
            <div class="absolute top-2 left-0 right-0 flex justify-center mt-2 z-10 w-full animate-in fade-in zoom-in slide-in-from-top-4 duration-300">
                <div class="bg-background/80 backdrop-blur border shadow-sm rounded-full px-4 py-1.5 flex items-center gap-2">
                    <div class="size-3 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
                    <span class="text-xs font-medium text-muted-foreground">Loading older messages...</span>
                </div>
            </div>
        {/if}
        <div style="position:relative; height:{$virtualizer.getTotalSize()}px;">
            {#each $virtualizer.getVirtualItems() as virtualRow (messages[virtualRow.index]?.getId() ?? virtualRow.index)}
                <div
                    style="position:absolute; top:0; left:0; width:100%; transform:translateY({virtualRow.start}px);"
                    class="px-4 box-border"
                >
                    <Message
                        event={messages[virtualRow.index]}
                        room={room.room_!}
                    />
                </div>
            {/each}
        </div>
    </div>

    {#if typing.length > 0}
        <div class="flex-shrink-0 px-4 pb-4 pt-2">
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
                <ChatBubbleMessage variant="received" isLoading={true} />
            </ChatBubble>
        </div>
    {/if}
</div>
