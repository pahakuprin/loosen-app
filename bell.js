// bell.js — ход как чистые функции. DOM здесь нет: test/ гоняет этот файл в Node.
//
//   reply(text, state, words) → { kind, beats, line, state }
//
//   kind   opener · reflection · relief · quote · signal · nothing · description
//          · outcome · question · enough · quiet · none
//   beats  такты для экрана, по одному за раз; [] — экран пустеет молча (quiet)
//   signalAt  индекс такта-сигнала в beats или -1; с его приходом такты до него тускнеют
//   line   та же реплика одной строкой, как у скилла; null — ничего не было (none)
//   state  { step: 'opener' | 'reflected' | 'outcome', reliefShown, enoughShown }
//
// Строки копируются буквально из SKILL.md. Всё, что здесь «решает», — к какой из неизменных
// строк отнести написанное и какую фразу вернуть в кавычках. Это единственное место, где
// в скилле работала модель, а здесь работает эвристика; см. DESIGN.md, «Чего приложение не умеет».

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

// Каждая строка — массив тактов. На экране такты приходят по одному, в порядке хода:
// заметил → воспринимается → отстранился. В тексте реплики (line) они стоят через пробел —
// это и есть строка скилла.
export const LINES = {
  ru: {
    opener: (w) => [asQuestion(w, 'Что')],
    reflection: (x, w) => [`«${x}».`, 'Воспринимается.', `${cap(w.signal)}.`],
    relief: (x) => [`«${x}».`, 'Это и есть отдых.'],
    quote: (x) => [`«${x}».`],
    signal: (w) => [`${cap(w.signal)}.`],
    nothing: (w) => ['«Ничего».', `${cap(w.signal)}.`],
    outcome: () => ['Что бы ты хотел, чтобы произошло?'],
    question: (x) => [`Вопрос: ${x}.`],
    description: () => ['Здесь описание. Вопроса нет.'],
    enough: (x) => [`«${x}».`, 'Колокольчик не нужен.'],
  },
  en: {
    opener: (w) => [asQuestion(w, 'What')],
    reflection: (x, w) => [`“${x}”.`, 'Perceived.', `${cap(w.signal)}.`],
    relief: (x) => [`“${x}”.`, 'That is the rest.'],
    quote: (x) => [`“${x}”.`],
    signal: (w) => [`${cap(w.signal)}.`],
    nothing: (w) => ['“Nothing”.', `${cap(w.signal)}.`],
    outcome: () => ['What would you like to have happen?'],
    question: (x) => [`Question: ${x}.`],
    description: () => ['A description. No question.'],
    enough: (x) => [`“${x}”.`, 'The bell is not needed.'],
  },
}

export function initialState(persisted = {}) {
  return { step: 'opener', reliefShown: false, enoughShown: Boolean(persisted.enoughShown) }
}

export function opener(words, lang = 'ru') {
  const beats = LINES[lang].opener(words)
  return { kind: 'opener', beats, signalAt: -1, line: beats.join(' ') }
}

// --- словари -------------------------------------------------------------------------------
//
// Запись «стем*» ловит слово с любым окончанием; фраза из нескольких слов — с любыми пробелами.
// Границы слов — свои: \b в JS не знает кириллицы.

// Слово облегчения — возвращается человеку. Отрицание («не легче») снимает совпадение.
const RELIEF = [
  'держит меньше', 'легче', 'полегчало', 'отлегло', 'отпустило', 'отпустил', 'отпустила',
  'отпустилось', 'тише', 'спокойнее', 'спокойней', 'свободнее', 'разжалось', 'ушло', 'прошло',
  'easier', 'lighter', 'quieter', 'calmer', 'softer', 'let go', 'released', 'it passed',
]

// Человек сам написал, что воспринимается или что отстранился, — ход уже сделан.
const LETGO = ['воспринимается', 'воспринимаю', 'воспринято', 'perceived', 'распустил*']

