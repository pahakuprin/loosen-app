// app.js — экран. Ход целиком в bell.js; здесь только время, поле и строка.

import { WORDS } from './words.js'
import { reply, opener, initialState } from './bell.js'

// Пауза — пустая строка во времени. Не индикатор: DESIGN.md, «Пауза, не „думаю“».
// Такты — по одному, следующий после того, как предыдущий прочитан: DESIGN.md, «Такты».
const T = {
  leave: 500, // слова уходят с экрана
  empty: 800, // пусто
  arrive: 900, // такт проступает целиком
  hold: 1000, // после такта — до следующего, плюс…
  perWord: 280, // …на каждое слово такта: время чтения
}

const root = document.documentElement
root.style.setProperty('--t-leave', `${T.leave}ms`)
root.style.setProperty('--t-arrive', `${T.arrive}ms`)

const app = document.getElementById('app')
const line = document.getElementById('line')
const ask = document.getElementById('ask')
const input = document.getElementById('input')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const wordCount = (s) => s.split(/\s+/u).filter(Boolean).length

// Единственное, что переживает закрытие: «колокольчик не нужен» сказано один раз.
const KEY = 'loosen.enough'
const load = () => {
  try {
    return { enoughShown: localStorage.getItem(KEY) === '1' }
  } catch {
    return {}
  }
}
const save = (state) => {
  try {
    if (state.enoughShown) localStorage.setItem(KEY, '1')
  } catch {
    /* без хранилища строка просто прозвучит ещё раз */
  }
}

let state = initialState(load())
let seq = 0
// Вопрос при открытии ставит только запуск. Поле берёт фокус раньше него, и без этого
// вопрос успевал проступить от фокуса и начинался заново от запуска — это читалось мерцанием.
let asked = false

// --- строка ---------------------------------------------------------------------------------

const onScreen = () => line.childElementCount > 0 && !line.classList.contains('is-out')

function hide() {
  if (!onScreen()) return Promise.resolve()
  line.classList.add('is-out')
  return sleep(T.leave)
}

// Все такты кладутся сразу, невидимыми: место занято, при появлении ничего не сдвигается.
// Потом каждый проступает по очереди; между тактами — время прочитать предыдущий.
// С приходом сигнала всё, что стояло до него, отходит на задний план — тем же жестом.
async function show(beats, my, signalAt = -1) {
  line.classList.remove('is-out')
  line.replaceChildren(
    ...beats.map((text, i) => {
      const beat = document.createElement('span')
      // Пустая строка перед сигналом стоит с самого начала: она размечает состав реплики,
      // а не разыгрывает приход последнего такта.
      beat.className = i === signalAt ? 'beat is-signal' : 'beat'
      beat.textContent = text
      return beat
    }),
  )
  void line.offsetHeight
  for (let i = 0; i < beats.length; i++) {
    if (my !== undefined && my !== seq) return
    if (i > 0) await sleep(T.hold + T.perWord * wordCount(beats[i - 1]))
    if (my !== undefined && my !== seq) return
    if (i === signalAt) for (let j = 0; j < i; j++) line.children[j].classList.add('is-back')
    line.children[i].classList.add('is-in')
    await sleep(T.arrive)
  }
}

// --- поле -----------------------------------------------------------------------------------

function grow() {
  input.style.height = 'auto'
  const max = parseFloat(getComputedStyle(input).lineHeight) * 5
  input.style.height = `${Math.min(input.scrollHeight, max)}px`
}

async function submit() {
  const text = input.value.trim()
  if (!text) return
  const my = ++seq

  const out = reply(text, state, WORDS)
  if (out.kind === 'none') return
  state = out.state
  save(state)

  ask.classList.add('is-sent')
  input.blur()
  await sleep(300)
  if (my !== seq) return
  input.value = ''
  input.style.height = ''
  ask.classList.remove('is-sent')

  await hide()
  if (my !== seq) return
  if (out.kind === 'quiet') {
    line.replaceChildren()
    return
  }

  await sleep(T.empty)
  if (my !== seq) return
  await show(out.beats, my, out.signalAt)
}

input.addEventListener('input', grow)
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    submit()
  }
})
ask.addEventListener('submit', (e) => {
  e.preventDefault()
  submit()
})

// После «ок, дальше» экран пуст; тронули поле — вопрос возвращается.
input.addEventListener('focus', () => {
  if (asked && state.step === 'opener' && !onScreen() && !ask.classList.contains('is-sent')) {
    show(opener(WORDS).beats)
  }
})

// --- клавиатура: экран — то, что видно над ней ---------------------------------------------

const vv = window.visualViewport
function fit() {
  if (!vv) return
  app.style.height = `${vv.height}px`
  app.style.transform = vv.offsetTop ? `translateY(${vv.offsetTop}px)` : ''
}
if (vv) {
  vv.addEventListener('resize', fit)
  vv.addEventListener('scroll', fit)
  fit()
}

// --- полоса статуса -------------------------------------------------------------------------

// Цвет полосы берут из theme-color, но медиазапрос на нём читают не все: кто не читает,
// берёт первый тег и держит его цвет в обеих темах. Поэтому во всех тегах — один цвет,
// цвет текущей бумаги; какой бы тег ни выбрали, он верный.
const bars = document.querySelectorAll('meta[name="theme-color"]')
const paintBars = () => {
  const paper = getComputedStyle(document.body).backgroundColor
  bars.forEach((bar) => {
    bar.content = paper
  })
}
// Кадр отсрочки: цвет читается уже после того, как стили пересчитались под новую тему.
const repaintBars = () => requestAnimationFrame(paintBars)
paintBars()
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaintBars)
// Тему чаще переключают, пока приложение свёрнуто: событие туда не приходит.
document.addEventListener('visibilitychange', repaintBars)

// --- старт ----------------------------------------------------------------------------------

sleep(350).then(() => {
  asked = true
  return show(opener(WORDS).beats)
})

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {})
}
