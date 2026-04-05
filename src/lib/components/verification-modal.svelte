<script lang="ts">
    import Verification, {
        VerificationState,
    } from "$lib/stores/Verification.svelte";
</script>

{#if Verification.isActive}
    <div class="modal-overlay">
        <div class="modal-content">
            <div class="modal-header">
                <h2>Device Verification</h2>
                <button
                    class="close-button"
                    onclick={() => Verification.cancelVerification()}
                    aria-label="Close"
                >
                    &times;
                </button>
            </div>

            <div class="modal-body">
                {#if Verification.state === VerificationState.INCOMING}
                    <div class="verification-step">
                        <p class="description">
                            Another device is attempting to verify this session.
                            Do you want to accept?
                        </p>
                        <div class="action-buttons">
                            <button
                                class="btn reject"
                                onclick={() =>
                                    Verification.cancelVerification()}
                            >
                                Decline
                            </button>
                            <button
                                class="btn accept"
                                onclick={() =>
                                    Verification.acceptVerification()}
                            >
                                Accept
                            </button>
                        </div>
                    </div>
                {/if}

                {#if Verification.state === VerificationState.METHOD_SELECTION}
                    <div class="verification-step">
                        <p class="description">
                            The other device has accepted your verification
                            request. How would you like to verify?
                        </p>
                        <div class="action-buttons vertical-layout">
                            <!-- TODO: Incoming QR Scanning natively in BeeCord is not yet supported -->
                            <button
                                class="btn reject"
                                onclick={() =>
                                    Verification.selectEmojiVerification()}
                            >
                                Verify by Emoji
                            </button>
                        </div>
                    </div>
                {/if}

                {#if Verification.state === VerificationState.REQUESTING || Verification.state === VerificationState.READY}
                    <div class="verification-step centered">
                        <div class="spinner"></div>
                        <p class="description mt-4">
                            Waiting for the other device to accept...
                        </p>
                    </div>
                {/if}

                {#if Verification.state === VerificationState.SHOW_QR_CODE && Verification.qrCodeDataUrl}
                    <div class="verification-step centered">
                        <p class="description">
                            Scan this QR code with your other device to verify.
                        </p>
                        <div class="qr-container">
                            <!-- svelte-ignore a11y_img_redundant_alt -->
                            <img
                                src={Verification.qrCodeDataUrl}
                                alt="Verification QR Code"
                                class="qr-code"
                            />
                        </div>
                        <p class="description mt-4">
                            Or proceed manually using the Short Authentication
                            String.
                        </p>
                        <button
                            class="btn reject w-full mt-2"
                            onclick={() =>
                                Verification.selectEmojiVerification()}
                        >
                            Verify by Emoji instead
                        </button>
                    </div>
                {/if}

                {#if Verification.state === VerificationState.SHOW_RECIPROCATE_QR}
                    <div class="verification-step">
                        <p class="description">
                            Did the other device successfully scan your QR code?
                        </p>
                        <div class="action-buttons">
                            <button
                                class="btn reject"
                                onclick={() =>
                                    Verification.rejectQrReciprocate()}
                            >
                                No
                            </button>
                            <button
                                class="btn accept"
                                onclick={() =>
                                    Verification.confirmQrReciprocate()}
                            >
                                Yes
                            </button>
                        </div>
                    </div>
                {/if}

                {#if Verification.state === VerificationState.SHOW_EMOJIS && Verification.emojis}
                    <div class="verification-step">
                        <p class="description">
                            Verify that these emojis match exactly on the other
                            device.
                        </p>
                        <div class="emoji-grid">
                            {#each Verification.emojis as emoji}
                                <div class="emoji-item">
                                    <span class="emoji-char">{emoji[0]}</span>
                                    <span class="emoji-name">{emoji[1]}</span>
                                </div>
                            {/each}
                        </div>
                        <div class="action-buttons">
                            <button
                                class="btn reject"
                                onclick={() => Verification.rejectEmojis()}
                            >
                                They Don't Match
                            </button>
                            <button
                                class="btn accept"
                                onclick={() => Verification.confirmEmojis()}
                            >
                                They Match
                            </button>
                        </div>
                    </div>
                {/if}

                {#if Verification.state === VerificationState.WAITING_CONFIRM}
                    <div class="verification-step centered">
                        <div class="spinner"></div>
                        <p class="description mt-4">
                            Waiting for the other device to confirm the match...
                        </p>
                    </div>
                {/if}

                {#if Verification.state === VerificationState.ERROR}
                    <div class="verification-step">
                        <div class="error-box">
                            <svg
                                class="error-icon"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="12"></line>
                                <line x1="12" y1="16" x2="12.01" y2="16"></line>
                            </svg>
                            <p class="error-text">Verification Failed</p>
                            <p class="error-details">{Verification.errorMsg}</p>
                        </div>
                        <button
                            class="btn return-btn mt-4"
                            onclick={() => Verification.reset()}
                        >
                            Close
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    /* Overlay for the whole screen */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999;
        animation: fadeIn 0.2s ease-out;
    }

    /* Modal box */
    .modal-content {
        background-color: #1a1a1b; /* Discord Dark */
        border-radius: 12px;
        width: 100%;
        max-width: 480px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: scaleUp 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        color: #f2f3f5;
        border: 1px solid #2d2d2f;
    }

    .modal-header {
        padding: 20px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #2d2d2f;
    }

    .modal-header h2 {
        margin: 0;
        font-size: 20px;
        font-weight: 600;
        color: #fff;
    }

    .close-button {
        background: none;
        border: none;
        color: #b9bbbe;
        font-size: 24px;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.2s;
        transform: translateY(-2px);
    }

    .close-button:hover {
        color: #fff;
    }

    .modal-body {
        padding: 24px;
    }

    .verification-step {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .verification-step.centered {
        align-items: center;
        justify-content: center;
        padding-top: 20px;
        padding-bottom: 20px;
    }

    .description {
        margin: 0;
        font-size: 15px;
        color: #dcddde;
        line-height: 1.5;
        text-align: center;
    }

    .mt-4 {
        margin-top: 16px;
    }

    /* Action Buttons */
    .action-buttons {
        display: flex;
        gap: 12px;
        margin-top: 8px;
    }

    .action-buttons.vertical-layout {
        flex-direction: column;
        gap: 8px;
    }

    .btn {
        flex: 1;
        padding: 12px 16px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .w-full {
        width: 100%;
    }

    .btn.accept {
        background-color: #5865f2; /* Discord Blurple */
        color: white;
    }

    .btn.accept:hover {
        background-color: #4752c4;
    }

    .btn.reject {
        background-color: transparent;
        color: #ed4245; /* Discord Red */
        border: 1px solid #ed4245;
    }

    .btn.reject:hover {
        background-color: rgba(237, 66, 69, 0.1);
    }

    .btn.return-btn {
        background-color: #4f545c;
        color: white;
    }

    .btn.return-btn:hover {
        background-color: #686d73;
    }

    /* QR Code Container */
    .qr-container {
        display: flex;
        justify-content: center;
        align-items: center;
        background: white;
        padding: 12px;
        border-radius: 12px;
        margin: 8px 0;
    }

    .qr-code {
        width: 220px;
        height: 220px;
        border-radius: 4px;
        image-rendering: pixelated;
    }

    /* Emoji Grid */
    .emoji-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        justify-content: center;
        margin: 16px 0;
        background-color: #2b2d31;
        padding: 16px;
        border-radius: 8px;
    }

    /* Special rule for the 7th emoji to center it on the second row */
    .emoji-item:nth-child(5) {
        grid-column-start: 2;
    }

    .emoji-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }

    .emoji-char {
        font-size: 32px;
    }

    .emoji-name {
        font-size: 12px;
        color: #b9bbbe;
        text-align: center;
        font-weight: 500;
    }

    /* Loading Spinner */
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid rgba(88, 101, 242, 0.3);
        border-radius: 50%;
        border-top-color: #5865f2;
        animation: spin 1s ease-in-out infinite;
    }

    /* Error View */
    .error-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 24px;
        background-color: rgba(237, 66, 69, 0.1);
        border: 1px solid rgba(237, 66, 69, 0.4);
        border-radius: 8px;
        color: #ed4245;
        text-align: center;
    }

    .error-icon {
        width: 48px;
        height: 48px;
        margin-bottom: 12px;
        color: #ed4245;
    }

    .error-text {
        font-weight: 700;
        font-size: 18px;
        margin: 0 0 8px 0;
    }

    .error-details {
        font-size: 14px;
        margin: 0;
        color: #f2f3f5;
    }

    /* Animations */
    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    @keyframes scaleUp {
        from {
            opacity: 0;
            transform: scale(0.95);
        }
        to {
            opacity: 1;
            transform: scale(1);
        }
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
