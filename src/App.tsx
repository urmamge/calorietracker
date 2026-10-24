import { useEffect, useState } from "react";
import {
  ActionIcon,
  AppShell,
  Button,
  Center,
  Container,
  Group,
  Loader,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { IconLogout, IconMoon, IconSalad, IconSun } from "@tabler/icons-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase.ts";
import { HistoryPage } from "./HistoryPage.tsx";
import { Login } from "./Login.tsx";

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const { toggleColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <AppShell header={{ height: 68 }} padding={{ base: "sm", sm: "lg" }}>
      <AppShell.Header>
        <Container size="xl" h="100%">
          <Group h="100%" justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap">
              <ThemeIcon size={40} radius="md" variant="gradient" gradient={{ from: "violet", to: "grape", deg: 135 }}>
                <IconSalad size={24} />
              </ThemeIcon>
              <div>
                <Title order={4} lh={1.15}>
                  Daily Nutrition Tracker
                </Title>
                <Text size="xs" c="dimmed" visibleFrom="sm">
                  Your history, synced from the desktop app
                </Text>
              </div>
            </Group>
            <Group gap="sm" wrap="nowrap">
              {session && (
                <>
                  <Button variant="default" leftSection={<IconLogout size={16} />} onClick={() => supabase.auth.signOut()} visibleFrom="sm">
                    Sign out
                  </Button>
                  <Tooltip label="Sign out">
                    <ActionIcon variant="default" size="lg" onClick={() => supabase.auth.signOut()} aria-label="Sign out" hiddenFrom="sm">
                      <IconLogout size={18} />
                    </ActionIcon>
                  </Tooltip>
                </>
              )}
              <Tooltip label={scheme === "dark" ? "Light mode" : "Dark mode"}>
                <ActionIcon variant="default" size="lg" onClick={toggleColorScheme} aria-label="Toggle colour scheme">
                  {scheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Container>
      </AppShell.Header>

      <AppShell.Main bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-8))">
        <Container size="xl" pb="xl" px={{ base: 0, sm: "md" }}>
          {session === undefined ? (
            <Center py={120}>
              <Loader type="dots" />
            </Center>
          ) : session ? (
            <HistoryPage />
          ) : (
            <Login />
          )}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
