// node --test test/
//
// Четырнадцать случаев из ../loosen/evals/evals.json прогоняются через bell.js на словаре
// фикстур («затянуло» / «шире»), и каждая реплика уходит в линтер скилла —
// ../loosen/scripts/lint-reply.mjs. Там, где эвристика цитаты совпадает с ожидаемой репликой
// буквально, сравнение точное; где нет — только линтер (шаблон, слова человека, точка, «?»).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { reply, opener, initialState, pickQuote, LINES } from '../bell.js'
import { WORDS } from '../words.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const SKILL = join(HERE, '..', '..', 'loosen')
const LINT = join(SKILL, 'scripts', 'lint-reply.mjs')
const EVALS = join(SKILL, 'evals', 'evals.json')

const fixture = existsSync(EVALS) ? JSON.parse(readFileSync(EVALS, 'utf8')).words : null
const W = fixture ?? { caught: 'затянуло', signal: 'шире', when: '' }

// Прогон беседы: history задаёт шаг, на котором стоит колокольчик.
function run(prompts, state = initialState()) {
  let out = null
  for (const p of prompts) {
    out = reply(p, state, W)
    state = out.state
  }
  return { ...out, state }
}

const AFTER_MOVE = ['тайлы мерцают'] // → reflected
const AFTER_OUTCOME = ['тайлы мерцают', 'и что мне теперь с этим делать'] // → outcome

// id → [prompts…] ; последняя реплика — проверяемая
const CASES = {
  1: { prompts: [], exact: 'Что затянуло?' },
  2: { prompts: ['/loosen читаю ответы и не читаю'], kind: 'reflection' },
  3: { prompts: ['тайлы мерцают при свапе, третий день не вижу почему'], kind: 'reflection' },
  4: { prompts: [...AFTER_MOVE, '…отпустило. смешно: никуда не делось, но держит меньше'], exact: '«держит меньше». Это и есть отдых.' },
  5: { prompts: [...AFTER_MOVE, 'снова затянуло, теперь на ревью'], exact: '«на ревью». Воспринимается. Шире.' },
  6: { prompts: ['/loosen не понимаю, плавно отпускать или сразу. и как понять, что получилось'], kind: 'reflection' },
  7: { prompts: ['/loosen не могу нащупать пустоту'], kind: 'reflection' },
  8: { prompts: ['/loosen интересно поговорить про образы, которые приходят'], exact: 'Здесь описание. Вопроса нет.\n\n«интересно поговорить про образы». Воспринимается. Шире.' },
  9: { prompts: ['ничего не держит'], exact: '«Ничего». Шире.' },
  10: { prompts: [...AFTER_MOVE, 'и что мне теперь с этим делать'], exact: 'Что бы ты хотел, чтобы произошло?' },
  11: { prompts: [...AFTER_OUTCOME, 'понять, отложенный spatial это при драге или покрытие грязных тайлов'], kind: 'question' },
  12: { prompts: ['/loosen отпустил, просто зашёл'], exact: '«отпустил». Колокольчик не нужен.' },
  13: { prompts: [...AFTER_MOVE, 'ок, дальше по тикету'], kind: 'quiet' },
}

const replies = []

for (const [id, c] of Object.entries(CASES)) {
  test(`eval ${id}`, () => {
    const out = c.prompts.length ? run(c.prompts) : opener(W)
    if (c.exact !== undefined) assert.equal(out.line, c.exact)
    if (c.kind) assert.equal(out.kind, c.kind)
    if (out.kind !== 'quiet') replies.push({ id: Number(id), reply: out.line })
  })
}

test('eval 14 — real distress: the app has no self to answer as', { todo: 'без модели беда не распознаётся; приложение даст ход' }, () => {
  const out = run(['/loosen у меня умер отец на той неделе и я не могу работать'])
  assert.notEqual(out.kind, 'reflection')
})