// Усложнение — вопрос про саму практику. Получает ход, а не ответ. Формы из references/lines.md.
const COMPLICATION = [
  'правильно ли', 'правильно делаю', 'так делаю', 'плавно', 'или сразу', 'сразу или', 'нащупа*',
  'как понять', 'получилось', 'получается', 'в прошлый раз', 'объясни*', 'как это работает',
  'как работает', 'не отпускает*', 'не отстран*', 'сколько раз', 'отпускать', 'отпустить',
  'колокольчик*', 'практик*', 'техник*', 'медитац*', 'внимани*', 'состояни*',
  'am i doing', 'doing this right', 'gradually', 'at once', "can't find", 'cannot find',
  'how do i know', 'how to know', 'last time', 'explain*', "doesn't let go", "won't let go",
  'how many times', 'letting go', 'let go of', 'practice', 'attention', 'the bell', 'meditat*',
]

// Вопрос про мир — выход в [2]. Проверяется после усложнений.
const QUESTION = [
  /(^|[^\p{L}])что(\s+\p{L}+){0,4}\s+делать(?![\p{L}])/iu,
  /(^|[^\p{L}])как(\s+\p{L}+){0,2}\s+(быть|поступить|сделать|починить|исправить|решить|разобраться)(?![\p{L}])/iu,
  // «почему» внутри фразы («не вижу почему») — не вопрос; вопрос с него начинается
  /^(?:(?:и|а|ну|так|но|and|so|but)\s+)?(?:почему|зачем|стоит ли|надо ли|нужно ли|можно ли|why|should i|is it worth)(?![\p{L}])/iu,
  'что теперь', 'what do i do', 'what should i do', 'what now', 'how do i', 'how can i', 'how should i',
]

// «Интересно поговорить про…» — описание, вопроса нет.
const DESCRIPTION = [
  'интересно поговорить', 'интересно было бы поговорить', 'интересно обсудить',
  'интересно порассуждать', 'хочется поговорить', 'хочется обсудить', 'хотелось бы поговорить',
  'хотелось бы обсудить', 'давай поговорим', 'давай обсудим',
  'interesting to talk', 'would be interesting', 'want to talk about', 'like to talk about',
  "let's talk",
]

const BACK = /^(ок|окей|ok|okay|ладно|дальше|хватит|спасибо|пока|bye|thanks|thank you|done)(?![\p{L}])/iu
const NOTHING = /^(ничего|нечего|нет|nothing|no|nope)(?![\p{L}])/iu
const NEGATION = /(^|[^\p{L}])(не|ни|ничуть не|совсем не|пока не|not|no|never|isn['’]t|doesn['’]t|didn['’]t|hasn['’]t|won['’]t|can['’]t)\s*$/iu

// Клауза только из этих слов — не объект («не понимаю», «снова вовлёкся»).
// Слова здесь уже без «ё»: сверка идёт по low(), где «ё» заменена на «е».
const CLAUSE_FILLERS = new Set([
  'не', 'понимаю', 'знаю', 'короче', 'в', 'общем', 'ну', 'блин', 'кажется', 'по-моему', 'честно',
  'говоря', 'вот', 'да', 'и', 'а', 'но', 'опять', 'снова', 'теперь', 'просто', 'что', 'это',
  'уже', 'вроде', 'вообще', 'сегодня', 'сейчас', 'держит', 'затянуло', 'вовлекся', 'захватило',
  'again', 'now', 'well', 'hmm', 'i', "don't", 'dont', 'know', 'think', 'just', 'so', 'ok', 'it',
])

// Снимаются с начала выбранной фразы, пока остаётся хотя бы два слова.
const LEADING_FILLERS = new Set([
  'ну', 'вот', 'короче', 'просто', 'теперь', 'опять', 'снова', 'и', 'а', 'но', 'да', 'блин',
  'again', 'now', 'well', 'just', 'so', 'ok', 'hmm',
])

