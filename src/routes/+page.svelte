<script lang="ts">
    import FlickerGrid from "$lib/components/flicker-grid.svelte";
    import Spinner from "$lib/components/ui/spinner/spinner.svelte";
</script>

<div class="h-svh w-svw relative">
    <FlickerGrid
        color="#efb100"
        maxOpacity={0.05}
        flickerChance={0.01}
        gridGap={5}
    />

    <Spinner
        class="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 text-primary size-20 stroke-1"
    />
</div>