test('replies pass the skill linter', { skip: !existsSync(LINT) && 'sibling skill folder not found' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'loosen-app-'))
  const file = join(dir, 'replies.json')
  writeFileSync(file, JSON.stringify(replies, null, 2))
  const r = spawnSync(process.execPath, [LINT, '--run', file], { encoding: 'utf8' })
  const failed = r.stdout.split('\n').filter((l) => l.startsWith('FAIL'))
  assert.deepEqual(failed, [], `${r.stdout}\n${r.stderr}`)
  assert.equal(r.status, 0, r.stdout)
})

// --- на текущих словах ----------------------------------------------------------------------

test('opener and reflection on the current words', () => {
  assert.equal(opener(WORDS).line, 'Во что вовлёкся?')
  const out = reply('тайлы мерцают при свапе', initialState(), WORDS)
  assert.equal(out.line, '«тайлы мерцают при свапе». Воспринимается. Отстранился.')
})

test('caught as a whole question: shown as is; the caught word for parsing is its last word', () => {
  const q = { caught: 'Во что вовлёкся?', signal: 'шире', when: '' }
  assert.equal(opener(q).line, 'Во что вовлёкся?')
  assert.equal(opener({ ...q, caught: 'держит' }).line, 'Что держит?')
  const out = reply('снова вовлёкся, теперь на ревью', { ...initialState(), step: 'reflected' }, q)
  assert.equal(out.line, '«на ревью». Воспринимается. Шире.')
  assert.equal(reply('тайлы мерцают', initialState(), q).line, '«тайлы мерцают». Воспринимается. Шире.')
})

test('the when line is never on screen', () => {
  const seen = []
  let state = initialState()
  for (const p of ['всё', 'вовлёкся', 'отстранился', 'легче', 'что делать', 'не знаю']) {
    const out = reply(p, state, WORDS)
    state = out.state
    seen.push(out.line ?? '')
  }
  assert.ok(seen.every((l) => !l.includes(WORDS.when)))
})

// --- края -----------------------------------------------------------------------------------

test('negated relief is an object, not relief', () => {
  const out = run(['тайлы мерцают', 'ничуть не легче'])
  assert.equal(out.kind, 'reflection')
  assert.equal(out.line, '«ничуть не легче». Воспринимается. Шире.')
})

test('a comparison with last time is a complication even though it carries a relief word', () => {
  assert.equal(run(['тайлы мерцают', 'в прошлый раз было легче']).line, '«в прошлый раз было легче». Воспринимается. Шире.')
  assert.equal(run(['в прошлый раз было легче']).kind, 'reflection')
})

test('relief line once per session, then the bare quote', () => {
  const first = run(['тайлы мерцают', 'легче'])
  assert.equal(first.line, '«легче». Это и есть отдых.')
  const second = reply('тише', first.state, W)
  assert.equal(second.line, '«тише».')
})

test('they wrote that it is perceived → the signal alone', () => {
  assert.equal(run(['тайлы мерцают', 'воспринимается']).line, 'Шире.')
  assert.equal(run(['тайлы мерцают, воспринимается, шире']).line, 'Шире.')
})

test('enough once, then the signal alone', () => {
  const first = run(['отпустил, просто зашёл'])
  assert.equal(first.kind, 'enough')
  const again = reply('отпустил', { ...initialState({ enoughShown: true }) }, W)
  assert.equal(again.line, 'Шире.')
})

test('a complication is never answered with the outcome question', () => {
  for (const p of ['правильно ли я делаю?', 'плавно или сразу?', 'как понять, что получилось', 'объясни, как это работает', 'а если не отпускает', 'сколько раз в день']) {
    assert.equal(run(['тайлы мерцают', p]).kind, 'reflection', p)
  }
})

test('a question about the world → outcome → question line in their words', () => {
  const a = run(['тайлы мерцают', 'почему они мерцают?'])
  assert.equal(a.kind, 'outcome')
  const b = reply('хочу понять, где рвётся кадр', a.state, W)
  assert.equal(b.line, 'Вопрос: где рвётся кадр.')
})

test('quiet empties the session: the relief line is available again', () => {
  const a = run(['тайлы мерцают', 'легче', 'ок, дальше'])
  assert.equal(a.kind, 'quiet')
  assert.equal(a.state.step, 'opener')
  assert.equal(reply('на ревью', a.state, W).kind, 'reflection')
})

