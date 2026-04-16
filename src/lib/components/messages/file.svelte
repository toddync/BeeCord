<script lang="ts">
    import Rooms from "$lib/stores/Rooms.svelte";
    import * as sdk from "matrix-js-sdk";
    import type { FileContent } from "matrix-js-sdk/lib/types";
    import ChatBubbleMessage from "../ui/chat/chat-bubble/chat-bubble-message.svelte";
    import ChatBubbleTimestamp from "../ui/chat/chat-bubble/chat-bubble-timestamp.svelte";
    import { ArrowDownToLine } from "@lucide/svelte";

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

    const ext = (content.body.split(".").pop() ?? "").toLowerCase();

    // Color-coded file type theming
    const FILE_COLORS: Record<string, { bg: string; text: string }> = {
        pdf:  { bg: "bg-red-500/15 dark:bg-red-400/20",   text: "text-red-600 dark:text-red-400" },
        doc:  { bg: "bg-blue-500/15 dark:bg-blue-400/20", text: "text-blue-600 dark:text-blue-400" },
        docx: { bg: "bg-blue-500/15 dark:bg-blue-400/20", text: "text-blue-600 dark:text-blue-400" },
        xls:  { bg: "bg-emerald-500/15 dark:bg-emerald-400/20", text: "text-emerald-600 dark:text-emerald-400" },
        xlsx: { bg: "bg-emerald-500/15 dark:bg-emerald-400/20", text: "text-emerald-600 dark:text-emerald-400" },
        csv:  { bg: "bg-emerald-500/15 dark:bg-emerald-400/20", text: "text-emerald-600 dark:text-emerald-400" },
        ppt:  { bg: "bg-orange-500/15 dark:bg-orange-400/20", text: "text-orange-600 dark:text-orange-400" },
        pptx: { bg: "bg-orange-500/15 dark:bg-orange-400/20", text: "text-orange-600 dark:text-orange-400" },
        zip:  { bg: "bg-yellow-500/15 dark:bg-yellow-400/20", text: "text-yellow-600 dark:text-yellow-400" },
        rar:  { bg: "bg-yellow-500/15 dark:bg-yellow-400/20", text: "text-yellow-600 dark:text-yellow-400" },
        mp3:  { bg: "bg-purple-500/15 dark:bg-purple-400/20", text: "text-purple-600 dark:text-purple-400" },
        mp4:  { bg: "bg-pink-500/15 dark:bg-pink-400/20",   text: "text-pink-600 dark:text-pink-400" },
        mov:  { bg: "bg-pink-500/15 dark:bg-pink-400/20",   text: "text-pink-600 dark:text-pink-400" },
    };

    const receivedTheme = FILE_COLORS[ext] ?? {
        bg:   "bg-muted",
        text: "text-muted-foreground",
    };

    // On yellow sent bubbles, colorful badges clash — use black-tinted neutrals instead
    const sentTheme = {
        bg:       "bg-black/10",
        text:     "text-black/70",
        hover:    "hover:bg-black/10",
        fileSize: "text-black/55",
        download: "bg-black/10 text-black/70",
        shimmer:  "via-black/10",
    };

    const receivedExtra = {
        hover:    "hover:bg-black/5 dark:hover:bg-white/5",
        fileSize: "text-muted-foreground",
        download: `${receivedTheme.bg} ${receivedTheme.text}`,
        shimmer:  "via-white/20",
    };

    const theme    = isMe ? sentTheme    : { ...receivedTheme, ...receivedExtra };
    const fileTheme = theme;

    function formatSize(bytes?: number): string {
        if (!bytes) return "";
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
        return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    }

    const fileSize = formatSize((content as any).info?.size);

    $effect(() => {
        let revoked = false;

        if ((content as any).info?.size === 0) {
            objectUrl = URL.createObjectURL(new Blob([]));
        } else {
            Rooms.loadMediaObjectUrl(content).then((url) => {
                if (!revoked && url) objectUrl = url;
            });
        }

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
    class="max-w-xs min-w-48 p-0 overflow-hidden"
    variant={isMe ? "sent" : "received"}
>
    {#if objectUrl}
        <a
            href={objectUrl}
            download={content.body}
            target="_blank"
            class="group flex items-center gap-3 px-3 py-2.5 rounded-xl
                   transition-all duration-200
                   {fileTheme.hover}"
        >
            <!-- File type badge -->
            <span
                class="relative shrink-0 w-11 h-11 rounded-xl flex flex-col
                       items-center justify-center gap-0.5
                       {fileTheme.bg} transition-transform duration-200
                       group-hover:scale-105"
            >
                {#if ext}
                    <span class="text-[9px] font-black uppercase tracking-wider leading-none {fileTheme.text}">
                        {ext.length > 4 ? ext.slice(0, 4) : ext}
                    </span>
                    <span class="w-5 h-px {fileTheme.text} opacity-40 bg-current rounded-full"></span>
                {/if}
                <svg
                    viewBox="0 0 16 16"
                    class="size-3.5 {fileTheme.text} opacity-50"
                    fill="currentColor"
                    aria-hidden="true"
                >
                    <path d="M4 0h5.5L13 3.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2zm5 0v4h4L9 0z"/>
                </svg>
            </span>

            <!-- File info -->
            <span class="flex flex-col min-w-0 flex-1 gap-0.5">
                <span
                    class="text-[13px] font-semibold leading-tight truncate
                           group-hover:underline underline-offset-2"
                >
                    {content.body}
                </span>

                {#if fileSize}
                    <span class="text-[11px] tabular-nums {fileTheme.fileSize}">
                        {fileSize}
                    </span>
                {/if}
            </span>

            <!-- Download button -->
            <span
                class="shrink-0 flex items-center justify-center
                       w-7 h-7 rounded-lg
                       {fileTheme.download}
                       opacity-0 group-hover:opacity-100
                       scale-75 group-hover:scale-100
                       transition-all duration-200"
                aria-label="Download"
            >
                <ArrowDownToLine class="size-3.5" />
            </span>
        </a>

        <ChatBubbleTimestamp class="whitespace-pre ml-auto mt-0.5 px-3 pb-1.5" {timestamp} />
    {:else}
        <!-- Shimmer skeleton -->
        <div class="flex items-center gap-3 px-3 py-2.5">
            <div class="relative w-11 h-11 rounded-xl bg-muted overflow-hidden shrink-0">
                <div class="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_infinite]
                            bg-gradient-to-r from-transparent {fileTheme.shimmer} to-transparent"></div>
            </div>
            <div class="flex flex-col gap-1.5 flex-1">
                <div class="relative h-3 w-36 rounded-md bg-muted overflow-hidden">
                    <div class="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_0.1s_infinite]
                                bg-gradient-to-r from-transparent {fileTheme.shimmer} to-transparent"></div>
                </div>
                <div class="relative h-2.5 w-16 rounded-md bg-muted overflow-hidden">
                    <div class="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_ease-in-out_0.2s_infinite]
                                bg-gradient-to-r from-transparent {fileTheme.shimmer} to-transparent"></div>
                </div>
            </div>
        </div>
    {/if}
</ChatBubbleMessage>

<style>
    @keyframes shimmer {
        to { transform: translateX(200%); }
    }
</style>
