import { invoke } from "@tauri-apps/api/core";
import { decryptAttachment } from "matrix-encrypt-attachment";
import * as sdk from "matrix-js-sdk";
import type { ImageInfo, MediaEventContent, VideoInfo } from "matrix-js-sdk/lib/types";
import BeeCord from "./BeeCord.svelte";
import Matrix from "./Matrix.svelte";

export interface MediaResult {
    data: string;
    content_type: string;
    from_cache: boolean;
}

export class RoomState {
    name: string = $state("");
    unreadCount: number = $state(0);
    membership: string = $state("");
    type: string | undefined = $state();
    avatar: string | null = $state(null);
    room_: sdk.Room | null = $state(null);
    roomId: string = "";
    lastMessage: sdk.MatrixEvent | null = $state(null);

    constructor(private room: sdk.Room) {
        this.room_ = room;
        this.name = room.name;
        this.roomId = room.roomId;
        this.type = room.getType();
        this.avatar = room.getMxcAvatarUrl();
        this.membership = room.getMyMembership();
        this.unreadCount = room.getUnreadNotificationCount();
    }

    update(room: sdk.Room) {
        this.room_ = room;
        this.name = room.name;
        this.roomId = room.roomId;
        this.type = room.getType();
        this.avatar = room.getMxcAvatarUrl();
        this.membership = room.getMyMembership();
        this.computeUnread();
    }

    patch(event: sdk.RoomEvent, ...args: unknown[]) {
        const toStartOfTimeline = args[2] as boolean;
        switch (event) {
            case sdk.RoomEvent.Name:
                if (!toStartOfTimeline)
                    this.name = this.room.name;
                break;
            case sdk.RoomEvent.MyMembership:
                this.membership = args[1] as string;
                break;
            case sdk.RoomEvent.UnreadNotifications:
                this.unreadCount = this.room.getUnreadNotificationCount();
                break;
            case sdk.RoomEvent.Receipt:
                this.computeUnread();
                break;
            case sdk.RoomEvent.Timeline:
                const matrixEvent = args[0] as sdk.MatrixEvent;

                if (!toStartOfTimeline) {
                    this.computeUnread();
                    if (matrixEvent.getType() === "m.room.message"
                        || matrixEvent.getType() === "m.sticker"
                    ) {
                        // || matrixEvent.getType().includes("poll")
                        if (!this.lastMessage || matrixEvent.getTs() > this.lastMessage?.getTs())
                            this.lastMessage = matrixEvent;
                    } else if (matrixEvent.getType() === "m.room.avatar") {
                        this.avatar = matrixEvent.getContent().url;
                    } else if (matrixEvent.getType() === "m.room.name") {
                        this.name = matrixEvent.getContent().name;
                    }
                }

                Matrix.client?.decryptEventIfNeeded(matrixEvent);

                // Play notification sound only for live (just-arrived) messages —
                // args[4] is IRoomTimelineData; liveEvent is false during initial sync.
                if (
                    !toStartOfTimeline &&
                    this.isCountable(matrixEvent) &&
                    (args[4] as { liveEvent?: boolean })?.liveEvent &&
                    (this.roomId !== Rooms.selectedRoom || !document.hasFocus())
                ) {
                    BeeCord.notification.currentTime = 0;
                    BeeCord.notification.volume = 0.5;
                    BeeCord.notification.play().catch(() => { });
                }

                break;
        }
    }

    computeUnread() {
        const userId = Matrix.client?.getUserId();
        if (!userId) return;

        const receipt = this.room.getReadReceiptForUserId(userId);
        const timeline = this.room.getLiveTimeline().getEvents();

        if (!receipt) {
            // No receipt yet — everything is unread
            this.unreadCount = timeline.filter((e) =>
                this.isCountable(e),
            ).length;
            return;
        }

        const receiptIndex = timeline.findIndex(
            (e) => e.getId() === receipt.eventId,
        );

        if (receiptIndex === -1) {
            // Receipt points to an event not in local timeline (e.g. paginated out)
            // Fallback: trust the server count
            this.unreadCount = this.room.getUnreadNotificationCount(
                sdk.NotificationCountType.Total,
            );
            return;
        }

        this.unreadCount = timeline
            .slice(receiptIndex + 1)
            .filter((e) => this.isCountable(e)).length;
    }

