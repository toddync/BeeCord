<script lang="ts">
    import { onMount } from "svelte";

    export let hexRadius: number = 20;
    export let gridGap: number = 6;
    export let flickerChance: number = 0.1; // Reduced slightly for smoother feel
    export let color: string = "rgb(0, 0, 0)";
    export let width: number | undefined = undefined;
    export let height: number | undefined = undefined;
    let className: string = "";
    export { className as class };
    export let maxOpacity: number = 0.3;

    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | null;
    let animId: number;

    // Reactive state for the grid
    let grid: {
        cols: number;
        rows: number;
        cells: Float32Array;
        horizDist: number;
        vertDist: number;
    };

    // Helper to get RGB from any CSS color string
    function getRGB(col: string): string {
        if (typeof window === "undefined") return "0, 0, 0";
        const temp = document.createElement("div");
        temp.style.color = col;
        document.body.appendChild(temp);
        const styles = window.getComputedStyle(temp).color;
        const match = styles.match(/\d+/g);
        document.body.removeChild(temp);
        return match ? match.slice(0, 3).join(", ") : "0, 0, 0";
    }

    $: rgbBase = getRGB(color);

    function setupCanvas() {
        if (!canvas) return;
        const cw = width || canvas.offsetWidth;
        const ch = height || canvas.offsetHeight;
        const dpr = window.devicePixelRatio || 1;

        canvas.width = cw * dpr;
        canvas.height = ch * dpr;

        const hexHeight = Math.sqrt(3) * hexRadius;
        const horizDist = 1.5 * hexRadius + gridGap;
        const vertDist = hexHeight + (gridGap * Math.sqrt(3)/2);

        const cols = Math.ceil(cw / horizDist) + 1;
        const rows = Math.ceil(ch / vertDist) + 1;

        const cells = new Float32Array(cols * rows);
        for (let i = 0; i < cells.length; i++) {
            cells[i] = Math.random() * maxOpacity;
        }

        grid = { cols, rows, cells, horizDist, vertDist };
    }

    function drawHexagon(x: number, y: number, r: number) {
        if (!ctx) return;
        ctx.beginPath();
        for (let side = 0; side < 6; side++) {
            const angle = (side * Math.PI) / 3;
            const dx = x + r * Math.cos(angle);
            const dy = y + r * Math.sin(angle);
            side === 0 ? ctx.moveTo(dx, dy) : ctx.lineTo(dx, dy);
        }
        ctx.closePath();
        ctx.fill();
    }

    function render(t: number) {
        if (!ctx || !grid || !canvas) return;

        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let col = 0; col < grid.cols; col++) {
            for (let row = 0; row < grid.rows; row++) {
                const idx = col * grid.rows + row;

                // Update logic: Flicker
                if (Math.random() < flickerChance) {
                    grid.cells[idx] = Math.random() * maxOpacity;
                }

                ctx.fillStyle = `rgba(${rgbBase}, ${grid.cells[idx]})`;

                const cx = col * grid.horizDist * dpr + hexRadius * dpr;
                let cy = row * grid.vertDist * dpr + (Math.sqrt(3) * hexRadius * dpr) / 2;

                // Offset odd columns
                if (col % 2 === 1) {
                    cy += (grid.vertDist * dpr) / 2;
                }

                drawHexagon(cx, cy, hexRadius * dpr);
            }
        }
        animId = requestAnimationFrame(render);
    }

    onMount(() => {
        ctx = canvas.getContext("2d");
        setupCanvas();

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                animId = requestAnimationFrame(render);
            } else {
                cancelAnimationFrame(animId);
            }
        });

        observer.observe(canvas);
        window.addEventListener("resize", setupCanvas);

        return () => {
            cancelAnimationFrame(animId);
            window.removeEventListener("resize", setupCanvas);
            observer.disconnect();
        };
    });
</script>

<canvas
    bind:this={canvas}
    class="pointer-events-none {className}"
    style:width={width ? `${width}px` : "100%"}
    style:height={height ? `${height}px` : "100%"}
></canvas>
