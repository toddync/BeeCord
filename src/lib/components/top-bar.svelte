<script lang="ts">
    import BeeCord from "$lib/stores/BeeCord.svelte";
    import { bee } from "@lucide/lab";
    import { Circle, Icon } from "@lucide/svelte";
    import { untrack } from "svelte";

    let window: any = $state(null);

    $effect(() => {
        if (BeeCord.platform != "" && BeeCord.platform != "web") {
            untrack(async () => {
                let { getCurrentWindow } =
                    await import("@tauri-apps/api/window");

                window = getCurrentWindow();
            });
        }
    });
</script>

<div
    data-tauri-drag-region
    class="h-8 bg-accent border-b z-60 top-0 w-full pointer-events-auto overflow-y-clip {(BeeCord.platform in
        ['ios', 'android'] &&
        'hidden') ||
        'flex'}"
>
    <div class="w-17 flex relative">
        <div
            class="absolute left-1/2 -translate-x-1/2 text-sidebar-primary flex aspect-square size-8 items-center justify-center"
        >
            <Icon iconNode={bee} class="size-5 stroke-[1.5] rotate-45" />
        </div>
    </div>

    <div
        class="ml-auto w-20 h-min flex gap-1.5 px-3 py-2 select-none group *:rounded-full *:size-4 *:transition-colors *:cursor-pointer *:mx-auto *:stroke-3"
    >
        <Circle
            onclick={() => {
                window?.close();
            }}
            class="group-hover:bg-[#FF605C] stroke-[#FF605C]"
        />
        <Circle
            onclick={() => window?.toggleMaximize()}
            class="group-hover:bg-[#FFBD44] stroke-[#FFBD44] delay-100"
        />
        <Circle
            onclick={() => window?.minimize()}
            class="group-hover:bg-[#00CA4E] stroke-[#00CA4E] delay-200"
        />
    </div>
</div>