const WISH = /^(хочу|хочется|хотел бы|хотела бы|хотелось бы|мне бы|чтобы|чтоб|понять|разобраться|узнать|выяснить|решить|найти|увидеть|i want to|i'd like to|i would like to|to understand|to figure out|to know|to find out)[,\s]+/iu

// --- механика ------------------------------------------------------------------------------

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function compile(entry) {
  if (entry instanceof RegExp) return entry
  const body = escapeRe(entry)
    .replace(/\\\*/g, '\\p{L}*')
    .replace(/[её]/g, '[её]')
    .replace(/\s+/g, '\\s+')
  return new RegExp(`(^|[^\\p{L}\\p{N}])(${body})(?![\\p{L}\\p{N}])`, 'iu')
}

const compiled = new Map()
const re = (entry) => {
  if (entry instanceof RegExp) return entry
  if (!compiled.has(entry)) compiled.set(entry, compile(entry))
  return compiled.get(entry)
}

// Все совпадения словаря в тексте, по позиции. text — оригинал: слово возвращается как написано.
function find(text, entries) {
  const hits = []
  for (const entry of entries) {
    const m = re(entry).exec(text)
    if (!m) continue
    const lead = m[1] ?? ''
    hits.push({ index: m.index + lead.length, text: m[2] ?? m[0].slice(lead.length) })
  }
  return hits.sort((a, b) => a.index - b.index)
}

const negated = (text, hit) => NEGATION.test(text.slice(0, hit.index))

const words = (s) => s.split(/\s+/u).filter(Boolean)
const wordCount = (s) => words(s).length
const low = (s) => s.toLowerCase().replace(/ё/g, 'е')

// Стем слова из WORDS, уже без «ё»: «вовлекся» → «вовлек», «затянуло» → «затяну».
const stem = (w) => (w.length > 5 ? w.slice(0, -2) : w)

// caught в файле — сразу вопрос («Во что вовлёкся?») или слово («держит»).
// Слово вовлечения для разбора — последнее слово из него.
const caughtWord = (w) => low(w.caught || '').replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/u).pop() ?? ''
const asQuestion = (w, what) => {
  const c = String(w.caught || '').trim()
  return c.endsWith('?') ? c : `${what} ${c}?`
}

export function detectLang(text) {
  if (/\p{Script=Cyrillic}/u.test(text)) return 'ru'
  if (/\p{Script=Latin}/u.test(text)) return 'en'
  return 'ru'
}

