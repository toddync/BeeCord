import BeeCord from "./BeeCord.svelte";

class SidebarsStore {
    right: boolean = $state(true);
    left: boolean = $state(false);

    constructor() {
        (async () => {
            this.right = await BeeCord.get<boolean>("sidebar:right") || this.right
            this.left = await BeeCord.get<boolean>("sidebar:left") || this.left
        })

        $effect.root(() => {
            $effect(() => {
                BeeCord.set("sidebar:right", this.right)
                BeeCord.set("sidebar:left", this.left)
            })
        })
    }
}

const Sidebars = new SidebarsStore()
export default Sidebars
