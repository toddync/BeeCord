class SecretStorage {
    isPrompting = $state(false);
    keysDescription = $state<any>(null);
    
    private resolve: ((key: Uint8Array | null) => void) | null = null;
    
    requestKey(keysDescription: any): Promise<Uint8Array | null> {
        this.keysDescription = keysDescription;
        this.isPrompting = true;
        return new Promise((r) => {
            this.resolve = r;
        });
    }

    submitKey(key: Uint8Array | null) {
        this.isPrompting = false;
        this.keysDescription = null;
        if (this.resolve) {
            this.resolve(key);
            this.resolve = null;
        }
    }
}

export const SecretStorageDialog = new SecretStorage();