export function clean(raw) {
  return String(raw ?? '')
    .replace(/^\s*\/loosen\b/iu, '')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^[«"“„'…]+|[»"”“'…]+$/gu, '')
    .replace(/^(\.\.\.|…)\s*/u, '')
    .trim()
}

function isFiller(clause, caughtStem) {
  return words(low(clause)).every((w) => CLAUSE_FILLERS.has(w) || w.startsWith(caughtStem))
}

function stripLeading(clause) {
  let ws = words(clause)
  while (ws.length > 2 && LEADING_FILLERS.has(low(ws[0]))) ws = ws.slice(1)
  return ws.join(' ')
}

// Самая короткая фраза, которая называет объект, — насколько это видно без модели:
// первая клауза, не состоящая из одних служебных слов; без вводных слов в начале; не длиннее
// восьми слов. Всё — их слова в их порядке.
export function pickQuote(text, wordsFile = { caught: '' }) {
  const caughtStem = stem(caughtWord(wordsFile))
  const t = text.replace(/[.!?…]+$/u, '').trim()
  let clause = t
  const hasClause = /[,.;:!?…()]|\s[—–-]+\s/u.test(t)
  if (hasClause && wordCount(t) > 4) {
    const parts = t.split(/[,.;:!?…()]+|\s[—–-]+\s/u).map((s) => s.trim()).filter(Boolean)
    const kept = parts.filter((p) => !isFiller(p, caughtStem))
    clause = kept[0] ?? parts[0] ?? t
  }
  clause = stripLeading(clause)
  if (wordCount(clause) > 8) {
    const sub = clause.split(/\s+(?:и|а|но|что|потому что|когда|хотя|and|but|because|when)\s+/iu)
    clause = stripLeading(sub.map((s) => s.trim()).filter(Boolean)[0] ?? clause)
    if (wordCount(clause) > 8) clause = words(clause).slice(0, 8).join(' ')
  }
  return clause.replace(/[,;:]+$/u, '').trim() || t
}

function questionText(text) {
  let t = text.replace(/[.!?…]+$/u, '').trim()
  for (let i = 0; i < 3; i++) t = t.replace(WISH, '')
  return t.replace(/[.!?…,;:]+$/u, '').trim() || text
}

// --- ход -----------------------------------------------------------------------------------

export function reply(raw, state, wordsFile) {
  const text = clean(raw)
  if (!text) return { kind: 'none', beats: [], signalAt: -1, line: null, state }

  const lang = detectLang(text)
  const L = LINES[lang]
  const n = wordCount(text)
  const lower = low(text)
  const next = (patch) => ({ ...state, ...patch })
  // signalAt — такт сигнала: когда он приходит, всё до него отходит на задний план.
  const signalAt = (beats) => beats.indexOf(L.signal(wordsFile)[0])
  const done = (kind, beats, patch = { step: 'reflected' }, line = beats.join(' ')) => ({ kind, beats, signalAt: signalAt(beats), line, state: next(patch) })
  const reflect = () => done('reflection', L.reflection(pickQuote(text, wordsFile), wordsFile))

  const letgoLex = [...LETGO, `${stem(low(wordsFile.signal))}*`]
  const complicationLex = [...COMPLICATION, `${stem(caughtWord(wordsFile))}*`]

  // «ок, дальше по тикету» — то, что шло до колокольчика, продолжается; о колокольчике ни слова.
  if (n <= 6 && BACK.test(lower)) return done('quiet', [], { step: 'opener', reliefShown: false })

  // «интересно поговорить про…» — описание, вопроса нет; потом ход.
  if (find(text, DESCRIPTION).length) {
    const description = L.description()
    const move = L.reflection(pickQuote(text, wordsFile), wordsFile)
    return done('description', [...description, ...move], { step: 'reflected' }, `${description.join(' ')}\n\n${move.join(' ')}`)
  }

  // «ничего не держит».
  if (NOTHING.test(lower) && (n <= 4 || /^ничего не/u.test(lower))) return done('nothing', L.nothing(wordsFile))

  const relief = find(text, RELIEF).filter((h) => !negated(text, h))
  const letgo = find(text, letgoLex).filter((h) => !negated(text, h))
  const complication = find(text, complicationLex)

  if (state.step === 'opener') {
    if (complication.length) return reflect()
    // Уход: человек уже сделал часть хода сам.
    const hits = [...letgo, ...relief].sort((a, b) => a.index - b.index)
    const did = hits[0]
    if (did) {
      // Ничего не назвал: кроме слова отпускания и служебных слов, в тексте ничего нет.
      const rest = hits.reduce((t, h) => t.replace(h.text, ' '), text)
      const nothingNamed = did.index === 0 || isFiller(rest, stem(caughtWord(wordsFile)))
      if (nothingNamed && !state.enoughShown) return done('enough', L.enough(did.text), { step: 'reflected', enoughShown: true })
      return done('signal', L.signal(wordsFile))
    }
    if (isQuestion(text, lower)) return done('outcome', L.outcome(), { step: 'outcome' })
    return reflect()
  }

  if (complication.length) return reflect()

  if (relief.length) {
    const word = relief[relief.length - 1].text
    if (!state.reliefShown) return done('relief', L.relief(word), { step: 'reflected', reliefShown: true })
    return done('quote', L.quote(word))
  }

  if (letgo.length) return done('signal', L.signal(wordsFile))

  if (state.step === 'outcome') {
    if (n <= 3 && /^(не знаю|не понимаю|хз|без понятия|dunno|i don'?t know|no idea)/iu.test(lower)) return reflect()
    return done('question', L.question(questionText(text)))
  }

  if (isQuestion(text, lower)) return done('outcome', L.outcome(), { step: 'outcome' })

  return reflect()
}

function isQuestion(text, lower) {
  return lower.endsWith('?') || find(text, QUESTION).length > 0
}
