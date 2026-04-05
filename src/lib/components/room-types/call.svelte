<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import {
        Widget,
        ClientWidgetApi,
        WidgetDriver,
        OpenIDRequestState
    } from "matrix-widget-api";
    import type {
        Capability,
        SimpleObservable,
        IOpenIDUpdate,
        ITurnServer
    } from "matrix-widget-api";
    import Matrix from "$lib/stores/Matrix.svelte";
    import type { Room } from "matrix-js-sdk";

    export let room: Room;

    let iframeElement: HTMLIFrameElement;
    let widgetApi: ClientWidgetApi | null = null;
    const widgetId = "element-call-" + room.roomId;

    // @ts-ignore
    class CallWidgetDriver extends WidgetDriver {
        async validateCapabilities(requested: Set<Capability>): Promise<Set<Capability>> {
            // Auto-approve all requested capabilities for Element Call
            return requested;
        }

        askOpenID(observer: SimpleObservable<IOpenIDUpdate>): void {
            if (!Matrix.client) {
                observer.update({ state: OpenIDRequestState.Blocked });
                return;
            }

            observer.update({ state: OpenIDRequestState.PendingUserConfirmation });
            
            Matrix.client.getOpenIdToken().then((token) => {
                observer.update({ 
                    state: OpenIDRequestState.Allowed, 
                    token: token as unknown as any 
                });
            }).catch((err) => {
                console.error("Failed to get OpenID token for element call widget", err);
                observer.update({ state: OpenIDRequestState.Blocked });
            });
        }

        getKnownRooms(): string[] { return []; }

        async sendEvent(eventType: string, content: unknown, stateKey?: string | null, roomId?: string | null): Promise<any> { throw new Error("not implemented"); }
        async sendStickyEvent(stickyDurationMs: number, eventType: string, content: unknown, roomId?: string | null): Promise<any> { throw new Error("not implemented"); }
        async sendDelayedEvent(delay: number | null, parentDelayId: string | null, eventType: string, content: unknown, stateKey?: string | null, roomId?: string | null): Promise<any> { throw new Error("not implemented"); }
        async sendDelayedStickyEvent(delay: number | null, parentDelayId: string | null, stickyDurationMs: number, eventType: string, content: unknown, roomId?: string | null): Promise<any> { throw new Error("not implemented"); }
        async cancelScheduledDelayedEvent(delayId: string): Promise<any> { throw new Error("not implemented"); }
        async restartScheduledDelayedEvent(delayId: string): Promise<any> { throw new Error("not implemented"); }
        async sendScheduledDelayedEvent(delayId: string): Promise<any> { throw new Error("not implemented"); }
        async sendToDevice(eventType: string, encrypted: boolean, contentMap: { [userId: string]: { [deviceId: string]: object; }; }): Promise<any> { throw new Error("not implemented"); }
        async readRoomAccountData(eventType: string, roomIds?: string[] | null): Promise<any> { return []; }
        async readRoomEvents(eventType: string, msgtype: string | undefined, limit: number, roomIds?: string[] | null, since?: string): Promise<any> { return []; }
        async readStateEvents(eventType: string, stateKey: string | undefined, limit: number, roomIds?: string[] | null): Promise<any> { return []; }
        async readStickyEvents(roomId: string): Promise<any> { return []; }
        async readRoomTimeline(roomId: string, eventType: string, msgtype: string | undefined, stateKey: string | undefined, limit: number, since: string | undefined): Promise<any> { return []; }
        async readRoomState(roomId: string, eventType: string, stateKey: string | undefined): Promise<any> { return []; }
        async readEventRelations(eventId: string, roomId?: string, relationType?: string, eventType?: string, from?: string, to?: string, limit?: number, direction?: "f" | "b"): Promise<any> { throw new Error("not implemented"); }
        async navigate(uri: string): Promise<any> { return; }
        
        async *getTurnServers(): AsyncGenerator<ITurnServer> {}
        
        async searchUserDirectory(searchTerm: string, limit?: number): Promise<any> { return { limited: false, results: [] }; }
        async getMediaConfig(): Promise<any> { return {}; }
        async uploadFile(file: XMLHttpRequestBodyInit): Promise<any> { throw new Error("not implemented"); }
        async downloadFile(contentUri: string): Promise<any> { throw new Error("not implemented"); }
        processError(error: unknown): any { return undefined; }
    }

    onMount(() => {
        const widget = new Widget({
            id: widgetId,
            creatorUserId: Matrix.client?.getSafeUserId() || "",
            type: "m.custom",
            url: `https://call.element.io/?widgetId=${widgetId}&roomId=${encodeURIComponent(room.roomId)}`
        });

        const driver = new CallWidgetDriver();
        // @ts-ignore
        widgetApi = new ClientWidgetApi(widget, iframeElement, driver);

        // Required to answer capabilities requests
        widgetApi.on("action:capabilities", (ev) => {
            // Prevent default behavior to allow driver validation
            ev.preventDefault();
            widgetApi!.transport.reply(ev.detail, {});
        });

        // Setup loaded listener
        widgetApi.on("preparing", () => {
            // The widget sent an initial handshake
        });

        widgetApi.on("ready", () => {
            console.log("Element Call widget is ready");
        });
    });

    onDestroy(() => {
        if (widgetApi) {
            widgetApi.stop();
        }
    });

</script>

<iframe
    bind:this={iframeElement}
    title="Element Call"
    src={"https://call.element.io/?widgetId=" + widgetId + "&roomId=" + encodeURIComponent(room.roomId)}
    allow="camera; microphone; display-capture; autoplay; clipboard-write; clipboard-read; screen-wake-lock"
    class="flex-1 w-full h-full border-0 bg-transparent rounded-lg"
></iframe>
