<script lang="ts" module>
    import Matrix from "$lib/stores/Matrix.svelte";
    import * as sdk from "matrix-js-sdk";

    interface PollResults {
        topic: string;
        userVotesMap: Record<
            string,
            {
                ts: number;
                sender: string;
                senderName: string;
                answers: string[];
            }
        >;
        allVoteCount: number;
        voteCountMap: Record<string, number>;
    }

    async function getPollResults(
        room: sdk.Room,
        pollID: string,
    ): Promise<PollResults | undefined> {
        let timelineWindow = new sdk.TimelineWindow(
            Matrix.client!,
            room?.getUnfilteredTimelineSet(),
        );

        await timelineWindow.load(pollID);
        await room?.processPollEvents(timelineWindow.getEvents());
        let poll = room?.polls.get(pollID);
        if (!poll) {
            console.log("No poll:", poll);
            return; // wrong Poll
        }

        let allResponses = await getAllResponses(poll);
        console.log("allResponses", allResponses);
        console.log(
            "allResponses.getRelations().length:",
            allResponses.getRelations().length,
        );
        if (!allResponses) {
            console.log("No responses!", allResponses);
            return;
        }

        let unfilteredVotes = allResponses
            .getRelations()
            .map((element: any) => {
                let roomMember = room.getMember(element?.getSender())!;
                let Vote = {
                    ts: element?.getTs(),
                    sender: roomMember.userId,
                    senderName: roomMember.name,
                    answers: (
                        sdk.M_POLL_RESPONSE.findIn(element?.getContent()) as any
                    ).answers,
                };
                return Vote;
            });

        const userVotesMap = new Map<string, (typeof unfilteredVotes)[0]>();
        for (const vote of unfilteredVotes.sort((a, b) => a.ts - b.ts)) {
            userVotesMap.set(vote.sender, vote);
        }
        const userVotes = Object.fromEntries(userVotesMap);

        const voteCountMap: Record<string, number> = {};
        for (const vote of userVotesMap.values()) {
            for (const answer of vote.answers ?? []) {
                voteCountMap[answer] = (voteCountMap[answer] ?? 0) + 1;
            }
        }
        const allVoteCount = userVotesMap.size;

        return {
            topic: poll.pollEvent.question.text,
            userVotesMap: userVotes,
            allVoteCount: allVoteCount,
            voteCountMap: voteCountMap,
        };
    }

    async function getAllResponses(poll: sdk.Poll) {
        // Init responses:
        let responses =
            (await poll.getResponses()) ||
            new sdk.Relations(
                "m.reference",
                sdk.M_POLL_RESPONSE.name,
                Matrix.client!,
                [sdk.M_POLL_RESPONSE.altName],
            );

        // Get ALL relations:
        let allRelations = await Matrix.client!.relations(
            poll.roomId,
            poll.rootEvent.getId()!,
            "m.reference",
            undefined,
            { limit: Number.MAX_SAFE_INTEGER },
        );
        await Promise.all(
            allRelations.events.map((event) =>
                Matrix.client!.decryptEventIfNeeded(event),
            ),
        );
        console.log("allRelations.events.length:", allRelations.events.length);
        // Get first M_POLL_END event
        // FIX: sdk.M_POLL_END (was bare M_POLL_END)
        let pollEndEvents = allRelations.events.filter((event) =>
            sdk.M_POLL_END.matches(event.getType()),
        );
        if (pollEndEvents.length > 1) {
            pollEndEvents.sort((a, b) => a.getTs() - b.getTs());
        }
        let pollCloseTimestamp = pollEndEvents[0]
            ? pollEndEvents[0].getTs()
            : Number.MAX_SAFE_INTEGER;
        // FIX: call as plain function, not this.filterResponseRelations(...)
        let { responseEvents } = filterResponseRelations(
            allRelations.events,
            pollCloseTimestamp,
        );
        responseEvents.forEach((event) => {
            responses.addEvent(event);
        });
        return responses;
    }

    function filterResponseRelations(
        relationEvents: sdk.MatrixEvent[],
        pollEndTimestamp: number,
    ) {
        const responseEvents = relationEvents.filter((event) => {
            if (event.isDecryptionFailure()) {
                return false;
            }

            return (
                sdk.M_POLL_RESPONSE.matches(event.getType()) &&
                event.getTs() <= pollEndTimestamp
            );
        });
        return { responseEvents };
    }
</script>

