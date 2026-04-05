class Calls_ {
    activeCallRoomId: string | null = $state(null);

    joinCall(roomId: string) {
        this.activeCallRoomId = roomId;
    }

    leaveCall() {
        this.activeCallRoomId = null;
    }
}

const Calls = new Calls_();
export default Calls;
