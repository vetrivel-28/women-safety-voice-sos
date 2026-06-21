from supabase import create_client

url = "https://your-project.supabase.co"
anon_key = "your-anon-key"
print(url)
supabase = create_client(url, anon_key)

response = supabase.auth.sign_in_with_password({
    "email": "test@example.com",
    "password": "your-password"
})

print(response.session.access_token)