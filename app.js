const PREGUNTAS_POR_PARTIDA = 5;
const PAUSA_TRAS_RESPUESTA = 1600; // ms antes de pasar a la siguiente
const VOLVER_AL_INICIO = 25;       // segundos en la pantalla de resultado
const INACTIVIDAD_QUIZ = 90;       // segundos sin tocar nada en medio de una partida

const $ = (id) => document.getElementById(id);
const screens = { home: $("screen-home"), quiz: $("screen-quiz"), result: $("screen-result") };

let partida = null;
let timers = [];
let sonido = true;
// Preguntas de la última partida de cada carrera, para no repetirlas en la siguiente.
const ultimas = {};

/* ---------- utilidades ---------- */
function mezclar(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function elegirPreguntas(carrera) {
  const vistas = ultimas[carrera.id] || new Set();
  const frescas = carrera.preguntas.filter((p) => !vistas.has(p));
  const usadas = carrera.preguntas.filter((p) => vistas.has(p));
  const elegidas = mezclar(frescas).concat(mezclar(usadas)).slice(0, PREGUNTAS_POR_PARTIDA);
  ultimas[carrera.id] = new Set(elegidas);
  return elegidas.map((p) => ({ q: p.q, a: p.a, opciones: mezclar([p.a, ...p.w]) }));
}

function limpiarTimers() {
  timers.forEach(clearTimeout);
  timers.forEach(clearInterval);
  timers = [];
}

function mostrar(nombre) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[nombre].classList.add("active");
  window.scrollTo(0, 0);
}

/* ---------- sonido (sin archivos, con WebAudio) ---------- */
let audioCtx = null;
function tono(frecuencias, duracion = 0.12, tipo = "sine") {
  if (!sonido) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    frecuencias.forEach((f, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const t = audioCtx.currentTime + i * duracion;
      osc.type = tipo;
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + duracion + 0.02);
    });
  } catch (_) { /* sin audio, no pasa nada */ }
}
const sonidoOk = () => tono([660, 880], 0.11);
const sonidoMal = () => tono([220, 160], 0.16, "triangle");
const sonidoGanar = () => tono([523, 659, 784, 1047], 0.13);

/* ---------- pantalla de inicio ---------- */
function armarInicio() {
  const cont = $("careers");
  cont.innerHTML = "";
  CARRERAS.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "career";
    b.style.setProperty("--c", c.color);
    b.style.setProperty("--i", i);
    b.innerHTML = `
      <span class="career-emoji">${c.emoji}</span>
      <span>
        <div class="career-name">${c.nombre}</div>
        <div class="career-cta">Jugar →</div>
      </span>`;
    b.addEventListener("click", () => empezar(c));
    cont.appendChild(b);
  });
}

function irAlInicio() {
  limpiarTimers();
  partida = null;
  document.body.style.setProperty("--career", "#8E6CEF");
  mostrar("home");
}

/* ---------- partida ---------- */
function empezar(carrera) {
  limpiarTimers();
  partida = { carrera, preguntas: elegirPreguntas(carrera), i: 0, resultados: [], bloqueada: false };
  document.body.style.setProperty("--career", carrera.color);
  $("quizChip").textContent = `${carrera.emoji} ${carrera.nombre}`;
  mostrar("quiz");
  mostrarPregunta();
}

function pintarPuntos(cont, actual) {
  cont.innerHTML = "";
  for (let i = 0; i < PREGUNTAS_POR_PARTIDA; i++) {
    const d = document.createElement("span");
    d.className = "dot";
    const r = partida.resultados[i];
    if (r === true) d.classList.add("ok");
    else if (r === false) d.classList.add("bad");
    else if (i === actual) d.classList.add("current");
    cont.appendChild(d);
  }
}

function reiniciarInactividad() {
  limpiarTimers();
  timers.push(setTimeout(irAlInicio, INACTIVIDAD_QUIZ * 1000));
}

function mostrarPregunta() {
  const p = partida.preguntas[partida.i];
  partida.bloqueada = false;
  pintarPuntos($("dots"), partida.i);
  $("qCount").textContent = `Pregunta ${partida.i + 1} de ${PREGUNTAS_POR_PARTIDA}`;
  $("qText").textContent = p.q;
  $("feedback").textContent = "";
  $("feedback").className = "feedback";

  const cont = $("options");
  cont.innerHTML = "";
  p.opciones.forEach((texto, idx) => {
    const b = document.createElement("button");
    b.className = "option";
    b.innerHTML = `<span class="letter">${"ABCD"[idx]}</span><span></span>`;
    b.lastChild.textContent = texto;
    b.addEventListener("click", () => responder(b, texto));
    cont.appendChild(b);
  });

  const card = $("questionCard");
  card.classList.remove("swap");
  void card.offsetWidth; // reinicia la animación
  card.classList.add("swap");
  reiniciarInactividad();
}

const FRASES_OK = ["¡Correcto! 🎉", "¡Bien ahí! ✨", "¡Exacto! 🙌", "¡Muy bien! 🌟", "¡Eso! 💪"];

