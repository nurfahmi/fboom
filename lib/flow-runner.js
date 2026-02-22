'use strict'

/**
 * Run a JSON flow (array of steps) against an ElectronPage instance.
 *
 * @param {object} page - ElectronPage instance from electron-automation-core
 * @param {Array} steps - Array of step objects
 * @param {object} [vars={}] - Variables to inject into args (e.g. { commentText: "hi" })
 * @returns {Promise<{ ok: boolean, stepsRun: number, error?: string }>}
 *
 * Step format:
 *   { "action": "click", "args": ["selector"] }
 *   { "action": "keyboard.type", "args": ["{{commentText}}", 50] }
 *   { "action": "click", "args": ["sel"], "fallback": { "action": "click", "args": ["sel2"] } }
 *   { "action": "upload", "args": ["sel", "{{imagePath}}"], "if": "{{imagePath}}" }
 */
async function runFlow(page, steps, vars = {}) {
  let stepsRun = 0

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]

    // Conditional — skip if variable is falsy
    if (step.if !== undefined) {
      const condValue = injectVars(step.if, vars)
      if (!condValue || condValue === '' || condValue === 'null' || condValue === 'undefined') continue
    }

    try {
      await executeStep(page, step, vars)
      stepsRun++
    } catch (err) {
      if (step.fallback) {
        try {
          await executeStep(page, step.fallback, vars)
          stepsRun++
        } catch (fbErr) {
          return { ok: false, stepsRun, error: `Step ${i} fallback failed: ${fbErr.message}` }
        }
      } else if (step.optional) {
        // optional steps don't fail the flow
        stepsRun++
        continue
      } else {
        return { ok: false, stepsRun, error: `Step ${i} (${step.action}) failed: ${err.message}` }
      }
    }
  }

  return { ok: true, stepsRun }
}

/**
 * Execute a single step.
 */
async function executeStep(page, step, vars) {
  const { action, args = [] } = step

  // Inject variables into args
  const resolvedArgs = args.map(arg => {
    if (typeof arg === 'string') return injectVars(arg, vars)
    if (Array.isArray(arg)) return arg.map(a => typeof a === 'string' ? injectVars(a, vars) : a)
    return arg
  })

  // Resolve dotted action like "keyboard.type" → page.keyboard.type
  const parts = action.split('.')
  let target = page
  let method = parts[0]

  if (parts.length === 2) {
    target = page[parts[0]]
    method = parts[1]
    if (!target) throw new Error(`page.${parts[0]} does not exist`)
  }

  if (typeof target[method] !== 'function') {
    throw new Error(`${action} is not a function on page`)
  }

  await target[method](...resolvedArgs)
}

/**
 * Replace {{varName}} placeholders with actual values.
 */
function injectVars(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined ? vars[key] : ''
  })
}

module.exports = { runFlow }
