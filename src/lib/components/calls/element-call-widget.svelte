<script lang="ts">
    import * as Dialog from "$lib/components/ui/dialog/index.js";
    import Calls from "$lib/stores/Calls.svelte";

    // Re-evaluate open state whenever activeCallRoomId changes
    let open = $derived(!!Calls.activeCallRoomId);

    function onOpenChange(isOpen: boolean) {
        if (!isOpen) {
            Calls.leaveCall();
        }
    }
</script>

<Dialog.Root {open} {onOpenChange}>
    <Dialog.Content class="flex flex-col w-[95vw] h-[95vh] max-w-[1920px] max-h-[1080px] p-0 overflow-hidden border border-border bg-black gap-0">
        <Dialog.Header class="sr-only">
            <Dialog.Title>Element Call</Dialog.Title>
            <Dialog.Description>Active Video/Audio Call via Element</Dialog.Description>
        </Dialog.Header>
        {#if Calls.activeCallRoomId}
            <iframe
                title="Element Call"
                src={"https://call.element.io/?roomId=" + encodeURIComponent(Calls.activeCallRoomId)}
                allow="camera; microphone; display-capture; autoplay; clipboard-write; clipboard-read; screen-wake-lock"
                class="flex-1 w-full h-full border-0 bg-transparent rounded-b-lg"
            ></iframe>
        {/if}
    </Dialog.Content>
</Dialog.Root>