    private isCountable(event: sdk.MatrixEvent): boolean {
        // Only count real visible messages, not state events or redactions
        return (
            !event.isState() &&
            !event.isRedacted() &&
            event.getSender() !== Matrix.client?.getUserId() && // don't count own messages
            [
                sdk.EventType.RoomMessage,
                sdk.EventType.RoomMessageEncrypted,
                sdk.EventType.Sticker,
            ].includes(event.getType() as sdk.EventType)
        );
    }
}

class RoomsStore {
    rooms: Record<string, RoomState> = $state({});
    spaces: Record<string, sdk.Room & { childs: string[] }> = $state({});

    /** Persistent object-URL cache keyed by mxc:// URI to avoid redundant Tauri IPC calls */
    mediaCache = $state(new Map<string, string>());

    selectedRoom: string = $state("");
    selectedSpace: string = $state("");

    ready: boolean = $state(false);

    start() {
        Matrix.client?.on(sdk.ClientEvent.Sync, async (state) => {
            if (state !== "PREPARED") return;
            let rooms = Matrix.client?.getRooms() ?? [];
            rooms.forEach((room) => {
                this.registerRoom(room);
            });

            rooms
                .filter((room) => room.isSpaceRoom())
                .forEach((r) => {
                    //@ts-ignore
                    this.spaces[r.roomId] = { ...r, childs: [] };
                    delete this.rooms[r.roomId];
                });

            let hierarchyPromises = [];
            for (const key of Object.keys(this.spaces)) {
                this.spaces[key].childs = [];

                hierarchyPromises.push((async () => {
                    try {
                        const hierarchy = await Matrix.client?.getRoomHierarchy(
                            key,
                            50,
                            1,
                        );

                        const children: sdk.HierarchyRoom[] = (
                            hierarchy?.rooms ?? []
                        ).filter((r) => r.room_id !== key);
                        children.forEach((child) => {
                            this.addChildren(key, child.room_id);
                        });
                    } catch (err) {
                        console.error(
                            `Failed to get hierarchy for space ${key}`,
                            err,
                        );
                    }
                })());
            }

            await Promise.all(hierarchyPromises);
            this.ready = true;
        });

        Matrix.client?.on(sdk.RoomStateEvent.Events, (e) => {
            if (e.getType() === "m.space.child") {
                const isEmpty = Object.keys(e.getContent()).length === 0;
                if (isEmpty) {
                    this.removeChildren(e.getRoomId()!, e.getStateKey()!);
                } else {
                    this.addChildren(e.getRoomId()!, e.getStateKey()!);
                }
            } else if (e.getType() === "m.space.parent") {
                this.addChildren(e.getStateKey()!, e.getRoomId()!);
            }
        });

        Matrix.client?.on(
            sdk.RoomEvent.MyMembership,
            (room, membership, prev) => {
                if (membership == sdk.KnownMembership.Invite)
                    this.registerRoom(room);
                else if (membership == sdk.KnownMembership.Join)
                    this.registerRoom(room);
                else if (membership == sdk.KnownMembership.Leave)
                    delete this.rooms[room.roomId];
                else if (membership == sdk.KnownMembership.Ban)
                    delete this.rooms[room.roomId];
            },
        );

        Object.values(sdk.RoomEvent).forEach((event) => {
            //@ts-ignore
            Matrix.client?.on(event, (roomOrEvent, ...args) => {
                const room =
                    roomOrEvent instanceof sdk.Room
                        ? roomOrEvent
                        : args.find((a) => a instanceof sdk.Room);
                if (!room) return;

                this.rooms[room.roomId]?.patch(event, roomOrEvent, ...args);
            });
        });

        Matrix.client?.on(
            sdk.MatrixEventEvent.Decrypted,
            (e, err) =>
                !err &&
                e.getRoomId() &&
                this.rooms[e.getRoomId()!]?.patch(sdk.RoomEvent.Timeline, e),
        );

        Matrix.client?.on(sdk.ClientEvent.Room, (room) => {
            this.registerRoom(room);
        });
    }

