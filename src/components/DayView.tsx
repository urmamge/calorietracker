import { useCallback, useEffect, useRef, useState } from "react";
import { ActionIcon, Box, Button, Grid, Group, Stack, Title, Tooltip } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { DatePickerInput } from "@mantine/dates";
import { IconCalendar, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { dayLabel, type Food, notifyError, type Nutrients, shiftDate, todayIso } from "../format.ts";
import { fetchEntries } from "../supabase.ts";
import { AddToLog } from "./AddToLog.tsx";
import { DaySummary } from "./DaySummary.tsx";
import { FoodFinder } from "./FoodFinder.tsx";
import { type DayLog, FoodLog } from "./FoodLog.tsx";

async function loadDay(date: string): Promise<DayLog> {
  const entries = await fetchEntries(date, date);
  const totals: Nutrients = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) for (const k of Object.keys(totals) as (keyof Nutrients)[]) totals[k] += Number(e[k]) || 0;
  return { date, entries, totals };
}

interface Props {
  date: string;
  onDateChange: (date: string) => void;
  onLogChanged: () => void;
}

export function DayView({ date, onDateChange, onLogChanged }: Props) {
  const [day, setDay] = useState<DayLog | null>(null);
  const [selected, setSelected] = useState<Food | null>(null);

  const addRef = useRef<HTMLDivElement>(null);
  const stacked = useMediaQuery("(max-width: 62em)");
  const latestDate = useRef(date);

  const load = useCallback(() => {
    latestDate.current = date;
    loadDay(date).then(
      (d) => latestDate.current === d.date && setDay(d),
      (e) => notifyError(e, "Could not load the food log"),
    );
  }, [date]);
  useEffect(load, [load]);

  // On phones the portion form sits below the results, so bring it into view when a food is picked.
  const select = (food: Food) => {
    setSelected(food);
    if (stacked) requestAnimationFrame(() => addRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const changed = () => {
    load();
    onLogChanged();
  };

  const isToday = date === todayIso();

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>{dayLabel(date)}</Title>
        <Group gap="xs">
          <Tooltip label="Previous day">
            <ActionIcon variant="default" size="lg" onClick={() => onDateChange(shiftDate(date, -1))} aria-label="Previous day">
              <IconChevronLeft size={18} />
            </ActionIcon>
          </Tooltip>
          <DatePickerInput
            value={date}
            onChange={(v) => v && onDateChange(v)}
            valueFormat="ddd D MMM YYYY"
            leftSection={<IconCalendar size={16} />}
            w={{ base: 150, xs: 190 }}
          />
          <Tooltip label="Next day">
            <ActionIcon variant="default" size="lg" onClick={() => onDateChange(shiftDate(date, 1))} aria-label="Next day">
              <IconChevronRight size={18} />
            </ActionIcon>
          </Tooltip>
          <Button variant="light" disabled={isToday} onClick={() => onDateChange(todayIso())}>
            Today
          </Button>
        </Group>
      </Group>

      <DaySummary day={day} />

      <Grid gap="lg" align="flex-start">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <FoodFinder selected={selected} onSelect={select} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="lg">
            <Box ref={addRef} style={{ scrollMarginTop: 80 }}>
              <AddToLog food={selected} date={date} onAdded={changed} />
            </Box>
            <FoodLog day={day} onRemoved={changed} />
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
