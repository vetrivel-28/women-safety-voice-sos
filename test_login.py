from supabase import create_client

url = "https://your-project.supabase.co/rest/v1/"
anon_key = "your-anon-key"

supabase = create_client(url, anon_key)

response = supabase.auth.sign_in_with_password({
    "email": "test@example.com",
    "password": "your-password"
})

print(response.session.access_token)