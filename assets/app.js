const CONFIG = {
  dataUrl: "data/jogos.json",
  channelUrl: "https://www.youtube.com/@CazeTV",
  email: "danielberriel163@gmail.com",
  // Link do repositório público; o botão "Ver o código" só aparece se estiver preenchido.
  repoUrl: "https://github.com/DanielBerriel/vai-passar-na-caze",
};

const TZ = "America/Sao_Paulo";
const MATCH_MINUTES = 115;
// A finished match shows as "Encerrado" for a while, then leaves the page.
const HIDE_AFTER_MINUTES = 180;
const BADGE_PRIORITY = { "CLÁSSICO": 6, "DUELO DE GIGANTES": 5, "JOGAÇO": 4, "IMPERDÍVEL": 3, "VALE O PLAY": 1, "RODADA": 0 };
const COMPETITION_COLORS = {
  PD: "#ff5a4e", PL: "#b07cff", FL1: "#4dd9ff", BL1: "#ff9f43", SA: "#4d8dff",
  BSA: "#3ddc84", CL: "#8fa2ff", EL: "#ff7ab6", UECL: "#7cf0c5",
};

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v6.5A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V12"/></svg>',
};

const $ = (sel) => document.querySelector(sel);

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

const fmt = (options) => new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, ...options });
const timeFmt = fmt({ hour: "2-digit", minute: "2-digit" });
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
const weekdayFmt = fmt({ weekday: "long" });
const shortDateFmt = fmt({ day: "2-digit", month: "2-digit" });
const shortWeekdayFmt = fmt({ weekday: "short" });

const timeOf = (iso) => timeFmt.format(new Date(iso));
const dayKey = (date) => dayKeyFmt.format(date);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function dayLabel(iso, now) {
  const date = new Date(iso);
  const key = dayKey(date);
  const today = dayKey(now);
  const tomorrow = dayKey(new Date(now.getTime() + 86400000));
  const weekday = capitalize(weekdayFmt.format(date));
  const date2 = shortDateFmt.format(date);
  if (key === today || key === tomorrow) {
    return { key, title: key === today ? "Hoje" : "Amanhã", detail: `${weekday}, ${date2}` };
  }
  return { key, title: weekday, detail: date2 };
}

function shortDay(iso, now) {
  const { title } = dayLabel(iso, now);
  if (title === "Hoje" || title === "Amanhã") return title;
  return `${shortWeekdayFmt.format(new Date(iso)).replace(".", "")} ${shortDateFmt.format(new Date(iso))}`;
}

function relativeTime(iso, now = new Date()) {
  const diffMin = Math.round((Date.parse(iso) - now.getTime()) / 60000);
  const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, "minute");
  if (Math.abs(diffMin) < 48 * 60) return rtf.format(Math.round(diffMin / 60), "hour");
  return rtf.format(Math.round(diffMin / 1440), "day");
}

function hue(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
}