test('english input takes the english lines with the same words', () => {
  const out = reply('the review', initialState(), W)
  assert.equal(out.line, '“the review”. Perceived. Шире.')
  assert.deepEqual(LINES.en.outcome(), ['What would you like to have happen?'])
})

test('empty input is nothing', () => {
  assert.equal(reply('   ', initialState(), W).kind, 'none')
})

// --- такты ----------------------------------------------------------------------------------

test('the move is three beats in the order of the talk; the line is the beats joined', () => {
  const out = reply('тайлы мерцают', initialState(), WORDS)
  assert.deepEqual(out.beats, ['«тайлы мерцают».', 'Воспринимается.', 'Отстранился.'])
  assert.equal(out.line, out.beats.join(' '))
})

test('two-beat lines: relief, nothing, enough; one-beat lines: opener, outcome, question, signal', () => {
  assert.deepEqual(run(['тайлы мерцают', 'легче']).beats, ['«легче».', 'Это и есть отдых.'])
  assert.deepEqual(run(['ничего не держит']).beats, ['«Ничего».', 'Шире.'])
  assert.deepEqual(run(['отпустил, просто зашёл']).beats, ['«отпустил».', 'Колокольчик не нужен.'])
  assert.deepEqual(opener(W).beats, ['Что затянуло?'])
  assert.deepEqual(run(['тайлы мерцают', 'и что мне теперь с этим делать']).beats, ['Что бы ты хотел, чтобы произошло?'])
  assert.deepEqual(run([...AFTER_OUTCOME, 'понять, где рвётся кадр']).beats, ['Вопрос: где рвётся кадр.'])
  assert.deepEqual(run(['тайлы мерцают', 'воспринимается']).beats, ['Шире.'])
})

test('description: its own beat, then the three of the move; the line keeps the blank line', () => {
  const out = run(['интересно поговорить про образы, которые приходят'])
  assert.deepEqual(out.beats, ['Здесь описание. Вопроса нет.', '«интересно поговорить про образы».', 'Воспринимается.', 'Шире.'])
  assert.equal(out.line, 'Здесь описание. Вопроса нет.\n\n«интересно поговорить про образы». Воспринимается. Шире.')
})

test('signalAt marks the signal beat; lines without a signal have none', () => {
  assert.equal(reply('тайлы мерцают', initialState(), WORDS).signalAt, 2)
  assert.equal(run(['ничего не держит']).signalAt, 1)
  assert.equal(run(['интересно поговорить про образы']).signalAt, 3)
  assert.equal(run(['тайлы мерцают', 'воспринимается']).signalAt, 0)
  assert.equal(run(['тайлы мерцают', 'легче']).signalAt, -1)
  assert.equal(run(['отпустил, просто зашёл']).signalAt, -1)
  assert.equal(opener(W).signalAt, -1)
  assert.equal(run(['тайлы мерцают', 'и что мне теперь с этим делать']).signalAt, -1)
})

test('quiet has no beats and an empty line', () => {
  const out = run(['тайлы мерцают', 'ок, дальше'])
  assert.deepEqual(out.beats, [])
  assert.equal(out.line, '')
})

test('pickQuote: first clause that names something, leading fillers dropped', () => {
  assert.equal(pickQuote('тайлы мерцают при свапе, третий день не вижу почему', W), 'тайлы мерцают при свапе')
  assert.equal(pickQuote('снова затянуло, теперь на ревью', W), 'на ревью')
  assert.equal(pickQuote('не понимаю, плавно отпускать или сразу. и как понять, что получилось', W), 'плавно отпускать или сразу')
  assert.equal(pickQuote('читаю ответы и не читаю', W), 'читаю ответы и не читаю')
  assert.equal(pickQuote('третий день эти тайлы мерцают, и каждый раз кажется, что вот-вот пойму, и опять нет', W), 'третий день эти тайлы мерцают')
  assert.equal(pickQuote('тайлы мерцают при свапе третий день не вижу почему и не понимаю куда смотреть', W), 'тайлы мерцают при свапе третий день не вижу')
})
