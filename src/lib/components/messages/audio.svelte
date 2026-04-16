<script lang="ts">
    import Rooms from "$lib/stores/Rooms.svelte";
    import { Pause, Play } from "@lucide/svelte";
    import * as sdk from "matrix-js-sdk";
    import type { AudioContent } from "matrix-js-sdk/lib/types";
    import Button from "../ui/button/button.svelte";

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

    // svelte-ignore state_referenced_locally
    const content: AudioContent = event.getContent();
    const durationFromMetadata = (content.info?.duration ?? 0) / 1000;

    let objectUrl = $state<string | null>(null);
    let audioEl = $state<HTMLAudioElement | null>(null);

    let isPlaying = $state(false);
    let currentTime = $state(0);
    let duration = $state(durationFromMetadata);
    let isLoaded = $state(false);

    const BAR_COUNT = 28;
    const barHeights = Array.from(
        { length: BAR_COUNT },
        () => Math.random() * 0.7 + 0.3,
    );

    function formatTime(s: number) {
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, "0")}`;
    }

    function onSeek(e: MouseEvent) {
        if (!audioEl) return;
        const bar = e.currentTarget as HTMLElement;
        const rect = bar.getBoundingClientRect();
        const ratio = Math.max(
            0,
            Math.min(1, (e.clientX - rect.left) / rect.width),
        );
        audioEl.currentTime = ratio * (duration || 1);
    }

    async function togglePlay() {
        if (!audioEl) return;
        if (isPlaying) {
            audioEl.pause();
        } else {
            try {
                await audioEl.play();
            } catch (err) {
                console.warn("Audio playback failed:", err);
            }
        }
    }

    $effect(() => {
        let cancelled = false;
        Rooms.loadMediaObjectUrl(content).then((url) => {
            if (!cancelled && url) {
                objectUrl = url;
                isLoaded = true;
            }
        });
        // Do NOT revoke the URL — it is owned by Rooms.mediaCache and shared
        // across all remounts. Revoking here would break other instances.
        return () => {
            cancelled = true;
            objectUrl = null;
        };
    });

    const progress = $derived(duration > 0 ? currentTime / duration : 0);
</script>

{#if !isLoaded}
    <div
        class="flex items-center gap-3 px-3 py-2.5 rounded-2xl w-56 h-14.4 {isMe
            ? 'bg-primary'
            : 'bg-secondary '}"
    >
        <div
            class="size-9 rounded-full animate-pulse shrink-0 {isMe
                ? 'bg-primary-foreground/25'
                : 'bg-primary/20'}"
        ></div>
        <div class="flex flex-col gap-2 flex-1">
            <div
                class="h-1.5 rounded-full animate-pulse w-[55%] [animation-delay:100ms] {isMe
                    ? 'bg-primary-foreground/25'
                    : 'bg-primary/20'}"
            ></div>
            <div
                class="h-1.5 rounded-full animate-pulse w-[80%] [animation-delay:200ms] {isMe
                    ? 'bg-primary-foreground/25'
                    : 'bg-primary/20'}"
            ></div>
        </div>
    </div>
{:else}
    <!-- svelte-ignore a11y_media_has_caption -->
    <audio
        bind:this={audioEl}
        preload="metadata"
        src={objectUrl}
        class="hidden"
        bind:duration
        ontimeupdate={() => (currentTime = audioEl?.currentTime ?? 0)}
        onplay={() => (isPlaying = true)}
        onpause={() => (isPlaying = false)}
        onended={() => {
            isPlaying = false;
            currentTime = 0;
        }}
    ></audio>

    <div
        class="inline-flex items-center gap-2.5 px-3 py-2 min-w-52.5 max-w-67.5 rounded-lg shadow-sm transition-shadow hover:shadow-md h-14.4
            {isMe
            ? 'bg-primary rounded-br-none'
            : 'bg-secondary rounded-bl-none'}"
    >
        <!-- Play / Pause -->
        <Button
            onclick={togglePlay}
            aria-label={isPlaying ? "Pause" : "Play"}
            class="relative size-9 rounded-full flex items-center justify-center cursor-pointer border-0 hover:scale-105 transition-all
                {isMe && 'bg-secondary hover:bg-secondary/80'}"
        >
            {#if isPlaying}
                <Pause
                    class="size-5 stroke-1 {isMe
                        ? 'stroke-primary fill-primary'
                        : 'stroke-secondary fill-secondary'}"
                />
            {:else}
                <Play
                    class="size-5 stroke-1 {isMe
                        ? 'stroke-primary fill-primary'
                        : 'stroke-secondary fill-secondary'}"
                />
            {/if}
        </Button>

        <!-- Waveform + times -->
        <div class="flex flex-col gap-1 flex-1 min-w-0">
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
                role="slider"
                aria-valuenow={currentTime}
                aria-valuemin={0}
                aria-valuemax={duration}
                onclick={onSeek}
                class="flex items-center gap-[2.5px] h-7 cursor-pointer py-1"
            >
                {#each barHeights as h, i}
                    {@const filled = i / BAR_COUNT < progress}
                    <span
                        class="flex-1 rounded-full transition-colors duration-150
                            {filled
                            ? isMe
                                ? 'bg-primary-foreground/90'
                                : 'bg-primary'
                            : isMe
                              ? 'bg-primary-foreground/25'
                              : 'bg-primary/20'}
                            {isPlaying && filled ? 'animate-pulse' : ''}"
                        style="height:{h * 100}%;animation-duration:{400 +
                            (i % 5) * 80}ms"
                    ></span>
                {/each}
            </div>

            <div
                class="flex justify-between tabular-nums leading-none
                {isMe ? 'text-primary-foreground' : 'text-foreground'}"
            >
                <span class="text-[10px] tracking-wide">
                    {formatTime(currentTime)}
                </span>
                <span class="text-[10px] tracking-wide">
                    {formatTime(duration)}
                </span>
            </div>
        </div>
    </div>
{/if}
