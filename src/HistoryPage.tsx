import { useEffect, useMemo, useState } from "react";
import { Alert, Box, Button, Group, NumberInput, Paper, ScrollArea, SimpleGrid, Stack, Table, Text, Title } from "@mantine/core";
import { BarChart } from "@mantine/charts";
import { DatePickerInput } from "@mantine/dates";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconCalendar, IconDownload, IconRefresh } from "@tabler/icons-react";
import dayjs from "dayjs";
import { fetchEntries, firstEntryDate, type Entry } from "./supabase.ts";
import { fmtG, fmtKcal, MACROS, type Nutrients, shiftDate, todayIso } from "./format.ts";

interface Day extends Nutrients {
  date: string;
  foods: Entry[];
}

interface History {
  start: string | null;
  end: string;
  days: Day[];
  averages: Nutrients | null;
}

// Same rules as the desktop app: days before the first entry are excluded, later empty days count as 0.
async function loadHistory(weeks: number, end: string): Promise<History> {
  const first = await firstEntryDate();
  let start = shiftDate(end, -(weeks * 7 - 1));
  if (first && first > start) start = first;
  if (!first || start > end) return { start: null, end, days: [], averages: null };

  const byDate = new Map<string, Entry[]>();
  for (const e of await fetchEntries(start, end)) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e]);

  const days: Day[] = [];
  for (let d = end; d >= start; d = shiftDate(d, -1)) {
    const foods = byDate.get(d) ?? [];
    const sum = (k: keyof Nutrients) => foods.reduce((s, f) => s + (Number(f[k]) || 0), 0);
    days.push({ date: d, foods, calories: sum("calories"), protein: sum("protein"), carbs: sum("carbs"), fat: sum("fat") });
  }
  const avg = (k: keyof Nutrients) => days.reduce((s, d) => s + d[k], 0) / days.length;
  return { start, end, days, averages: { calories: avg("calories"), protein: avg("protein"), carbs: avg("carbs"), fat: avg("fat") } };
}

