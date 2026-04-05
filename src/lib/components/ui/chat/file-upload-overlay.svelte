<script lang="ts">
    import { Button } from "$lib/components/ui/button/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import Matrix from "$lib/stores/Matrix.svelte";
    import { Paperclip, Upload } from "lucide-svelte";
    import { encryptAttachment } from "matrix-encrypt-attachment";
    import * as sdk from "matrix-js-sdk";
    import { toast } from "svelte-sonner";

    let {
        room,
        selectedFiles = $bindable(null),
    }: { room: sdk.Room; selectedFiles: FileList | null } = $props();

    let dragCounter = $state(0);
    let dragging = $derived(dragCounter > 0);
    let previewUrl: string | null = $state(null);
    let caption = $state("");

    let localSelectedFile: File | null = $state(null);

    $effect(() => {
        if (selectedFiles && selectedFiles.length > 0) {
            localSelectedFile = selectedFiles[0];
            selectedFiles = null; // consume it
        }
    });

    $effect(() => {
        if (localSelectedFile) {
            previewUrl = URL.createObjectURL(localSelectedFile);
        } else {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                previewUrl = null;
            }
            caption = "";
        }
    });

    function onDragEnter(e: DragEvent) {
        e.preventDefault();
        dragCounter++;
    }

    function onDragLeave(e: DragEvent) {
        dragCounter--;
    }

    function onDragOver(e: DragEvent) {
        e.preventDefault();
    }

    function onDrop(e: DragEvent) {
        console.log(e)
        e.preventDefault();
        dragCounter = 0;
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
            localSelectedFile = e.dataTransfer.files[0];
        }
    }

    async function generateThumbnail(
        file: File,
    ): Promise<{ blob: Blob; info: any } | null> {
        return new Promise((resolve) => {
            const maxW = 800;
            const maxH = 600;

            if (file.type.startsWith("image/")) {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    let width = img.width;
                    let height = img.height;

                    if (width > maxW || height > maxH) {
                        const ratio = Math.min(maxW / width, maxH / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return resolve(null);
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(
                        (blob) => {
                            if (blob)
                                resolve({
                                    blob,
                                    info: {
                                        w: width,
                                        h: height,
                                        mimetype: "image/jpeg",
                                        size: blob.size,
                                    },
                                });
                            else resolve(null);
                        },
                        "image/jpeg",
                        0.8,
                    );
                };
                img.onerror = () => resolve(null);
                img.src = URL.createObjectURL(file);
            } else if (file.type.startsWith("video/")) {
                const video = document.createElement("video");
                video.preload = "metadata";
                video.muted = true;
                video.playsInline = true;

                video.onloadeddata = () => {
                    video.currentTime = Math.min(1, video.duration / 2 || 0);
                };

                video.onseeked = () => {
                    const canvas = document.createElement("canvas");
                    let width = video.videoWidth;
                    let height = video.videoHeight;

                    if (width > maxW || height > maxH) {
                        const ratio = Math.min(maxW / width, maxH / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) return resolve(null);
                    ctx.drawImage(video, 0, 0, width, height);

                    canvas.toBlob(
                        (blob) => {
                            if (blob)
                                resolve({
                                    blob,
                                    info: {
                                        w: width,
                                        h: height,
                                        mimetype: "image/jpeg",
                                        size: blob.size,
                                    },
                                });
                            else resolve(null);
                        },
                        "image/jpeg",
                        0.8,
                    );
                };
                video.onerror = () => resolve(null);
                video.src = URL.createObjectURL(file);
            } else {
                resolve(null);
            }
        });
    }

    function getMsgType(mimeType: string) {
        if (mimeType.startsWith("image/")) return sdk.MsgType.Image;
        if (mimeType.startsWith("video/")) return sdk.MsgType.Video;
        if (mimeType.startsWith("audio/")) return sdk.MsgType.Audio;
        return sdk.MsgType.File;
    }

    async function confirmUpload() {
        if (!localSelectedFile || !Matrix.client || !room) return;
        const file = localSelectedFile;
        const textPayload = caption.trim() || file.name;
        localSelectedFile = null;

        const isEncrypted = room.hasEncryptionStateEvent();

        const content: Record<string, any> = {
            msgtype: getMsgType(file.type),
            body: textPayload,
            filename: file.name,
            info: {
                size: file.size,
                mimetype: file.type,
            },
        };

        const toastId = toast.loading(`Uploading ${file.name}... 0%`);

        try {
            const thumbData = await generateThumbnail(file).catch(() => null);

            if (isEncrypted) {
                if (thumbData) {
                    const { data: thumbEncryptedData, info: thumbEncInfo } =
                        await encryptAttachment(
                            await thumbData.blob.arrayBuffer(),
                        );
                    const thumbUploadRes = await Matrix.client.uploadContent(
                        new Blob([thumbEncryptedData]),
                    );
                    content.info.thumbnail_file = {
                        ...thumbEncInfo,
                        url: thumbUploadRes.content_uri,
                    };
                    content.info.thumbnail_info = thumbData.info;
                }

                const arrayBuffer = await file.arrayBuffer();
                const { data, info: encryptedFileInfo } =
                    await encryptAttachment(arrayBuffer);
                const encryptedBlob = new Blob([data]);

                const uploadResponse = await Matrix.client.uploadContent(
                    encryptedBlob,
                    {
                        progressHandler: (progress) => {
                            const percent = Math.round(
                                (progress.loaded / progress.total) * 100,
                            );
                            toast.loading(
                                `Uploading ${file.name}... ${percent}%`,
                                { id: toastId },
                            );
                        },
                    },
                );

                content.file = {
                    ...encryptedFileInfo,
                    url: uploadResponse.content_uri,
                };
            } else {
                if (thumbData) {
                    const thumbUploadRes = await Matrix.client.uploadContent(
                        thumbData.blob,
                    );
                    content.info.thumbnail_url = thumbUploadRes.content_uri;
                    content.info.thumbnail_info = thumbData.info;
                }

                const uploadResponse = await Matrix.client.uploadContent(file, {
                    progressHandler: (progress) => {
                        const percent = Math.round(
                            (progress.loaded / progress.total) * 100,
                        );
                        toast.loading(`Uploading ${file.name}... ${percent}%`, {
                            id: toastId,
                        });
                    },
                });
                content.url = uploadResponse.content_uri;
            }

            await Matrix.client.sendMessage(room.roomId, content as any);
            toast.success(`${file.name} uploaded successfully`, {
                id: toastId,
            });
        } catch (error) {
            console.error(error);
            toast.error(`Failed to upload ${file.name}`, { id: toastId });
        }
    }
</script>

<svelte:window
    ondragenter={onDragEnter}
    ondragleave={onDragLeave}
    ondragover={onDragOver}
    ondrop={onDrop}
/>

{#if dragging && !localSelectedFile}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="absolute inset-0 z-100 flex flex-col items-center justify-center bg-primary/10 backdrop-blur-sm transition-all"
        ondragover={(e) => e.preventDefault()}
        ondrop={onDrop}
    >
        <div
            class="flex flex-col items-center justify-center p-12 rounded-2xl border-4 border-dashed border-primary bg-background/80 shadow-2xl"
        >
            <Upload
                class="size-24 stroke-primary stroke-[1.5] mb-4 animate-bounce"
            />
            <span class="text-xl font-semibold text-primary tracking-tight"
                >Drop your file here</span
            >
            <p class="text-sm text-muted-foreground mt-2">
                Release to start your upload
            </p>
        </div>
    </div>
{/if}

{#if localSelectedFile}
    <div
        class="absolute inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
    >
        <div
            class="bg-card w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden flex flex-col max-h-[90svh]"
        >
            <div
                class="p-6 overflow-y-auto flex-1 flex flex-col items-center gap-6"
            >
                <h2 class="text-xl font-bold self-start">Upload File</h2>

                {#if previewUrl && localSelectedFile.type.startsWith("image/")}
                    <img
                        src={previewUrl}
                        alt="Preview"
                        class="max-h-64 object-contain rounded-md border shadow-sm"
                    />
                {:else if previewUrl && localSelectedFile.type.startsWith("video/")}
                    <!-- svelte-ignore a11y_media_has_caption -->
                    <video
                        src={previewUrl}
                        controls
                        class="max-h-64 w-full rounded-md border bg-black shadow-sm"
                    ></video>
                {:else if previewUrl && localSelectedFile.type.startsWith("audio/")}
                    <div
                        class="w-full flex justify-center bg-muted/50 p-4 rounded-md border"
                    >
                        <audio src={previewUrl} controls class="w-full"></audio>
                    </div>
                {:else}
                    <div
                        class="flex flex-col items-center gap-2 p-12 border rounded-md w-full bg-muted/50"
                    >
                        <Paperclip class="w-16 h-16 text-muted-foreground" />
                        <span class="text-sm font-medium text-center break-all"
                            >{localSelectedFile.name}</span
                        >
                        <span class="text-xs text-muted-foreground"
                            >{(localSelectedFile.size / 1024 / 1024).toFixed(2)} MB</span
                        >
                    </div>
                {/if}

                <div class="w-full flex flex-col gap-2">
                    <label for="caption" class="text-sm font-medium"
                        >Caption (Optional)</label
                    >
                    <Input
                        id="caption"
                        bind:value={caption}
                        placeholder="Add a description or message..."
                    />
                </div>
            </div>

            <div
                class="bg-muted/50 p-4 border-t flex justify-end gap-3 shrink-0"
            >
                <Button
                    variant="outline"
                    onclick={() => (localSelectedFile = null)}>Cancel</Button
                >
                <Button onclick={confirmUpload}>Upload</Button>
            </div>
        </div>
    </div>
{/if}