    b64ToObjectUrl(b64: string, mimeType: string): string {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes], { type: mimeType }));
    }

    async fetchMxcObjectUrl(mxc: string): Promise<string | null> {
        if (!mxc?.startsWith("mxc://")) return null;
        const homeserver = Matrix.client?.getHomeserverUrl();
        if (!homeserver) return null;

        if (this.mediaCache.has(mxc)) {
            return this.mediaCache.get(mxc)!;
        }

        const result = await invoke<MediaResult | null>("fetch_mxc_media", {
            mxc,
            homeserver,
            token: Matrix.access_token ?? Matrix.client?.getAccessToken() ?? "",
        });

        if (!result) return null;
        let url = `data:${result!.content_type};base64,${result!.data}`;
        // this.b64ToObjectUrl(result!.data, result!.content_type)

        this.mediaCache.set(mxc, url);
        return url;
    }

    async loadMediaObjectUrl(
        content: MediaEventContent,
    ): Promise<string | null> {
        const token = Matrix.access_token ?? Matrix.client?.getAccessToken();
        if (!token) return null;
        const homeserver = Matrix.client?.getHomeserverUrl();
        if (!homeserver) return null;

        const mxc =
            content.file?.url ??
            (content.info as ImageInfo | VideoInfo | undefined)
                ?.thumbnail_url ??
            content.url;
        if (!mxc?.startsWith("mxc://")) return null;

        // Return cached object URL if available — avoids redundant Tauri IPC calls
        // when virtual-list components are unmounted/remounted during scrolling.
        if (this.mediaCache.has(mxc)) {
            return this.mediaCache.get(mxc)!;
        }

        const result = await invoke<MediaResult | null>("load_media", {
            mxc,
            homeserver,
            token,
            encrypted: !!content.file?.url,
        });

        if (!result) return null;

        let objectUrl: string;

        if (content.file?.url) {
            // Rust fetched the ciphertext — decrypt here then blob it
            const raw = Uint8Array.from(atob(result.data), (c) =>
                c.charCodeAt(0),
            );
            const decrypted = await decryptAttachment(raw.buffer, content.file);
            objectUrl = URL.createObjectURL(
                new Blob([decrypted], {
                    type: content.info?.mimetype ?? "image/jpeg",
                }),
            );
        } else {
            objectUrl = `data:${content.info?.mimetype ?? "image/jpeg"};base64,${result!.data}`
            // this.b64ToObjectUrl(result.data, result.content_type);
        }

        this.mediaCache.set(mxc, objectUrl);
        return objectUrl;
    }

    /** Revokes all cached object URLs and clears the media cache.
     *  Call when switching rooms to prevent unbounded memory growth. */
    clearMediaCache() {
        for (const url of this.mediaCache.values()) {
            URL.revokeObjectURL(url);
        }
        this.mediaCache.clear();
    }

    getColorFromId(roomId: string): [string, string] {
        let hash = 0;
        for (let i = 0; i < roomId.length; i++) {
            hash = roomId.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        const sat = 55 + (Math.abs(hash >> 8) % 20);
        const light = 35 + (Math.abs(hash >> 16) % 15);
        return [
            `${hue}, ${sat}%, ${Math.min(light + 20, 65)}%`,
            `radial-gradient(circle at center, hsla(${hue}, ${sat}%, ${Math.min(light + 20, 65)}%, 0.01) 0%, hsla(${hue}, ${sat}%, ${light}%, 0.3) 100%)`,
        ];
    }

    addChildren(spaceId: string, childrenId: string) {
        if (this.rooms[childrenId]) {
            let i = this.spaces[spaceId].childs?.indexOf(childrenId);
            if (i == -1) this.spaces[spaceId].childs?.push(childrenId);
        }
    }

    removeChildren(spaceId: string, childId: string) {
        if (!this.spaces[spaceId]) return;
        this.spaces[spaceId].childs = this.spaces[spaceId].childs.filter(
            (id) => id !== childId,
        );
    }

    getInitials(name: string): string {
        return name
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((word) => word[0].toUpperCase())
            .join("");
    }

    selectSpace(id: string) {
        this.selectedSpace = id;
    }

    selectRoom(id: string) {
        this.selectedRoom = id;
    }

    private registerRoom(room: sdk.Room) {
        if (this.rooms[room.roomId]) this.rooms[room.roomId].update(room);
        else this.rooms[room.roomId] = new RoomState(room);
    }
}

const Rooms = new RoomsStore();
export default Rooms;
