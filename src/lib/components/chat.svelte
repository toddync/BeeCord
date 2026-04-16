<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.js";
    import ChatInput from "$lib/components/ui/chat/chat-input.svelte";
    import FileUploadOverlay from "$lib/components/ui/chat/file-upload-overlay.svelte";
    import BeeCord from "$lib/stores/BeeCord.svelte";
    import Calls from "$lib/stores/Calls.svelte";
    import Matrix from "$lib/stores/Matrix.svelte";
    import Rooms from "$lib/stores/Rooms.svelte";
    import Sidebars from "$lib/stores/Sidebars.svelte";
    import type { RoomState } from "$lib/stores/Rooms.svelte";
    import { createHotkey } from "@tanstack/svelte-hotkeys";
    import {
        EllipsisVertical,
        Paperclip,
        Phone,
        Send,
        Video,
    } from "lucide-svelte";
    import * as sdk from "matrix-js-sdk";
    //@ts-ignore
    import MessageList from "./messages/message-list.svelte";
    import { onMount } from "svelte";

    let { room }: { room: RoomState } = $props();
    let messages = $state<sdk.MatrixEvent[]>([]);
    let typing = $state<string[]>([]);
    let atBottom = $state(true); // tracks whether the message list is scrolled to the bottom
    let isPaginating = $state(false);
    let allLoaded = $state(false);

    // -- State --
    let inputText = $state("");
    let fileInput: HTMLInputElement;
    let selectedFiles: FileList | null = $state(null);

    createHotkey("Mod+/", () => {
        Sidebars.right = !Sidebars.right;
    });

    // Clear the per-room media blob cache whenever we switch rooms
    $effect(() => {
        const _ = room.roomId; // track room changes
        allLoaded = false;
        return () => Rooms.clearMediaCache();
    });

    let updateTimeout: number;
    function scheduleUpdateMessages() {
        if (updateTimeout) clearTimeout(updateTimeout);
        updateTimeout = setTimeout(() => {
            updateMessages();
        }, 10) as unknown as number;
    }

    function updateMessages() {
        if (!room) {
            messages = [];
            return;
        }

        messages =
            room.room_
                ?.getLiveTimeline()
                .getEvents()
                .filter(
                    (e) =>
                        e.getType() === "m.sticker" ||
                        e.getType() === "m.room.message" ||
                        e.getType() === "org.matrix.msc3381.poll.start",
                ) || [];
    }

    /**
     * Sends a read receipt for the given event, suppressing any errors
     * (e.g. if the user has already sent a more recent receipt).
     */
    async function markRead(event: sdk.MatrixEvent | null | undefined) {
        if (!Matrix.client || !event) return;
        try {
            await Matrix.client.sendReadReceipt(event);
        } catch (e) {
            // Non-fatal – e.g. already read, or no permission
            console.debug("[read-receipt] failed:", e);
        }
    }

    /**
     * Marks the latest message in the current room as read.
     * Called when the room is first opened or switched to.
     */
    function markRoomRead() {
        if (!room?.room_) return;
        const timeline = room.room_.getLiveTimeline().getEvents();
        // Find the last non-state event that the SDK can receipt
        for (let i = timeline.length - 1; i >= 0; i--) {
            const e = timeline[i];
            if (!e.isState() && e.getId()) {
                markRead(e);
                return;
            }
        }
    }

    async function handlePaginate() {
        if (isPaginating || allLoaded || !Matrix.client || !room?.room_) return;

        const timeline = room.room_.getLiveTimeline();
        if (!timeline.getPaginationToken(sdk.EventTimeline.BACKWARDS)) {
            allLoaded = true;
            return;
        }

        isPaginating = true;
        try {
            await Matrix.client.scrollback(room.room_, 50);
        } catch (e) {
            console.error(e);
        } finally {
            isPaginating = false;
            scheduleUpdateMessages();
        }
    }

    async function sendMessage() {
        if (!inputText.trim() || !Matrix.client || !room) return;
        const text = inputText.trim();
        inputText = "";
        Matrix.client?.sendTyping(room.roomId, false, 10);
        await Matrix.client.sendTextMessage(room.roomId, text);
    }

    function onkeydown(e: KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    onMount(() => {
        updateMessages();

        // Mark the room as read when we first open it
        markRoomRead();

        const onTimelineEvent = (
            event: sdk.MatrixEvent,
            eventRoom?: sdk.Room,
        ) => {
            if (!eventRoom || eventRoom.roomId === room?.roomId) {
                scheduleUpdateMessages();

                // If the user is looking at the bottom of the chat and the
                // window is focused, immediately mark the incoming event read.
                if (atBottom && document.hasFocus() && !isPaginating) {
                    markRead(event);
                }
            }
        };

        const onMatrixEvent = (event: sdk.MatrixEvent) => {
            if (event.getRoomId() === room?.roomId) {
                scheduleUpdateMessages();

                if (atBottom && document.hasFocus() && !isPaginating) {
                    markRead(event);
                }
            }
        };

        // When the window regains focus, mark the latest message read
        // (the user may have received messages while the window was blurred).
        const onWindowFocus = () => {
            if (atBottom) markRoomRead();
        };
        window.addEventListener("focus", onWindowFocus);

        if (Matrix.client) {
            Matrix.client.on(sdk.RoomEvent.Timeline, onTimelineEvent);
            Matrix.client.on(sdk.MatrixEventEvent.Decrypted, onMatrixEvent);
            Matrix.client.on(sdk.MatrixEventEvent.Replaced, onMatrixEvent);
            Matrix.client.on(sdk.RoomMemberEvent.Typing, (e) => {
                typing = (e.event.content?.user_ids).filter(
                    (id: string) => id !== Matrix.user_id,
                );
            });
        }

        if (room) {
            room.room_?.on(sdk.RoomEvent.LocalEchoUpdated, onTimelineEvent);
        }

        return () => {
            window.removeEventListener("focus", onWindowFocus);

            if (Matrix.client) {
                Matrix.client.removeListener(
                    sdk.RoomEvent.Timeline,
                    onTimelineEvent,
                );
                Matrix.client.removeListener(
                    sdk.MatrixEventEvent.Decrypted,
                    onMatrixEvent,
                );
                Matrix.client.removeListener(
                    sdk.MatrixEventEvent.Replaced,
                    onMatrixEvent,
                );
            }
            if (room) {
                room.room_?.removeListener(
                    sdk.RoomEvent.LocalEchoUpdated,
                    onTimelineEvent,
                );
            }
        };
    });

    // When the user switches to this room (room prop changes), re-mark as read.
    $effect(() => {
        const _ = room?.roomId;
        markRoomRead();
    });
</script>

<div
    class="grid grid-cols-1 grid-rows-[3rem_1fr_5rem] overflow-hidden w-full relative {([
        'ios',
        'android',
        'web',
    ].includes(BeeCord.platform) &&
        'h-full') ||
        'h-[calc(100svh-32px)]'}"
