import type {
    VerificationRequest,
    ShowSasCallbacks,
    ShowQrCodeCallbacks,
    EmojiMapping,
    Verifier,
} from "matrix-js-sdk/lib/crypto-api/verification";
// import { scan, Format } from "@tauri-apps/plugin-barcode-scanner";
// @ts-ignore
import * as QRCode from "qrcode";
import {
    VerificationPhase,
    VerificationRequestEvent,
    VerifierEvent,
} from "matrix-js-sdk/lib/crypto-api/verification";
import Matrix from "./Matrix.svelte";

export enum VerificationState {
    IDLE = "idle",
    REQUESTING = "requesting",
    INCOMING = "incoming",
    METHOD_SELECTION = "method_selection",
    READY = "ready",
    SHOW_QR_CODE = "show_qr_code",
    SHOW_RECIPROCATE_QR = "show_reciprocate_qr",
    SHOW_EMOJIS = "show_emojis",
    WAITING_CONFIRM = "waiting_confirm",
    DONE = "done",
    CANCELLED = "cancelled",
    ERROR = "error"
}

export class VerificationStore {
    state: VerificationState = $state(VerificationState.IDLE);
    emojis: EmojiMapping[] | null = $state(null);
    qrCodeDataUrl: string | null = $state(null);
    errorMsg: string | null = $state(null);

    private _request: VerificationRequest | null = $state(null);
    private _verifier: Verifier | null = $state(null);
    private _sasCallbacks: ShowSasCallbacks | null = null;
    private _qrCallbacks: ShowQrCodeCallbacks | null = null;

    get request() {
        return this._request;
    }

    get isIncoming() {
        return this.state === VerificationState.INCOMING;
    }

    get isActive() {
        return this.state !== VerificationState.IDLE && this.state !== VerificationState.DONE && this.state !== VerificationState.CANCELLED;
    }

    constructor() {
        $effect.root(() => {
            $effect(() => {
                const incomingRequest = Matrix.verificationRequest;
                if (incomingRequest && this.state === VerificationState.IDLE) {
                    this._setRequest(incomingRequest);
                    this.state = VerificationState.INCOMING;
                }
            });
        });
    }

    private _setRequest(request: VerificationRequest) {
        this._request = request;
        request.on(VerificationRequestEvent.Change, () => this._handleRequestChange());
    }

    private _removeRequestListeners() {
        this._request?.removeAllListeners(VerificationRequestEvent.Change);
    }

    private _handleRequestChange() {
        if (!this._request) return;
        const phase = this._request.phase;

        switch (phase) {
            case VerificationPhase.Cancelled:
                this.state = VerificationState.CANCELLED;
                this._cleanup();
                break;
            case VerificationPhase.Done:
                this.state = VerificationState.DONE;
                this._cleanup();
                break;
            case VerificationPhase.Ready:
                this.state = VerificationState.READY;
                // If it's ready, we can check if it has a verifier starting up
                if (this._request.verifier) {
                    this._bindVerifier(this._request.verifier);
                }
                break;
            case VerificationPhase.Started:
                if (this._request.verifier) {
                    this._bindVerifier(this._request.verifier);
                }
                break;
        }
    }

    private _bindVerifier(verifier: Verifier) {
        if (this._verifier === verifier) return; // already bound
        this._verifier = verifier;

        verifier.on(VerifierEvent.ShowSas, (sas: ShowSasCallbacks) => {
            this._sasCallbacks = sas;
            this.emojis = (sas.sas.emoji as EmojiMapping[]) ?? null;
            this.state = VerificationState.SHOW_EMOJIS;
        });

        verifier.on(VerifierEvent.ShowReciprocateQr, (qr: ShowQrCodeCallbacks) => {
            this._qrCallbacks = qr;
            this.state = VerificationState.SHOW_RECIPROCATE_QR;
        });

        verifier.on(VerifierEvent.Cancel, () => {
            this.state = VerificationState.CANCELLED;
            this._cleanup();
        });

        verifier.verify().then(() => {
            this.state = VerificationState.DONE;
        }).catch((err: any) => {
            if (!this._verifier?.hasBeenCancelled) {
                this.state = VerificationState.ERROR;
                this.errorMsg = err.message || "An error occurred during verification.";
            }
        });
    }

    private async _startSas(request: VerificationRequest) {
        try {
            const verifier = await Matrix.startSas(request);
            this._bindVerifier(verifier);
        } catch (err: any) {
            this.state = VerificationState.ERROR;
            this.errorMsg = err.message || "Failed to start SAS verification.";
        }
    }

    private _cleanup() {
        this._removeRequestListeners();
        this._request = null;
        this._verifier = null;
        this._sasCallbacks = null;
        Matrix.verificationRequest = null;
    }

