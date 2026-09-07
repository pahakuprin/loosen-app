#!/usr/bin/env node
// Снимает реальную каденцию тактов в headless Chrome: когда какой такт проступил.
//
//   node tools/time-beats.mjs [url] [text]
//
// По умолчанию url = http://127.0.0.1:8107/ (сервер должен быть поднят), text — цитата
// из evals. Печатает секунды от нажатия Enter до появления каждого такта. Нужен Chrome
// в /Applications; Node 22+ (встроенный WebSocket).

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const url = process.argv[2] ?? 'http://127.0.0.1:8107/'
const text = process.argv[3] ?? 'тайлы мерцают при свапе, третий день не вижу почему'

const profile = mkdtempSync(join(tmpdir(), 'loosen-chrome-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=375,812',
  'about:blank',
])

const wsUrl = await new Promise((resolve, reject) => {
  let buf = ''
  chrome.stderr.on('data', (d) => {
    buf += d
    const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/)
    if (m) resolve(m[1])
  })
  chrome.on('exit', (code) => reject(new Error(`chrome exited ${code}\n${buf}`)))
  setTimeout(() => reject(new Error('chrome did not start')), 15000)
})

const port = new URL(wsUrl).port
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
const page = targets.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))

let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
}
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const myId = ++id
    pending.set(myId, resolve)
    ws.send(JSON.stringify({ id: myId, method, params }))
  })

await send('Page.enable')
await send('Page.navigate', { url })
await new Promise((r) => setTimeout(r, 1500))

const script = `
  (async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const input = document.getElementById('input')
    const line = document.getElementById('line')
    const log = []
    const seen = new Set([...line.children].filter((b) => b.classList.contains('is-in')).map((b) => b.textContent))
    const t0 = performance.now()
    const stamp = (what) => log.push([Math.round(performance.now() - t0) / 1000, what])
    new MutationObserver(() => {
      if (line.classList.contains('is-out') && !seen.has('out')) { seen.add('out'); stamp('prежняя реплика гаснет'.replace('prежняя', 'прежняя')) }
      for (const b of line.children) {
        if (b.classList.contains('is-in') && !seen.has(b.textContent)) { seen.add(b.textContent); stamp(b.textContent) }
        if (b.classList.contains('is-back') && !seen.has('back:' + b.textContent)) { seen.add('back:' + b.textContent); stamp('  отходит: ' + b.textContent) }
        for (const m of b.querySelectorAll('.mark.is-in')) {
          if (!seen.has('mark:' + b.textContent)) { seen.add('mark:' + b.textContent); stamp('  кавычки: ' + b.textContent) }
        }
      }
    }).observe(line, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] })
    input.focus()
    input.value = ${JSON.stringify(text)}
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    stamp('Enter')
    await wait(12000)
    return log
  })()
`
const res = await send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true })
const log = res.result?.result?.value ?? []
for (const [t, what] of log) console.log(`${t.toFixed(1).padStart(5)} s  ${what}`)
if (!log.length) console.log(JSON.stringify(res, null, 2))

ws.close()
const exited = new Promise((r) => chrome.on('exit', r))
chrome.kill()
await exited
rmSync(profile, { recursive: true, force: true })