function initials(name) {
  const words = name.split(/[\s.-]+/).filter((w) => w && !/^(fc|cf|ac|sc|de|da|do|del|la|le)$/i.test(w));
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function crest(team) {
  const fallback = `<span class="crest is-initials" style="--h:${hue(team.name)}" aria-hidden="true">${esc(initials(team.name))}</span>`;
  if (!team.crest) return fallback;
  return `<span class="crest" data-initials="${esc(initials(team.name))}" data-h="${hue(team.name)}"><img src="${esc(team.crest)}" alt="" loading="lazy" decoding="async"></span>`;
}

// Broken crest URL -> initials badge (error events don't bubble, so capture).
document.addEventListener(
  "error",
  (event) => {
    const img = event.target;
    if (!(img instanceof HTMLImageElement) || !img.parentElement?.classList.contains("crest")) return;
    const holder = img.parentElement;
    holder.classList.add("is-initials");
    holder.style.setProperty("--h", holder.dataset.h);
    holder.textContent = holder.dataset.initials;
  },
  true,
);

function competitionColor(comp) {
  return COMPETITION_COLORS[comp.code] ?? `hsl(${hue(comp.name)} 70% 65%)`;
}

/** "live" | "done" | "off" | "upcoming", from API status when known, else from the clock. */
function matchState(b, now) {
  if (b.status === "IN_PLAY" || b.status === "PAUSED") return "live";
  if (b.status === "FINISHED" || b.status === "AWARDED") return "done";
  if (b.status === "POSTPONED" || b.status === "CANCELLED" || b.status === "SUSPENDED") return "off";
  const start = Date.parse(b.kickoff);
  if (now.getTime() < start) return "upcoming";
  if (now.getTime() < start + MATCH_MINUTES * 60000) return "live";
  return "done";
}

function calendarUrl(b) {
  const start = new Date(b.kickoff);
  const end = new Date(start.getTime() + MATCH_MINUTES * 60000);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `${b.home.name} x ${b.away.name} na CazéTV`,
    dates: `${stamp(start)}/${stamp(end)}`,
    details: `${b.copy.text}\n\nAo vivo e de graça: ${CONFIG.channelUrl}`,
    location: CONFIG.channelUrl,
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function whatsappUrl(b, now) {
  const when = `${shortDay(b.kickoff, now).toLowerCase()} às ${timeOf(b.kickoff)}`;
  const text = `${b.home.name} x ${b.away.name} vai passar na Cazé, ${when}, de graça no YouTube! ${location.href.split("#")[0]}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function actions(b, now, { compact = false } = {}) {
  const watch = `<a class="btn btn-primary ${compact ? "btn-sm" : ""}" href="${CONFIG.channelUrl}" target="_blank" rel="noopener">${ICONS.play}${compact ? "Assistir" : "Assistir na CazéTV"}</a>`;
  if (matchState(b, now) !== "upcoming") return watch;
  const label = `${b.home.name} x ${b.away.name}`;
  return `${watch}
    <a class="btn btn-ghost ${compact ? "btn-sm btn-collapsible" : ""}" href="${esc(calendarUrl(b))}" target="_blank" rel="noopener" aria-label="Adicionar ${esc(label)} à agenda" title="Adicionar à agenda">${ICONS.calendar}<span class="btn-label">Me lembra</span></a>
    <a class="btn btn-ghost ${compact ? "btn-sm btn-icon" : ""}" href="${esc(whatsappUrl(b, now))}" target="_blank" rel="noopener" aria-label="Compartilhar ${esc(label)} no WhatsApp" title="Compartilhar no WhatsApp">${ICONS.share}${compact ? "" : "Chamar a galera"}</a>`;
}

// ---------- Featured ----------

function pickFeatured(list, now) {
  const live = list.find((b) => matchState(b, now) === "live");
  if (live) return { b: live, label: "Ao vivo agora", live: true };
  const upcoming = list.filter((b) => matchState(b, now) === "upcoming");
  if (!upcoming.length) return null;
  const priority = (b) => BADGE_PRIORITY[b.copy.badge] ?? 0;
  const best = upcoming.reduce((top, b) => (priority(b) > priority(top) ? b : top));
  const standsOut = priority(best) > priority(upcoming[0]);
  return { b: best, label: standsOut ? "Destaque da semana" : "Próximo jogo", live: false };
}

function countdownCells(target, now) {
  let s = Math.max(0, Math.floor((Date.parse(target) - now.getTime()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const pad = (n) => String(n).padStart(2, "0");
  return [[d, "dias"], [pad(h), "horas"], [pad(m), "min"], [pad(s), "seg"]]
    .map(([v, l]) => `<span class="countdown-cell"><b>${v}</b><small>${l}</small></span>`)
    .join("");
}

function renderFeatured(list, now) {
  const el = $("#featured");
  const pick = pickFeatured(list, now);
  if (!pick) {
    el.innerHTML = `<div class="empty"><strong>Intervalo na agenda</strong>Nenhum jogo da Cazé confirmado nos próximos dias. O robô confere de novo amanhã cedo.</div>`;
    return;
  }
  const { b, label, live } = pick;
  const hasScore = b.score.home !== null && b.score.away !== null;
  const mid = live && hasScore
    ? `<span class="versus-score">${b.score.home}–${b.score.away}</span>`
    : `<span class="versus-time">${timeOf(b.kickoff)}</span><span class="versus-day">${esc(shortDay(b.kickoff, now))}</span>`;

  el.innerHTML = `
    <div class="featured-top">
      <span class="featured-label ${live ? "is-live" : ""}">${live ? '<span class="dot-live" style="background:#fff"></span>' : ""}${esc(label)}</span>
      <span class="featured-comp">${esc(b.competition.name)}${b.stage ? ` · ${esc(b.stage)}` : ""}</span>
    </div>
    <div class="versus">
      <div class="versus-team">${crest(b.home)}<span class="versus-name">${esc(b.home.name)}</span></div>
      <div class="versus-mid">${mid}</div>
      <div class="versus-team">${crest(b.away)}<span class="versus-name">${esc(b.away.name)}</span></div>
    </div>
    ${live ? "" : `<div class="countdown" data-countdown="${esc(b.kickoff)}" aria-label="Contagem regressiva para o início">${countdownCells(b.kickoff, now)}</div>`}
    <p class="featured-copy">${esc(b.copy.text)}</p>
    <div class="featured-actions">${actions(b, now)}</div>`;
}

// ---------- Agenda ----------

// The agenda opens short so the rest of the page stays within reach.
const COLLAPSED_COUNT = 8;
let activeFilter = "all";
let expanded = false;

function renderFilters(list) {
  const counts = new Map();
  for (const b of list) {
    const entry = counts.get(b.competition.name) ?? { n: 0, color: competitionColor(b.competition) };
    entry.n++;
    counts.set(b.competition.name, entry);
  }
  const chips = [["all", { n: list.length, color: null }], ...[...counts].sort((a, b) => b[1].n - a[1].n)];
  $("#filters").innerHTML = chips
    .map(([name, { n, color }]) => `
      <button class="chip" type="button" data-filter="${esc(name)}" aria-pressed="${name === activeFilter}">
        ${color ? `<span class="chip-dot" style="--c:${color}"></span>` : ""}${name === "all" ? "Todos" : esc(name)}
        <span class="chip-count">${n}</span>
      </button>`)
    .join("");
}

function matchCard(b, now) {
  const state = matchState(b, now);
  const hasScore = b.score.home !== null && b.score.away !== null && state !== "upcoming";
  const badge =
    state === "live" ? '<span class="badge is-live">Ao vivo</span>'
    : state === "done" ? '<span class="badge is-done">Encerrado</span>'
    : state === "off" ? '<span class="badge is-done">Adiado</span>'
    : `<span class="badge">${esc(b.copy.badge)}</span>`;
  const team = (t, score) => `
    <div class="team-row">${crest(t)}<span class="team-name">${esc(t.name)}</span>${hasScore ? `<span class="team-score">${score}</span>` : ""}</div>`;

  return `
    <article class="match ${state === "live" ? "is-live" : ""} ${state === "done" || state === "off" ? "is-done" : ""}" style="--c:${competitionColor(b.competition)}">
      <div class="match-time"><b>${timeOf(b.kickoff)}</b><small>${state === "live" ? "agora" : "Brasília"}</small></div>
      <div>
        <div class="match-meta">
          <span class="match-comp"><strong>${esc(b.competition.name)}</strong>${b.stage ? ` · ${esc(b.stage)}` : ""}</span>
          ${badge}
        </div>
        <div class="match-teams">${team(b.home, b.score.home)}${team(b.away, b.score.away)}</div>
        <p class="match-copy">${esc(b.copy.text)}</p>
        <div class="match-actions">${actions(b, now, { compact: true })}</div>
      </div>
    </article>`;
}

function renderAgenda(list, now) {
  const filtered = list.filter((b) => activeFilter === "all" || b.competition.name === activeFilter);
  const el = $("#agenda-list");
  if (!filtered.length) {
    el.innerHTML = `<div class="empty"><strong>Sem jogos por aqui</strong>Nada desta competição na agenda dos próximos dias.</div>`;
    return;
  }
  const collapse = !expanded && activeFilter === "all" && filtered.length > COLLAPSED_COUNT + 2;
  const visible = collapse ? filtered.slice(0, COLLAPSED_COUNT) : filtered;
  const days = new Map();
  for (const b of visible) {
    const label = dayLabel(b.kickoff, now);
    if (!days.has(label.key)) days.set(label.key, { label, items: [] });
    days.get(label.key).items.push(b);
  }
  el.innerHTML = [...days.values()]
    .map(({ label, items }) => `
      <section class="day" aria-label="${esc(`${label.title}, ${label.detail}`)}">
        <h3 class="day-title">${esc(label.title)} <small>${esc(label.detail)} · ${items.length} ${items.length === 1 ? "jogo" : "jogos"}</small></h3>
        <div class="match-grid">${items.map((b) => matchCard(b, now)).join("")}</div>
      </section>`)
    .join("") +
    (collapse
      ? `<div class="agenda-more"><button class="btn btn-ghost" type="button" data-expand>Ver a agenda completa · ${filtered.length} jogos</button></div>`
      : "");
}

// ---------- Hero stats & pipeline ----------

function renderStats(list, now) {
  const upcoming = list.filter((b) => matchState(b, now) !== "done");
  const competitions = new Set(list.map((b) => b.competition.name)).size;
  $("#hero-stats").innerHTML = `
    <li><strong>${upcoming.length}</strong><span>jogos na agenda</span></li>
    <li><strong>${competitions}</strong><span>competições</span></li>
    <li><strong>R$ 0</strong><span>pra assistir</span></li>`;
}

function renderPipeline(data, now) {
  const s = data.stats;
  const warn = (text) => `<span class="is-warn">${text}</span>`;
  const fixtures = {
    ok: `${s.apiMatchesRead} partidas lidas na API`,
    fixture: warn("rodando com dados de exemplo"),
    "sem-token": warn("aguardando chave da API · guia assumiu"),
    erro: warn("API fora do ar na última execução · guia assumiu"),
  }[data.sources.fixtures.status];

  const metrics = {
    fixtures,
    guide: `${s.guidePagesRead} páginas · ${s.leaguesScanned} campeonatos · ${s.guideMatchesRead} jogos lidos`,
    reconcile: s.apiMatchesRead
      ? `${s.reconciled} de ${s.cazetvBroadcasts} transmissões confirmadas nas duas fontes`
      : `${s.cazetvBroadcasts} transmissões da CazéTV encontradas`,
    copy: s.copyByClaude
      ? `${s.copyByClaude} de ${s.cazetvBroadcasts} chamadas escritas pelo Claude`
      : warn("chamadas de template · IA aguardando chave"),
    publish: `última execução ${relativeTime(data.generatedAt, now)}`,
  };
  for (const [key, html] of Object.entries(metrics)) {
    const el = document.querySelector(`[data-metric="${key}"]`);
    if (el) el.innerHTML = html;
  }
  $("#updated-at").textContent = `atualizado ${relativeTime(data.generatedAt, now)}`;
}

// ---------- Contact ----------

function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("is-visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("is-visible"), 2200);
}

function setupContact() {
  const subject = encodeURIComponent("Vi o Vai Passar na Cazé");
  for (const el of [$("#contact-email"), $("#mailto-btn")]) el.href = `mailto:${CONFIG.email}?subject=${subject}`;
  $("#copy-email").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(CONFIG.email);
      toast("E-mail copiado!");
    } catch {
      toast(CONFIG.email);
    }
  });
  if (CONFIG.repoUrl) {
    const link = $("#repo-link");
    link.href = CONFIG.repoUrl;
    link.hidden = false;
  }
}

// ---------- Boot ----------

async function main() {
  setupContact();
  let data;
  try {
    const res = await fetch(CONFIG.dataUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    console.error("Falha ao carregar a agenda:", err);
    $("#featured").innerHTML = `<div class="empty"><strong>Não consegui carregar a agenda</strong>Abra a página por um servidor (ex.: <code>npm run dev</code>) em vez do arquivo direto.</div>`;
    $("#agenda-list").innerHTML = "";
    $("#hero-stats").innerHTML = "";
    $("#updated-at").textContent = "sem dados";
    return;
  }

  // The data is refreshed once a day; everything time-based is decided here.
  const onAir = (now) => data.broadcasts.filter((b) => Date.parse(b.kickoff) + HIDE_AFTER_MINUTES * 60000 > now.getTime());
  const render = () => {
    const now = new Date();
    const list = onAir(now);
    renderStats(list, now);
    renderFeatured(list, now);
    renderAgenda(list, now);
    renderPipeline(data, now);
  };

  renderFilters(onAir(new Date()));
  render();
  // The agenda renders after load and shifts the page; land deep links where they point.
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();

  $("#filters").addEventListener("click", (event) => {
    const chip = event.target.closest(".chip");
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    for (const c of document.querySelectorAll(".chip")) c.setAttribute("aria-pressed", String(c === chip));
    const now = new Date();
    renderAgenda(onAir(now), now);
  });

  $("#agenda-list").addEventListener("click", (event) => {
    if (!event.target.closest("[data-expand]")) return;
    expanded = true;
    const now = new Date();
    renderAgenda(onAir(now), now);
  });

  setInterval(() => {
    const now = new Date();
    const countdown = document.querySelector("[data-countdown]");
    if (!countdown) return;
    if (Date.parse(countdown.dataset.countdown) <= now.getTime()) render();
    else countdown.innerHTML = countdownCells(countdown.dataset.countdown, now);
  }, 1000);
  setInterval(render, 60000);
}

main();