function responder(boton, texto) {
  if (!partida || partida.bloqueada) return;
  partida.bloqueada = true;
  const p = partida.preguntas[partida.i];
  const acierto = texto === p.a;
  partida.resultados.push(acierto);

  document.querySelectorAll(".option").forEach((b) => {
    b.disabled = true;
    const t = b.lastChild.textContent;
    if (t === p.a) b.classList.add("correct");
    else if (b === boton) b.classList.add("wrong");
    else b.classList.add("faded");
  });

  const fb = $("feedback");
  if (acierto) {
    fb.textContent = FRASES_OK[Math.floor(Math.random() * FRASES_OK.length)];
    fb.className = "feedback ok";
    sonidoOk();
  } else {
    fb.textContent = "Casi… la correcta está en verde 💚";
    fb.className = "feedback bad";
    sonidoMal();
  }
  pintarPuntos($("dots"), -1);

  limpiarTimers();
  timers.push(setTimeout(() => {
    partida.i++;
    if (partida.i < PREGUNTAS_POR_PARTIDA) mostrarPregunta();
    else terminar();
  }, PAUSA_TRAS_RESPUESTA));
}

/* ---------- resultado ---------- */
function terminar() {
  const aciertos = partida.resultados.filter(Boolean).length;
  const gano = aciertos === PREGUNTAS_POR_PARTIDA;
  const card = $("resultCard");
  card.classList.toggle("win", gano);

  if (gano) {
    $("resultEmoji").textContent = "🏆";
    $("resultTitle").textContent = "¡Felicitaciones!";
    $("resultMsg").textContent = `Respondiste todo perfecto. Se nota que la IA y ${partida.carrera.nombre} se llevan bien con vos.`;
    sonidoGanar();
    lanzarConfetti();
  } else {
    const msgs = {
      4: ["😮", "¡Uff, casi!", "Te faltó una sola. ¡La próxima sale!"],
      3: ["💪", "¡Buen intento!", "Vas muy bien encaminado/a. ¡Mejor suerte la próxima vez!"],
      2: ["🌱", "¡Buen intento!", "La IA también aprende practicando. ¡Mejor suerte la próxima vez!"],
      1: ["🌼", "¡Buen intento!", "Hoy sumaste algo nuevo. ¡Mejor suerte la próxima vez!"],
      0: ["🌸", "¡Gracias por jugar!", "Hoy no fue el día, pero ya sabés un poco más de IA. ¡Probá de nuevo!"],
    };
    const [emoji, titulo, msg] = msgs[aciertos];
    $("resultEmoji").textContent = emoji;
    $("resultTitle").textContent = titulo;
    $("resultMsg").textContent = msg;
  }
  $("resultScore").textContent = `${aciertos} de ${PREGUNTAS_POR_PARTIDA} correctas`;
  pintarPuntos($("resultDots"), -1);
  mostrar("result");

  limpiarTimers();
  let restante = VOLVER_AL_INICIO;
  const tick = () => { $("autoReturn").textContent = `Volvemos al inicio en ${restante}s`; };
  tick();
  timers.push(setInterval(() => {
    restante--;
    if (restante <= 0) irAlInicio();
    else tick();
  }, 1000));
}

/* ---------- confetti ---------- */
function lanzarConfetti() {
  const canvas = $("confetti");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const colores = ["#FF7AA8", "#8E6CEF", "#FFD36E", "#3BB273", "#2F9BD7", "#FF8A5B"];
  const piezas = Array.from({ length: 180 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 200,
    y: innerHeight * 0.45,
    vx: (Math.random() - 0.5) * 16,
    vy: -Math.random() * 16 - 6,
    r: Math.random() * 6 + 4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    c: colores[Math.floor(Math.random() * colores.length)],
  }));
  const inicio = performance.now();
  function frame(t) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    piezas.forEach((p) => {
      p.vy += 0.35; p.vx *= 0.99;
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.6);
      ctx.restore();
    });
    if (t - inicio < 4500) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  }
  requestAnimationFrame(frame);
}

/* ---------- pétalos de fondo ---------- */
function armarPetalos() {
  const cont = document.querySelector(".petals");
  const tipos = ["🌸", "🌼", "🌷", "🍃"];
  for (let i = 0; i < 16; i++) {
    const s = document.createElement("span");
    s.className = "petal";
    s.textContent = tipos[i % tipos.length];
    s.style.left = `${Math.random() * 100}%`;
    s.style.setProperty("--s", `${16 + Math.random() * 18}px`);
    s.style.setProperty("--d", `${12 + Math.random() * 14}s`);
    s.style.setProperty("--delay", `${-Math.random() * 20}s`);
    s.style.setProperty("--drift", `${(Math.random() - 0.5) * 160}px`);
    cont.appendChild(s);
  }
}

/* ---------- controles ---------- */
$("quitBtn").addEventListener("click", irAlInicio);
$("againBtn").addEventListener("click", irAlInicio);
$("soundBtn").addEventListener("click", () => {
  sonido = !sonido;
  $("soundBtn").textContent = sonido ? "🔊" : "🔇";
});
$("fullscreenBtn").addEventListener("click", () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});
// Teclas 1-4 o A-D para responder (útil si se juega con teclado).
document.addEventListener("keydown", (e) => {
  if (!screens.quiz.classList.contains("active")) return;
  const idx = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
  const botones = document.querySelectorAll(".option");
  if (idx >= 0 && botones[idx]) botones[idx].click();
});

armarPetalos();
armarInicio();
