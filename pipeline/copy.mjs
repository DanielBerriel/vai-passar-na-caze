// Marketing copy for each broadcast, in the channel's voice.
//
// Templates are picked per fixture, so a match keeps the same line across runs.

/** Stable key: same fixture -> same template across runs. */
function copyKey(m) {
  return [m.kickoff.slice(0, 10), m.home.name, m.away.name].join("|").toLowerCase();
}

function hash(s) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return h;
}

// No articles before team or competition names: Portuguese gender varies
// ("a Juventus", "o Milan", "a LaLiga", "o Brasileirão").
const TEMPLATES = [
  (m) => `${m.home.name} x ${m.away.name}, ${m.competition.name}. Bola rolando de graça, é só dar o play.`,
  (m) => `Separa o lanche: ${m.home.name} e ${m.away.name} se enfrentam e a Cazé transmite ao vivo.`,
  (m) => `Tem ${m.competition.name} na faixa! ${m.home.name} x ${m.away.name}, ao vivo no YouTube.`,
  (m) => `${m.home.name} recebe ${m.away.name} e você assiste com a gente, sem pagar nada.`,
  (m) => `Marca no calendário: ${m.home.name} x ${m.away.name}, ${m.competition.name} ao vivo na CazéTV.`,
];

export function templateCopy(m) {
  return {
    text: TEMPLATES[hash(copyKey(m)) % TEMPLATES.length](m),
    badge: "VALE O PLAY",
  };
}