>
    <FileUploadOverlay room={room.room_!} bind:selectedFiles />
    <div
        class="flex items-center justify-between p-3 border-b border-border bg-background/50 backdrop-blur-sm z-10 w-full shrink-0"
    >
        <h2 class="font-semibold text-lg">{room?.name || "Room"}</h2>
        <div class="flex gap-2">
            <Button
                variant="secondary"
                size="icon"
                onclick={() => Calls.joinCall(room.roomId)}
            >
                <Phone class="w-4 h-4 stroke-[1.5]" />
            </Button>
            <Button
                variant="secondary"
                size="icon"
                onclick={() => Calls.joinCall(room.roomId)}
            >
                <Video class="w-4 h-4 stroke-[1.5]" />
            </Button>
            <Button
                variant="secondary"
                size="icon"
                class="cursor-pointer"
                onclick={() => {
                    Sidebars.right = !Sidebars.right;
                }}
            >
                <EllipsisVertical class="w-4 h-4 stroke-[1.5]" />
            </Button>
        </div>
    </div>

    <MessageList
        {room}
        bind:typing
        bind:messages
        bind:atBottom
        onMarkRead={markRead}
        onPaginate={handlePaginate}
        {isPaginating}
    />

    <div class="p-3 pt-0">
        <div
            class="flex items-end gap-2 bg-background border rounded-lg p-2 focus-within:ring-1 focus-within:ring-ring"
        >
            <ChatInput
                value={inputText}
                oninput={(e) => {
                    inputText = e.currentTarget.value;
                    Matrix.client?.sendTyping(room.roomId, !!inputText, 50);
                }}
                {onkeydown}
                placeholder="Message {room?.name || 'room'}..."
                class="min-h-12 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent resize-none p-3 shadow-none overflow-y-auto"
            />
            <Button
                variant="ghost"
                size="icon"
                class="my-auto h-8 w-8 shrink-0 rounded-md text-muted-foreground hover:text-primary"
                onclick={() => fileInput.click()}
            >
                <Paperclip class="h-5 w-5" />
            </Button>
            <Button
                size="icon"
                class="my-auto mr-1 h-8 w-8 shrink-0 rounded-md"
                onclick={sendMessage}
                disabled={!inputText.trim()}
            >
                <Send class="h-4 w-4" />
            </Button>
        </div>
    </div>
</div>

<input
    type="file"
    bind:this={fileInput}
    class="hidden"
    onchange={(e) => (selectedFiles = e.currentTarget.files)}
/>
