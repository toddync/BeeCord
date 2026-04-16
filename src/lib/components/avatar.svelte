<script lang="ts">
    import * as Avatar from "$lib/components/ui/avatar";
    import * as Tooltip from "$lib/components/ui/tooltip";
    import Rooms from "$lib/stores/Rooms.svelte";

    let {
        id = $bindable(""),
        url = $bindable(""),
        name = $bindable(""),
        ...props
    }: { id: string; url: string | null | undefined; name: string, class?: string } = $props();

    let objectUrl = $state<string | null>(null);
    let color = Rooms.getColorFromId(id);
    let initials = Rooms.getInitials(name);

    $effect(() => {
        let revoked = false;
        if (url)
            Rooms.fetchMxcObjectUrl(url).then((url) => {
                if (!revoked && url) objectUrl = url;
            });
        return () => {
            revoked = true;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                objectUrl = null;
            }
        };
    });
</script>

<Tooltip.Root>
    <Tooltip.Trigger>
        <Avatar.Root {...props}>
            <Avatar.Image src={objectUrl} />

            <Avatar.AvatarFallback
                {...props}
                style={`background: ${color[1]}; color: hsl(${color[0]})`}
            >
                {initials}
            </Avatar.AvatarFallback>
        </Avatar.Root>
    </Tooltip.Trigger>

    <Tooltip.Content>
        {name}
    </Tooltip.Content>
</Tooltip.Root>