    async startVerification() {
        try {
            if (!Matrix.client?.getCrypto()) {
                this.state = VerificationState.ERROR;
                this.errorMsg = "Matrix Client does not support End-to-End Encryption.";
                return;
            }

            this.state = VerificationState.REQUESTING;
            this.emojis = null;
            this.errorMsg = null;

            const request = await Matrix.requestOwnUserVerification();
            if (!request) {
                this.state = VerificationState.ERROR;
                this.errorMsg = "Failed to create verification request.";
                return;
            }

            this._setRequest(request);

            if (request.phase === VerificationPhase.Ready) {
                await this._handleReadyOutgoing(request);
            } else {
                const waitForReady = async () => {
                    if (request.phase === VerificationPhase.Ready) {
                        request.off(VerificationRequestEvent.Change, waitForReady);
                        await this._handleReadyOutgoing(request);
                    } else if (request.phase === VerificationPhase.Cancelled) {
                        request.off(VerificationRequestEvent.Change, waitForReady);
                        this.state = VerificationState.CANCELLED;
                    }
                };
                request.on(VerificationRequestEvent.Change, waitForReady);
            }
        } catch (err: any) {
            this.state = VerificationState.ERROR;
            this.errorMsg = err.message || "An exception occurred starting verification.";
        }
    }

    private async _handleReadyOutgoing(request: VerificationRequest) {
        try {
            // Try QR Code first as default for outgoing
            const qrBuffer = await request.generateQRCode();
            if (qrBuffer) {
                // qrBuffer is Uint8ClampedArray. QRcode library works with arrays or strings.
                // We'll pass it as a regular Array of byte values.
                const bufferArray = Array.from(qrBuffer);
                this.qrCodeDataUrl = await QRCode.toDataURL([{ data: bufferArray as any, mode: 'byte' }], {
                    errorCorrectionLevel: 'L',
                    margin: 2,
                    width: 300,
                    color: {
                        dark: '#000000',
                        light: '#ffffff'
                    }
                });
                this.state = VerificationState.SHOW_QR_CODE;
            } else {
                // Fallback to emoji if QR not supported by the other client
                this.state = VerificationState.REQUESTING;
                await this._startSas(request);
            }
        } catch (err) {
            console.error("Failed QR generation, falling back to Emojis", err);
            this.state = VerificationState.REQUESTING;
            await this._startSas(request);
        }
    }

    async acceptVerification() {
        if (!this._request) return;
        try {
            await Matrix.acceptRequest(this._request);
            // After accepting, we let the user choose Method if applicable
            this.state = VerificationState.METHOD_SELECTION;
        } catch (err: any) {
            this.state = VerificationState.ERROR;
            this.errorMsg = err.message || "Failed to accept verification request.";
        }
    }

    async selectEmojiVerification() {
        if (!this._request) return;
        this.state = VerificationState.REQUESTING;
        await this._startSas(this._request);
    }

    async scanQRCode() {
        if (!this._request || true) return;

        try {
            // Check if Matrix request implies the other party is ready to be scanned
            // if (!this._request.otherPartySupportsMethod("m.qr_code.show.v1")) {
            //     throw new Error("Other device does not support showing a QR code.");
            // }

            // Bring up Tauri scanner
            // const scanned = await scan({ formats: [Format.QRCode] });

            // if (scanned && scanned.content) {
            //     // Convert text payload back to Uint8ClampedArray for Matrix
            //     const buffer = new Uint8ClampedArray(
            //         new TextEncoder().encode(scanned.content)
            //     );

            //     // Let the request know we scanned it, switching Verifier modes internal to SDK
            //     const verifier = await this._request.scanQRCode(buffer);
            //     this._bindVerifier(verifier);
            // }
        } catch (err: any) {
            console.error("QR Scan failed:", err);
            this.state = VerificationState.ERROR;
            this.errorMsg = err.message || "Failed to scan QR code.";
        }
    }

    async confirmEmojis() {
        if (!this._sasCallbacks) return;
        this.state = VerificationState.WAITING_CONFIRM;
        try {
            await this._sasCallbacks.confirm();
        } catch (err: any) {
            this.state = VerificationState.ERROR;
            this.errorMsg = err.message || "Failed to confirm emojis.";
        }
    }

    rejectEmojis() {
        this._sasCallbacks?.mismatch();
        this.state = VerificationState.CANCELLED;
        this.errorMsg = "Emoji mismatch reported.";
        this._cleanup();
    }

    confirmQrReciprocate() {
        if (!this._qrCallbacks) return;
        this.state = VerificationState.WAITING_CONFIRM;
        this._qrCallbacks.confirm();
    }

    rejectQrReciprocate() {
        if (!this._qrCallbacks) return;
        this._qrCallbacks.cancel();
        this.state = VerificationState.CANCELLED;
        this.errorMsg = "QR Reciprocation cancelled.";
        this._cleanup();
    }

    cancelVerification() {
        if (this._request?.pending) {
            this._request.cancel();
        }
        this.state = VerificationState.CANCELLED;
        this._cleanup();
    }

    reset() {
        this.state = VerificationState.IDLE;
        this.emojis = null;
        this.qrCodeDataUrl = null;
        this.errorMsg = null;
        this._cleanup();
    }
}

const Verification =  new VerificationStore();
export default Verification;