<script lang="ts">
    import { Checkbox } from "$lib/components/ui/checkbox/index.js";
    import ChatBubbleMessage from "../ui/chat/chat-bubble/chat-bubble-message.svelte";
    import ChatBubbleTimestamp from "../ui/chat/chat-bubble/chat-bubble-timestamp.svelte";
    import Progress from "../ui/progress/progress.svelte";

    let {
        event,
        room,
        isMe,
        timestamp,
    }: {
        event: sdk.MatrixEvent;
        room: sdk.Room;
        isMe: boolean;
        timestamp: string;
    } = $props();

    const content = event.getContent();
    const pollData = content["org.matrix.msc3381.poll.start"];
    const question =
        pollData?.question?.["org.matrix.msc1767.text"] ||
        pollData?.question?.body ||
        "Poll";
    const answers: { id: string; text: string }[] = (
        pollData?.answers ?? []
    ).map((a: any) => ({
        id: a.id,
        text: a["org.matrix.msc1767.text"] || a.body || a.id,
    }));
    const maxSelections: number = pollData?.max_selections ?? 1;
    const pollEventId = event.getId()!;
    let pollEnded = $state(false);
    const isDisclosed =
        pollData?.kind !== "org.matrix.msc3381.poll.undisclosed";
    const showResults = $derived(isDisclosed || pollEnded);

    let results: PollResults | undefined = $state();

    $effect(() => {
        getPollResults(room, pollEventId).then((r) => r && (results = r));

        function ingestEvent(e: sdk.MatrixEvent) {
            const type = e.getType();

            if (type === "org.matrix.msc3381.poll.response") {
                const relatesTo = e.getContent()["m.relates_to"];
                if (relatesTo?.event_id !== pollEventId) return;
                if (!results) return;

                const userId = e.getSender()!;
                const answered =
                    (sdk.M_POLL_RESPONSE.findIn(e.getContent()) as any)
                        ?.answers ?? [];

                const newUserVotesMap = {
                    ...results.userVotesMap,
                    [userId]: {
                        ts: e.getTs(),
                        sender: userId,
                        senderName: room.getMember(userId)?.name ?? userId,
                        answers: answered,
                    },
                };

                const newVoteCountMap: Record<string, number> = {};
                for (const answer of answers) newVoteCountMap[answer.id] = 0;
                for (const vote of Object.values(newUserVotesMap)) {
                    for (const a of vote.answers ?? []) {
                        if (a in newVoteCountMap) newVoteCountMap[a]++;
                    }
                }

                results = {
                    ...results,
                    userVotesMap: newUserVotesMap,
                    voteCountMap: newVoteCountMap,
                    allVoteCount: Object.keys(newUserVotesMap).length,
                };
            }

            if (type === "org.matrix.msc3381.poll.end") {
                const relatesTo = e.getContent()["m.relates_to"];
                if (relatesTo?.event_id !== pollEventId) return;
                pollEnded = true;
            }
        }

        Matrix.client?.addListener(sdk.RoomEvent.Timeline, ingestEvent);
        Matrix.client?.addListener(sdk.MatrixEventEvent.Decrypted, ingestEvent);

        return () => {
            Matrix.client?.removeListener(sdk.RoomEvent.Timeline, ingestEvent);
            Matrix.client?.removeListener(
                sdk.MatrixEventEvent.Decrypted,
                ingestEvent,
            );
        };
    });

    async function vote(answerId: string) {
        if (pollEnded || !Matrix.client || !results) return;

        const userId = Matrix.user_id!;
        const prevAnswers = results.userVotesMap[userId]?.answers ?? [];

        const newAnswers = prevAnswers.includes(answerId)
            ? prevAnswers.filter((a) => a !== answerId)
            : [...prevAnswers].slice(0, maxSelections - 1).concat(answerId);

        const newUserVotesMap = {
            ...results.userVotesMap,
            [userId]: {
                ts: Date.now(),
                sender: userId,
                senderName: room.getMember(userId)?.name ?? userId,
                answers: newAnswers,
            },
        };
        const newVoteCountMap: Record<string, number> = {};
        for (const answer of answers) newVoteCountMap[answer.id] = 0;
        for (const vote of Object.values(newUserVotesMap)) {
            for (const a of vote.answers ?? []) {
                if (a in newVoteCountMap) newVoteCountMap[a]++;
            }
        }
        results = {
            ...results,
            userVotesMap: newUserVotesMap,
            voteCountMap: newVoteCountMap,
            allVoteCount: Object.keys(newUserVotesMap).length,
        };

        await Matrix.client.sendEvent(
            room.roomId,
            "org.matrix.msc3381.poll.response" as any,
            {
                "org.matrix.msc3381.poll.response": { answers: newAnswers },
                "m.relates_to": {
                    rel_type: "m.reference",
                    event_id: pollEventId,
                },
            },
        );
    }
</script>

<ChatBubbleMessage
    class="min-w-72"
    variant={isMe ? "sent" : "received"}
>
    <div class="flex flex-col gap-3 p-1">
        <div class="flex items-start justify-between gap-2">
            <p class="font-medium text-sm leading-snug">
                {results?.topic || question}
            </p>
            {#if pollEnded}
                <span class="text-xs text-muted-foreground shrink-0 mt-0.5">
                    Ended
                </span>
            {/if}
        </div>

        <div class="flex flex-col gap-2">
            {#each answers as answer (answer.id)}
                {@const voted = results?.userVotesMap[
                    Matrix.user_id!
                ].answers.includes(answer.id)}

                <button
                    class="relative rounded-md border text-left text-sm px-3 py-2 overflow-hidden transition-colors
                            {pollEnded
                        ? 'cursor-default opacity-80'
                        : 'hover:bg-muted cursor-pointer'}"
                    disabled={pollEnded}
                    onclick={() => vote(answer.id)}
                >
                    <div
                        class="relative flex justify-between items-center gap-2"
                    >
                        <span class="flex gap-2">
                            <Checkbox
                                checked={voted}
                                disabled
                                class="opacity-100!"
                            />
                            <span>
                                {answer.text}
                            </span>
                        </span>
                        {#if showResults}
                            <span
                                class="text-xs text-muted-foreground shrink-0"
                            >
                                {results?.voteCountMap[answer.id] || 0} vote{(results
                                    ?.voteCountMap[answer.id] || 0) > 1 ||
                                (results?.voteCountMap[answer.id] || 0) == 0
                                    ? "s"
                                    : ""}
                            </span>
                        {/if}
                    </div>

                    {#if showResults}
                        <Progress
                            class="mt-2"
                            max={results?.allVoteCount}
                            value={results?.voteCountMap[answer.id]}
                        />
                    {/if}
                </button>
            {/each}
        </div>
    </div>

    <span class="text-xs text-muted-foreground shrink-0 inline">
        Total: {results?.allVoteCount || 0} vote{(results?.allVoteCount || 0) >
            1 || (results?.allVoteCount || 0) == 0
            ? "s"
            : ""}
    </span>
    <ChatBubbleTimestamp class="whitespace-pre" {timestamp} />
</ChatBubbleMessage>
