// Coach dashboard greeting name -- pulled out as a pure function (no Vue,
// no Supabase client) specifically so it's unit-testable the same way
// supabase/functions/invite-trainee/handler.js is (see its
// handler.test.mjs) -- this repo has no Vue/component test framework
// (no vitest/@vue/test-utils in package.json), so a plain, dependency-free
// function plus a node:test file is the one established way to add a
// focused test here without introducing new project-wide test
// infrastructure.
//
// Fallback order: user_metadata.full_name -> user_metadata.name -> the
// local part of the email (before "@"). Never returns an empty string
// when `user.email` is a non-empty string -- the email-local-part case is
// the backstop that guarantees that.
export function resolveDisplayName(user) {
  if (!user) return ''
  const metadata = user.user_metadata ?? {}

  const fullName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : ''
  if (fullName) return fullName

  const name = typeof metadata.name === 'string' ? metadata.name.trim() : ''
  if (name) return name

  const email = user.email ?? ''
  return email.includes('@') ? email.slice(0, email.indexOf('@')) : email
}
