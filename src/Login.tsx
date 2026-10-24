import { useState } from "react";
import { Alert, Anchor, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from "@mantine/core";
import { IconBrandGithub } from "@tabler/icons-react";
import { supabase } from "./supabase.ts";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <Center py={{ base: "xl", sm: 80 }}>
      <Paper withBorder radius="lg" p="xl" shadow="xs" w="100%" maw={420}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Stack gap="md">
            <div>
              <Title order={3}>Sign in to view your history</Title>
              <Text size="sm" c="dimmed" mt={4}>
                Your account is private. Logging and editing are only available in the desktop app.
              </Text>
            </div>
            <TextInput label="Email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
            <PasswordInput
              label="Password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            {error && (
              <Alert color="red" variant="light">
                {error}
              </Alert>
            )}
            <Button type="submit" size="md" loading={busy}>
              Sign in
            </Button>
            <Anchor href="https://github.com/urmamge/calorietracker" target="_blank" rel="noopener" size="sm" ta="center">
              <IconBrandGithub size={14} style={{ verticalAlign: "-2px" }} /> View this project on GitHub
            </Anchor>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
