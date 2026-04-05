<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.js";
    import ChatInput from "$lib/components/ui/chat/chat-input.svelte";
    import FileUploadOverlay from "$lib/components/ui/chat/file-upload-overlay.svelte";
    import BeeCord from "$lib/stores/BeeCord.svelte";
    import Calls from "$lib/stores/Calls.svelte";
    import Matrix from "$lib/stores/Matrix.svelte";
    import {
        EllipsisVertical,
        Paperclip,
        Phone,
        Send,
        Video,
    } from "lucide-svelte";
    import * as sdk from "matrix-js-sdk";
    import Avatar from "./avatar.svelte";
    import Message from "./message.svelte";
    import ChatBubbleMessage from "./ui/chat/chat-bubble/chat-bubble-message.svelte";
    import ChatBubble from "./ui/chat/chat-bubble/chat-bubble.svelte";
    import type { RoomState } from "$lib/stores/Rooms.svelte";

    let { room }: { room: RoomState } = $props();
    let messages = $state<sdk.MatrixEvent[]>([]);
    let typing = $state<string[]>([]);

    // -- State --
    let inputText = $state("");
    let fileInput: HTMLInputElement;

    let selectedFiles: FileList | null = $state(null);

    function updateMessages() {
        if (!room) {
            messages = [];
            return;
        }
        messages = room.room_?.getLiveTimeline()
            .getEvents()
            .filter(
                (e) =>
                    e.getType() === "m.room.message" ||
                    e.getType() === "org.matrix.msc3381.poll.start",
            ) || [];
    }

    async function sendMessage() {
        if (!inputText.trim() || !Matrix.client || !room) return;

        let text = inputText.trim();
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

    $effect(() => {
        updateMessages();

        const onTimelineEvent = (
            event: sdk.MatrixEvent,
            eventRoom?: sdk.Room,
        ) => {
            if (!eventRoom || eventRoom.roomId === room?.roomId) {
                updateMessages();
            }
        };

        const onMatrixEvent = (event: sdk.MatrixEvent) => {
            if (event.getRoomId() === room?.roomId) {
                updateMessages();
            }
        };

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
</script>

<FileUploadOverlay room={room.room_!} bind:selectedFiles />

<div
    class="grid grid-cols-1 grid-rows-[3rem_1fr_5rem] overflow-hidden w-full relative {([
        'ios',
        'android',
        'web',
    ].includes(BeeCord.platform) &&
        'h-full') ||
        'h-[calc(100svh-32px)]'}"
>
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
                    console.log(
                        room.room_?.getJoinRule(),
                        room.room_?.canInvite(Matrix.user_id!),
                    );
                    if (room.room_?.canInvite(Matrix.user_id!)) {
                        let id = prompt("UserId") || "";

                        Matrix.client?.invite(room.roomId, id);
                    }
                }}
            >
                <EllipsisVertical class="w-4 h-4 stroke-[1.5]" />
            </Button>
        </div>
    </div>

    <div class="min-h-0 overflow-hidden">
        <div class="relative h-full w-full">
            <div class="flex h-full w-full flex-col overflow-y-auto">
                <div class="flex flex-col gap-6 p-4">
                    {#each messages as item (item)}
                        <Message event={item} room={room.room_!} />
                    {/each}

                    {#if typing.length > 0}
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
                                variant={"received"}
                                isLoading={true}
                            ></ChatBubbleMessage>
                        </ChatBubble>
                    {/if}
                </div>
            </div>
        </div>
    </div>

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
