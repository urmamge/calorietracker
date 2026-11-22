import { useEffect, useState } from "react";
import {
  ActionIcon,
  AppShell,
  Box,
  Button,
  Center,
  Container,
  Group,
  Loader,
  SegmentedControl,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useLocalStorage } from "@mantine/hooks";
import { IconLogout, IconMoon, IconSalad, IconSun } from "@tabler/icons-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase.ts";
import { HistoryPage } from "./HistoryPage.tsx";
import { DayView } from "./components/DayView.tsx";
import { todayIso } from "./format.ts";
import { Login } from "./Login.tsx";

type View = "log" | "history";

const VIEWS = [
  { value: "log", label: "Food log" },
  { value: "history", label: "History & averages" },
];

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [view, setView] = useLocalStorage<View>({ key: "ndt-view", defaultValue: "log" });
  const [date, setDate] = useState(todayIso);
  const [logVersion, setLogVersion] = useState(0);
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
                  Search foods · Log portions · Review your history
                </Text>
              </div>
            </Group>
            <Group gap="sm" wrap="nowrap">
              {session && (
                <>
                  <SegmentedControl value={view} onChange={(v) => setView(v as View)} data={VIEWS} visibleFrom="md" />
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
            <>
              <SegmentedControl value={view} onChange={(v) => setView(v as View)} data={VIEWS} fullWidth hiddenFrom="md" mb="md" />
              {/* Both views stay mounted so search results survive switching tabs. */}
              <Box display={view === "log" ? undefined : "none"}>
                <DayView date={date} onDateChange={setDate} onLogChanged={() => setLogVersion((v) => v + 1)} />
              </Box>
              <Box display={view === "history" ? undefined : "none"}>
                <HistoryPage
                  logVersion={logVersion}
                  onOpenDay={(d) => {
                    setDate(d);
                    setView("log");
                    window.scrollTo({ top: 0 });
                  }}
                />
              </Box>
            </>
          ) : (
            <Login />
          )}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
