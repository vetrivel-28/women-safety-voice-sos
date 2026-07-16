import asyncio
from supabase import create_client
import os

from dotenv import load_dotenv
load_dotenv(".env")

url = os.getenv("SUPABASE_URL")
key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(url, key)

def delete_orphans():
    # Hardcoded list of the 7 orphans we found earlier
    orphans = [
        ("7c59dfe5-2ec7-4512-928f-655aa8b7f258", "surya010203456@gmail.com"),
        ("38b42548-9b7a-4105-a817-0abf72217dfb", "2403717673822009@cit.edu.in"),
        ("2baf4f5c-efe6-4108-b8dd-a037c7f421fb", "2403717673822003@cit.edu.in"),
        ("caae448c-9857-4d4c-b279-68918c1dfc86", "jenniferajasekar@gmail.com"),
        ("be5c9857-2a0d-4d88-803c-55975b0c922a", "alangarammeena@gmail.com"),
        ("6927e6ef-4f7e-4553-af31-5d461313ff19", "annie10a.2006@gmail.com"),
        ("60eded43-24a8-460f-9c34-30f4cca3aba7", "anniesherlyn02@gmail.com"),
    ]
    
    print("Starting targeted deletion of 7 orphaned accounts...")
    
    for uid, email in orphans:
        print(f"\nTarget: {email} (UUID: {uid})")
        try:
            # 1. Attempt deletion
            supabase.auth.admin.delete_user(uid)
            print(f" -> Deletion command executed.")
            
            # 2. Verify deletion via fresh query
            try:
                # get_user_by_id raises an exception if the user is not found
                user = supabase.auth.admin.get_user_by_id(uid)
                print(f" -> VERIFICATION FAILED: User {uid} still exists in auth.users!")
            except Exception as get_err:
                # If an error is raised, it likely means the user is gone
                if "User not found" in str(get_err) or "404" in str(get_err) or "not_found" in str(get_err):
                    print(f" -> VERIFICATION SUCCESS: Confirmed {uid} is completely removed from auth.users.")
                else:
                    print(f" -> VERIFICATION UNKNOWN ERROR: {get_err}")
                
        except Exception as e:
            print(f" -> ERROR deleting {email}: {e}")

if __name__ == "__main__":
    delete_orphans()