function csvCell(value: unknown): string {
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exportCsv() {
  const entries = (await fetchEntries()).reverse();
  const lines = [["Date", "Food", "Weight (g)", "Calories (kcal)", "Protein (g)", "Carbs (g)", "Fat (g)"]];
  for (const e of entries) lines.push([e.date, e.food_name, e.grams, e.calories, e.protein, e.carbs, e.fat].map(String));
  const blob = new Blob(["﻿" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n") + "\r\n"], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "calorie-history.csv" });
  a.click();
  URL.revokeObjectURL(a.href);
}

export function HistoryPage() {
  const [weeks, setWeeks] = useState<number | string>(4);
  const [end, setEnd] = useState(todayIso);
  const [debouncedWeeks] = useDebouncedValue(weeks, 300);
  const [history, setHistory] = useState<History | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [exporting, setExporting] = useState(false);

  const weeksValue = Number(debouncedWeeks);
  const validWeeks = Number.isInteger(weeksValue) && weeksValue >= 1 && weeksValue <= 104;

  useEffect(() => {
    if (!validWeeks) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadHistory(weeksValue, end)
      .then((h) => !cancelled && setHistory(h))
      .catch((e) => !cancelled && setError(`Could not load history: ${e.message ?? e}`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [weeksValue, validWeeks, end, reload]);

  const chartData = useMemo(
    () => [...(history?.days ?? [])].reverse().map((d) => ({ day: dayjs(d.date).format("D MMM"), calories: Math.round(d.calories) })),
    [history],
  );
  const avg = history?.averages;

  const openDay = (day: Day) =>
    modals.open({
      title: <Text fw={700}>{dayjs(day.date).format("dddd D MMMM YYYY")}</Text>,
      radius: "lg",
      centered: true,
      children: <DayFoods day={day} />,
    });

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>History & averages</Title>
          <Text c="dimmed" size="sm">
            {history?.start
              ? `${dayjs(history.start).format("D MMM YYYY")} – ${dayjs(history.end).format("D MMM YYYY")} · ${history.days.length} days`
              : loading
                ? "Loading your history…"
                : "No tracked days in this period"}
          </Text>
        </div>
        <Group gap="sm" align="flex-end">
          <NumberInput
            label="Period"
            suffix=" weeks"
            min={1}
            max={104}
            allowDecimal={false}
            clampBehavior="strict"
            value={weeks}
            onChange={setWeeks}
            w={130}
          />
          <DatePickerInput
            label="Ending on"
            value={end}
            onChange={(v) => v && setEnd(v)}
            valueFormat="D MMM YYYY"
            leftSection={<IconCalendar size={16} />}
            w={170}
          />
          <Button variant="default" leftSection={<IconRefresh size={16} />} loading={loading} onClick={() => setReload((r) => r + 1)}>
            Refresh
          </Button>
          <Button
            variant="default"
            leftSection={<IconDownload size={16} />}
            loading={exporting}
            onClick={() => {
              setExporting(true);
              exportCsv()
                .catch((e) => setError(`Could not export: ${e.message ?? e}`))
                .finally(() => setExporting(false));
            }}
          >
            Export CSV
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
        <AverageCard label="Avg calories / day" value={avg ? fmtKcal(avg.calories) : "—"} unit="kcal" color="violet" />
        {MACROS.map((m) => (
          <AverageCard key={m.key} label={`Avg ${m.label.toLowerCase()} / day`} value={avg ? fmtG(avg[m.key]) : "—"} unit="g" color={m.color} />
        ))}
      </SimpleGrid>

      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Title order={4} mb="md">
          Daily calories
        </Title>
        {chartData.length ? (
          <BarChart
            h={260}
            data={chartData}
            dataKey="day"
            series={[{ name: "calories", label: "Calories", color: "violet.6" }]}
            valueFormatter={fmtKcal}
            unit=" kcal"
            yAxisProps={{ width: 70 }}
            referenceLines={
              avg ? [{ y: Math.round(avg.calories), label: `Average ${fmtKcal(avg.calories)} kcal`, color: "gray.6", labelPosition: "insideTopRight" }] : []
            }
            gridAxis="y"
            tickLine="none"
            barProps={{ radius: [4, 4, 0, 0] }}
            maxBarWidth={36}
          />
        ) : (
          <Text c="dimmed" ta="center" py="xl">
            {loading ? "Loading…" : "Log some food in the desktop app to see your history here."}
          </Text>
        )}
      </Paper>

      <Paper withBorder radius="lg" p="lg" shadow="xs">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Daily totals</Title>
          <Text size="xs" c="dimmed">
            Tap a day to see what you ate
          </Text>
        </Group>
        <ScrollArea.Autosize mah={480} type="auto" offsetScrollbars>
          <Table stickyHeader verticalSpacing={8} fz="sm" miw={520}>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th ta="right">Calories</Table.Th>
                {MACROS.map((m) => (
                  <Table.Th key={m.key} ta="right">
                    {m.label} (g)
                  </Table.Th>
                ))}
                <Table.Th ta="right">Foods</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {history?.days.map((d) => (
                <Table.Tr key={d.date} className="clickable-row" onClick={() => openDay(d)} c={d.foods.length ? undefined : "dimmed"}>
                  <Table.Td fw={500}>{dayjs(d.date).format("ddd D MMM YYYY")}</Table.Td>
                  <Table.Td ta="right" fw={600}>
                    {fmtKcal(d.calories)}
                  </Table.Td>
                  {MACROS.map((m) => (
                    <Table.Td key={m.key} ta="right">
                      {fmtG(d[m.key])}
                    </Table.Td>
                  ))}
                  <Table.Td ta="right">{d.foods.length}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
        <Text size="xs" c="dimmed" mt="sm">
          Averages are per calendar day. Days before your first food entry are excluded; later days with nothing logged count
          as 0 kcal.
        </Text>
      </Paper>
    </Stack>
  );
}

function DayFoods({ day }: { day: Day }) {
  if (!day.foods.length) {
    return (
      <Text c="dimmed" size="sm" ta="center" py="md">
        Nothing logged for this day.
      </Text>
    );
  }
  return (
    <Stack gap={0}>
      {day.foods.map((e, i) => (
        <Box key={i} className="log-item" py="sm">
          <Group justify="space-between" wrap="nowrap" gap="sm">
            <Box miw={0}>
              <Text fw={500} lineClamp={1}>
                {e.food_name}
              </Text>
              <Group gap="xs" mt={2}>
                <Text size="xs" c="dimmed">
                  {fmtG(e.grams)} g
                </Text>
                {MACROS.map((m) => (
                  <Text key={m.key} size="xs" c={`${m.color}.7`}>
                    {m.label[0]} {fmtG(e[m.key])}
                  </Text>
                ))}
              </Group>
            </Box>
            <Text fw={700} style={{ whiteSpace: "nowrap" }}>
              {fmtKcal(e.calories)}{" "}
              <Text span size="xs" c="dimmed" fw={500}>
                kcal
              </Text>
            </Text>
          </Group>
        </Box>
      ))}
      <Group justify="space-between" pt="sm">
        <Text fw={600}>Total</Text>
        <Text fw={700} c="violet">
          {fmtKcal(day.calories)} kcal
        </Text>
      </Group>
    </Stack>
  );
}

function AverageCard({ label, value, unit, color }: { label: string; value: string; unit: string; color: string }) {
  return (
    <Paper withBorder radius="lg" p="md" shadow="xs" style={{ borderTop: `3px solid var(--mantine-color-${color}-6)` }}>
      <Text size="sm" c="dimmed" fw={500}>
        {label}
      </Text>
      <Group gap={4} align="baseline" mt={4}>
        <Text fz={28} fw={700} lh={1.1}>
          {value}
        </Text>
        <Text size="sm" c="dimmed">
          {unit}
        </Text>
      </Group>
    </Paper>
  );
}
