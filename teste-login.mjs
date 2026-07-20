// teste-login.mjs
const response = await fetch('https://jycezdwcbsoyfpdhbyqm.supabase.co/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp5Y2V6ZHdjYnNveWZwZGhieXFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2MDAyODksImV4cCI6MjA4NzE3NjI4OX0.4_QDE0nG30NReU4V_BXgQSidTZuvSv3bOiLgBfy23cs',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'jhrubim@gmail.com',
    password: '@FalaGrana802326'
  })
})

const data = await response.json()
console.log(data)