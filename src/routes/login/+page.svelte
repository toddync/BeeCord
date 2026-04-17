<script lang="ts">
    import FlickerGrid from "$lib/components/flicker-grid.svelte";
    import { Button } from "$lib/components/ui/button/index.js";
    import * as Card from "$lib/components/ui/card/index.js";
    import {
        Field,
        FieldGroup,
        FieldLabel,
    } from "$lib/components/ui/field/index.js";
    import { Input } from "$lib/components/ui/input/index.js";
    import Matrix from "$lib/stores/Matrix.svelte";
</script>

<div class="relative flex flex-1">
    <FlickerGrid
        color="#efb100"
        maxOpacity={0.05}
        flickerChance={0.01}
        gridGap={5}
        class="absolute -z-10"
    />

    <Card.Root class="mx-auto my-auto w-full max-w-sm">
        <Card.Header>
            <Card.Title class="text-2xl">Login</Card.Title>
            <Card.Description>
                Enter your credentials below to login to your account
            </Card.Description>
        </Card.Header>
        <Card.Content>
            <form>
                <FieldGroup>
                    <Field>
                        <FieldLabel for="homeserver">Homeserver URL</FieldLabel>
                        <Input
                            placeholder="https://matrix.org"
                            bind:value={Matrix.homeserver}
                            id="homeserver"
                            type="text"
                            required
                        />
                    </Field>
                    <Field>
                        <FieldLabel for="username">Username</FieldLabel>
                        <Input
                            id="username"
                            type="text"
                            placeholder="example-user"
                            bind:value={Matrix.username}
                            required
                        />
                    </Field>
                    <Field>
                        <div class="flex items-center">
                            <FieldLabel for="password">Password</FieldLabel>
                        </div>
                        <Input
                            id="password"
                            type="password"
                            required
                            bind:value={Matrix.password}
                        />
                    </Field>
                    <Field>
                        <Button onclick={() => Matrix.login()} class="w-full">
                            Login
                        </Button>
                    </Field>
                </FieldGroup>
            </form>
        </Card.Content>
    </Card.Root>
</div>
