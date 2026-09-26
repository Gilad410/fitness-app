import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Show/hide password toggles on /coach/join.
//
// HONEST SCOPE. This repo has no component-test runner (no vitest, no
// @vue/test-utils, no jsdom), so these are STATIC ASSERTIONS over the SFC
// source, not rendered-behaviour tests. They cannot prove what a click
// does at runtime. What they do prove is the set of invariants that would
// silently break the feature if edited away, each of which is a single
// attribute in the markup:
//
//   * the fields start masked           -> ref(false)
//   * the eye actually swaps visibility -> :type bound to the flag
//   * clicking the eye cannot SUBMIT    -> type="button"
//   * the label changes for screen readers
//   * the typed text is not hidden under the button, in RTL too
//
// A rendered test would be better and is worth adding when this project
// grows component-test infrastructure; asserting nothing in the meantime
// would be worse.

const src = readFileSync(new URL('./CoachJoinView.vue', import.meta.url), 'utf8')

// Everything between <template> and </template>.
const template = src.slice(src.indexOf('<template>'), src.lastIndexOf('</template>'))

const FIELDS = [
  { flag: 'showNewPassword', model: 'newPassword', label: 'סיסמה' },
  { flag: 'showConfirmNewPassword', model: 'confirmNewPassword', label: 'אימות סיסמה' },
]

test('both password fields exist and each has its own visibility flag', () => {
  for (const { flag } of FIELDS) {
    assert.match(src, new RegExp(`const ${flag} = ref\\(`), `${flag} must be declared`)
  }
  assert.notEqual(FIELDS[0].flag, FIELDS[1].flag, 'the two fields must not share one flag')
})

test('each field defaults to MASKED', () => {
  for (const { flag } of FIELDS) {
    assert.match(
      src,
      new RegExp(`const ${flag} = ref\\(false\\)`),
      `${flag} must default to false so the password starts hidden`,
    )
  }
})

test('each input swaps between password and text based on its own flag', () => {
  for (const { flag } of FIELDS) {
    assert.ok(
      template.includes(`:type="${flag} ? 'text' : 'password'"`),
      `the input for ${flag} must bind :type to that flag`,
    )
  }
})

test('no password input is left hard-coded as type="password"', () => {
  // A leftover static type would render an eye button that does nothing.
  const staticPasswordInputs = template.match(/type="password"/g) ?? []
  assert.equal(staticPasswordInputs.length, 0, 'found a hard-coded type="password"')
})

test('the toggle buttons are type="button" -- clicking the eye cannot submit the form', () => {
  // The single most important attribute here: inside a <form>, a button
  // with no type defaults to submit, so losing this would make the eye
  // icon submit a half-typed password.
  const toggleButtons = [...template.matchAll(/<button\b[^>]*@click="(show\w*) = !\1"/gs)]
  assert.equal(toggleButtons.length, FIELDS.length, `expected ${FIELDS.length} toggle buttons`)

  for (const match of toggleButtons) {
    assert.match(match[0], /type="button"/, `toggle for ${match[1]} must be type="button"`)
  }
})

test('every button inside the form is explicitly typed (no implicit submit)', () => {
  const buttons = [...template.matchAll(/<button\b[^>]*>/gs)]
  assert.ok(buttons.length >= FIELDS.length)
  for (const [tag] of buttons) {
    assert.match(tag, /type="(button|submit)"/, `button missing an explicit type: ${tag.slice(0, 80)}`)
  }
})

test('the toggle only flips its flag -- it does not touch the field value', () => {
  for (const { flag } of FIELDS) {
    const handler = `@click="${flag} = !${flag}"`
    assert.ok(template.includes(handler), `${flag} toggle must be exactly ${handler}`)
  }
  // No handler anywhere clears or reassigns a password model.
  for (const { model } of FIELDS) {
    assert.doesNotMatch(
      template,
      new RegExp(`@click="[^"]*${model}\\s*=`),
      `no click handler may assign to ${model}`,
    )
  }
})

test('aria-label switches between the two required Hebrew strings', () => {
  for (const { flag } of FIELDS) {
    assert.ok(
      template.includes(`:aria-label="${flag} ? 'הסתרת סיסמה' : 'הצגת סיסמה'"`),
      `${flag} toggle must have the switching aria-label`,
    )
  }
})

test('each toggle exposes its pressed state to assistive tech', () => {
  for (const { flag } of FIELDS) {
    assert.ok(template.includes(`:aria-pressed="${flag}"`), `${flag} toggle needs aria-pressed`)
  }
  // The icons themselves are decorative and must not be announced.
  const svgs = [...template.matchAll(/<svg\b[^>]*>/gs)]
  for (const [tag] of svgs) {
    assert.match(tag, /aria-hidden="true"/, 'decorative svg must be aria-hidden')
  }
})

test('layout is RTL-safe and leaves room for the button', () => {
  // Logical properties (pe-/end-) rather than pr-/right-, so the button
  // sits on the correct side in this RTL app, and the typed text never
  // runs underneath it.
  const inputs = [...template.matchAll(/<input\b[^>]*:type="show[^>]*>/gs)]
  assert.equal(inputs.length, FIELDS.length)
  for (const [tag] of inputs) {
    assert.match(tag, /\bpe-10\b/, 'password input needs end-padding for the button')
  }

  const toggles = [...template.matchAll(/<button\b[^>]*@click="show\w* = !show\w*"[^>]*>/gs)]
  for (const [tag] of toggles) {
    assert.match(tag, /\bend-0\b/, 'toggle must be positioned with the logical end-0')
    assert.doesNotMatch(tag, /\bright-0\b/, 'right-0 would be wrong in RTL')
  }
})

test('the join flow itself is untouched: the submit button and handler remain', () => {
  assert.match(template, /@submit\.prevent="handleSetPassword"/)
  assert.match(template, /type="submit"/)
  assert.match(src, /async function handleSetPassword\(/)
  // Validation still compares the two fields.
  assert.match(src, /newPassword\.value !== confirmNewPassword\.value/)
})
