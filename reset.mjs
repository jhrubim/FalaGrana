const response = await fetch('https://wczaslkidlxzxkvamwch.supabase.co/auth/v1/admin/users/e1fceee4-9ab1-405e-8edd-d54530731a0e', {
  method: 'PUT',
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjemFzbGtpZGx4enhrdmFtd2NoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU4NTgxNCwiZXhwIjoyMDg3MTYxODE0fQ.Mj3vUO1yBmRzDW4XbqWP2ujA8dVdIT-iiK0816kyJTM',
			    	 
	'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjemFzbGtpZGx4enhrdmFtd2NoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTU4NTgxNCwiZXhwIjoyMDg3MTYxODE0fQ.Mj3vUO1yBmRzDW4XbqWP2ujA8dVdIT-iiK0816kyJTM',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ password: '@FalaGrana802326' })
})

const data = await response.json()
console.log(data)

