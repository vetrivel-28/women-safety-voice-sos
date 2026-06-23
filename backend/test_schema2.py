import os
from supabase import create_client

def main():
    env_dict = dict(line.strip().split('=', 1) for line in open('.env') if line.strip() and not line.startswith('#'))
    url = env_dict['SUPABASE_URL']
    key = env_dict['SUPABASE_SERVICE_ROLE_KEY']
    
    supabase = create_client(url, key)
    
    res = supabase.table("sos_alerts").select("*").limit(1).execute()
    if res.data:
        print("COLUMNS FROM DATA:")
        for k in res.data[0].keys():
            print(k)
    else:
        print("NO DATA")

if __name__ == '__main__':
    main()
