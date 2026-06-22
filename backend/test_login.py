from supabase import create_client

url = "https://zxoavlkrqktrikebegrl.supabase.co"
anon_key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4b2F2bGtycWt0cmlrZWJlZ3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwMjI5MzIsImV4cCI6MjA5NzU5ODkzMn0.XHi-BOcF6Cj1k2O_eYmqEKkJ6IAHBaV0A4Ib-0as360"
print(url)
supabase = create_client(url, anon_key)

response = supabase.auth.sign_in_with_password({
    "email": "test2@example.com",
    "password": "123456"
})

print(response.session.access_token)