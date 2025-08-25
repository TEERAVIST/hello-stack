<!-- frontend/src/App.vue -->
<template>
  <main
    style="font-family: system-ui, sans-serif; max-width: 720px; margin: 64px auto; padding: 24px"
  >
    <h1>Hello World (Vue 3)</h1>
    <p>Click the button to write a log row to SQL Server through the backend.</p>

    <div style="margin: 16px 0">
      <input
        v-model="message"
        placeholder="Log message..."
        style="padding: 8px 12px; width: 100%; max-width: 480px"
      />
    </div>

    <button @click="writeLog" :disabled="busy" style="padding: 10px 16px; cursor: pointer">
      {{ busy ? 'Logging...' : 'Write Log' }}
    </button>

    <div v-if="status" style="margin-top: 20px"><strong>Status:</strong> {{ status }}</div>
  </main>
</template>

<script setup>
import { onMounted, ref } from 'vue'

const message = ref('Hello from the frontend')
const status = ref('')
const busy = ref(false)

onMounted(async () => {
  try {
    const r = await fetch('/api/health')
    const j = await r.json()
    status.value = j.ok ? `Backend OK (db UTC ${j.dbUtcNow})` : 'Backend error'
  } catch (e) {
    status.value = 'Backend unreachable'
  }
})

async function writeLog() {
  busy.value = true
  status.value = ''
  try {
    const r = await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: message.value }),
    })
    const j = await r.json()
    if (j.ok) status.value = `Inserted Id=${j.id}, CreatedAt=${j.createdAt}`
    else status.value = `Error: ${j.error}`
  } catch (e) {
    status.value = `Network error: ${e}`
  } finally {
    busy.value = false
  }
}
</script>
