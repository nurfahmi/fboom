async function fillForm() {
  const email = document.getElementById('emailInput').value
  const password = document.getElementById('passInput').value
  if (!email && !password) { setStatus('Enter email or password first', 'error'); return }
  setStatus('Filling form...', 'info')
  const res = await window.api.invoke('fill-form', currentSlot, { email, password })
  if (res.ok) setStatus('Form filled ✓', 'success')
  else setStatus('Error: ' + res.error, 'error')
}

async function clickLogin() {
  setStatus('Clicking login...', 'info')
  const res = await window.api.invoke('click-login', currentSlot)
  if (res.ok) setStatus('Login clicked ✓', 'success')
  else setStatus('Error: ' + res.error, 'error')
}
