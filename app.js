const { createClient } = supabase;
const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const loginPanel = document.querySelector("#login-panel");
const historyPanel = document.querySelector("#history-panel");
const loginForm = document.querySelector("#login-form");
const loginError = document.querySelector("#login-error");
const signOutButton = document.querySelector("#sign-out");
const statusText = document.querySelector("#status");
const historyList = document.querySelector("#history-list");
const weeksInput = document.querySelector("#weeks");
const endDateInput = document.querySelector("#end-date");
const periodLabel = document.querySelector("#period-label");
const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

function localISO(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localISO(date);
}

function showSignedIn(isSignedIn) {
  loginPanel.classList.toggle("hidden", isSignedIn);
  historyPanel.classList.toggle("hidden", !isSignedIn);
  signOutButton.classList.toggle("hidden", !isSignedIn);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const submit = loginForm.querySelector("button");
  submit.disabled = true;
  submit.textContent = "Signing in…";
  const form = new FormData(loginForm);
  const { error } = await client.auth.signInWithPassword({
    email: form.get("email"),
    password: form.get("password"),
  });
  submit.disabled = false;
  submit.textContent = "Sign in";
  if (error) {
    loginError.textContent = error.message;
    return;
  }
  showSignedIn(true);
  await loadHistory();
});

signOutButton.addEventListener("click", async () => {
  statusText.textContent = "Signing out…";
  const { error } = await client.auth.signOut();
  if (error) {
    statusText.textContent = `Could not sign out: ${error.message}`;
    return;
  }
  showSignedIn(false);
});

document.querySelector("#refresh").addEventListener("click", loadHistory);
weeksInput.addEventListener("change", loadHistory);
endDateInput.addEventListener("change", loadHistory);

function showAverage(id, total, count, suffix, formatter = oneDecimal) {
  document.querySelector(id).textContent = count
    ? `${formatter.format(total / count)} ${suffix}`
    : "—";
}

function renderRows(daily, start, end, dayCount) {
  historyList.replaceChildren();
  if (!dayCount) {
    historyList.innerHTML = '<p class="empty">No tracked days in this period.</p>';
    return;
  }
  const labels = document.createElement("div");
  labels.className = "list-labels";
  labels.innerHTML = "<span>Date</span><span>kcal</span><span>Protein</span><span>Carbs</span><span>Fat</span>";
  historyList.append(labels);
  for (let offset = 0; offset < dayCount; offset += 1) {
    const date = addDays(end, -offset);
    if (date < start) break;
    const row = daily.get(date) || { calories: 0, protein: 0, carbs: 0, fat: 0 };
    const element = document.createElement("div");
    element.className = "day-row";
    const dateCell = document.createElement("div");
    dateCell.className = "day-date";
    dateCell.textContent = date;
    element.append(dateCell);
    for (const [key, suffix] of [["calories", "kcal"], ["protein", "g"], ["carbs", "g"], ["fat", "g"]]) {
      const cell = document.createElement("div");
      cell.className = "day-value";
      cell.textContent = `${oneDecimal.format(row[key])}`;
      const unit = document.createElement("span");
      unit.textContent = suffix;
      cell.append(unit);
      element.append(cell);
    }
    historyList.append(element);
  }
}

async function fetchAllEntries(start, end) {
  const all = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client
      .from("nutrition_entries")
      .select("date,food_name,grams,calories,protein,carbs,fat")
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < pageSize) return all;
  }
}

async function loadHistory() {
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError) {
    statusText.textContent = `Could not check sign-in: ${sessionError.message}`;
    return;
  }
  if (!session) {
    showSignedIn(false);
    return;
  }
  const weeks = Number(weeksInput.value);
  const end = endDateInput.value || localISO(new Date());
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 104 || !end) {
    statusText.textContent = "Choose a valid period and end date.";
    return;
  }
  endDateInput.value = end;
  const requestedStart = addDays(end, -(weeks * 7 - 1));
  statusText.textContent = "Loading your history…";
  document.querySelector("#refresh").disabled = true;
  try {
    const { data: firstEntry, error: firstError } = await client
      .from("nutrition_entries")
      .select("date")
      .order("date", { ascending: true })
      .limit(1);
    if (firstError) throw firstError;
    if (!firstEntry.length || firstEntry[0].date > end) {
      for (const id of ["#avg-calories", "#avg-protein", "#avg-carbs", "#avg-fat"]) {
        document.querySelector(id).textContent = "—";
      }
      periodLabel.textContent = "No tracked days in this period";
      statusText.textContent = "";
      renderRows(new Map(), requestedStart, end, 0);
      return;
    }
    const start = firstEntry[0].date > requestedStart ? firstEntry[0].date : requestedStart;
    const dayCount = Math.max(0, Math.round((new Date(`${end}T12:00:00`) - new Date(`${start}T12:00:00`)) / 86400000) + 1);
    const entries = await fetchAllEntries(start, end);
    const daily = new Map();
    for (const entry of entries) {
      const totals = daily.get(entry.date) || { calories: 0, protein: 0, carbs: 0, fat: 0, entries: 0 };
      for (const key of ["calories", "protein", "carbs", "fat"]) totals[key] += Number(entry[key]) || 0;
      totals.entries += 1;
      daily.set(entry.date, totals);
    }
    const totals = [...daily.values()].reduce((sum, row) => {
      for (const key of ["calories", "protein", "carbs", "fat"]) sum[key] += row[key];
      return sum;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
    showAverage("#avg-calories", totals.calories, dayCount, "kcal", numberFormat);
    showAverage("#avg-protein", totals.protein, dayCount, "g");
    showAverage("#avg-carbs", totals.carbs, dayCount, "g");
    showAverage("#avg-fat", totals.fat, dayCount, "g");
    periodLabel.textContent = `${start} to ${end} · ${dayCount} days`;
    statusText.textContent = `${entries.length} food ${entries.length === 1 ? "entry" : "entries"} loaded.`;
    renderRows(daily, start, end, dayCount);
  } catch (error) {
    statusText.textContent = `Could not load history: ${error.message}`;
  } finally {
    document.querySelector("#refresh").disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  endDateInput.value = localISO(new Date());
  const { data: { session } } = await client.auth.getSession();
  showSignedIn(Boolean(session));
  if (session) await loadHistory();
});
