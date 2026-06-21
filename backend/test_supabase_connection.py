import socket
import ssl
import sys
import httpx
from urllib.parse import urlparse
from app.core.config import settings

def check_dns(hostname):
    print(f"[*] Checking DNS resolution for {hostname}...")
    try:
        ip = socket.gethostbyname(hostname)
        print(f"[+] DNS resolved successfully: {ip}")
        return True
    except socket.gaierror as e:
        print(f"[-] DNS resolution failed: {e}")
        return False

def check_https(hostname):
    print(f"[*] Checking HTTPS connectivity to {hostname}...")
    try:
        context = ssl.create_default_context()
        with socket.create_connection((hostname, 443), timeout=5) as sock:
            with context.wrap_socket(sock, server_hostname=hostname) as ssock:
                print(f"[+] HTTPS connection successful. SSL/TLS version: {ssock.version()}")
        return True
    except Exception as e:
        print(f"[-] HTTPS connection failed: {e}")
        return False

def check_endpoint(url, name, headers=None):
    print(f"[*] Checking {name} endpoint: {url}")
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.get(url, headers=headers)
            print(f"[+] {name} reached successfully. Status: {response.status_code}")
            return True
    except httpx.TimeoutException:
        print(f"[-] {name} check timed out.")
        return False
    except Exception as e:
        print(f"[-] {name} check failed: {e}")
        return False

def run_diagnostics():
    print("--- Supabase Connection Diagnostics ---")
    print(f"Python version: {sys.version}")
    url = settings.SUPABASE_URL
    print(f"Loaded SUPABASE_URL: {url}")
    
    parsed = urlparse(url)
    hostname = parsed.hostname
    
    if not hostname:
        print("[-] Invalid SUPABASE_URL format.")
        return
        
    if not check_dns(hostname):
        return
        
    if not check_https(hostname):
        return
        
    # Check Auth Endpoint
    # We strip trailing slash if any
    base_url = url.rstrip('/')
    auth_url = f"{base_url}/auth/v1/health"
    check_endpoint(auth_url, "Supabase Auth")
    
    # Check REST Endpoint
    rest_url = f"{base_url}/rest/v1/"
    headers = {
        "apikey": settings.SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_ANON_KEY}"
    }
    check_endpoint(rest_url, "Supabase REST", headers=headers)
    
if __name__ == "__main__":
    run_diagnostics()
