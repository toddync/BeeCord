import { decryptAttachment } from "matrix-encrypt-attachment";
import * as sdk from "matrix-js-sdk";
import type { MediaEventContent } from "matrix-js-sdk/lib/types";
import BeeCord from "./BeeCord.svelte";
import Matrix from "./Matrix.svelte";

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
        switch (event) {
            case sdk.RoomEvent.Name:
                this.name = this.room.name;
                break;
            case sdk.RoomEvent.MyMembership:
                this.membership = args[1] as string;
                break;
            case sdk.RoomEvent.UnreadNotifications:
                this.unreadCount = this.room.getUnreadNotificationCount();
                break;
            case sdk.RoomEvent.Timeline:
                this.computeUnread();
                Matrix.client?.decryptEventIfNeeded(args[0] as sdk.MatrixEvent);
                let event = args[0] as sdk.MatrixEvent;

                if (event.getType() === "m.room.message") {
                    // || event.getType().includes("poll")
                    this.lastMessage = event;
                } else if (event.getType() === "m.room.avatar") {
                    this.avatar = event.getContent().url;
                } else if (event.getType() === "m.room.name") {
                    this.name = event.getContent().name;
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

    selectedRoom: string = $state("");
    selectedSpace: string = $state("");

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

            for (const key of Object.keys(this.spaces)) {
                this.spaces[key].childs = [];

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
            }
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
                this.rooms[e.getRoomId()]?.patch(sdk.RoomEvent.Timeline, e),
        );

        Matrix.client?.on(sdk.ClientEvent.Room, (room) => {
            this.registerRoom(room);
        });
    }

    async fetchMxcObjectUrl(mxc: string): Promise<string | null> {
        if (!mxc?.startsWith("mxc://")) return null;
        const homeserver = Matrix.client?.getHomeserverUrl();
        if (!homeserver) return null;

        const downloadUrl = `${homeserver}/_matrix/client/v1/media/download/${mxc.slice(6)}`;
        const res = await BeeCord.fetch(downloadUrl, {
            headers: {
                Authorization: `Bearer ${Matrix.access_token ?? Matrix.client?.getAccessToken()}`,
            },
        });
        if (!res.ok) return null;

        return URL.createObjectURL(await res.blob());
    }

    async loadMediaObjectUrl(
        content: MediaEventContent,
    ): Promise<string | null> {
        const token = Matrix.access_token ?? Matrix.client?.getAccessToken();
        if (!token) {
            console.error("No access token available");
            return null;
        }

        if (content.file?.url) {
            const homeserver = Matrix.client?.getHomeserverUrl();
            if (!homeserver || !content.file.url.startsWith("mxc://"))
                return null;

            const downloadUrl = `${homeserver}/_matrix/client/v1/media/download/${content.file.url.slice(6)}`;

            const res = await BeeCord.fetch(downloadUrl, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) {
                console.error(
                    "Failed to fetch encrypted media",
                    res.status,
                    await res.text(),
                );
                return null;
            }

            const decrypted = await decryptAttachment(
                await res.arrayBuffer(),
                content.file,
            );
            const blob = new Blob([decrypted], {
                type: content.info?.mimetype ?? "image/jpeg",
            });
            return URL.createObjectURL(blob);
        } else {
            return this.fetchMxcObjectUrl(
                content.info?.thumbnail_url ?? content.url,
            );
        }
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
