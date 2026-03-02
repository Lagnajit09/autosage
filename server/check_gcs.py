import os
from google.cloud import storage

def load_env(file_path):
    """Simple parser to load .env variables."""
    if not os.path.exists(file_path):
        return
    with open(file_path, "r") as f:
        for line in f:
            if "=" in line and not line.startswith("#"):
                key, value = line.strip().split("=", 1)
                # Remove quotes if present
                value = value.strip('"').strip("'")
                os.environ[key] = value

def check_gcs():
    print("--- GCS Connection Check ---")
    
    # Load .env to set GOOGLE_APPLICATION_CREDENTIALS
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    load_env(env_path)
    
    creds_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        print("❌ GOOGLE_APPLICATION_CREDENTIALS not found in environment or .env file.")
        return

    print(f"📍 Using credentials from: {creds_path}")
    if not os.path.exists(creds_path):
        print(f"❌ Credentials file does not exist at {creds_path}")
        return

    try:
        # Initialize the storage client
        client = storage.Client()
        
        target_buckets = ["autosagex-drive", "autosagex-logs"]
        test_filename = "connection_test.txt"
        test_content = "Connection test successful!"
        
        print("\nChecking bucket connectivity (Upload/Read Test)...")
        
        for bucket_name in target_buckets:
            print(f"\n--- Bucket: {bucket_name} ---")
            try:
                bucket = client.bucket(bucket_name)
                
                # Upload Test
                print(f"⬆️ Uploading '{test_filename}'...")
                blob = bucket.blob(test_filename)
                upload_status = blob.upload_from_string(test_content)
                print(f"✅ Upload successful. {upload_status}")
                
                # Read Test
                print(f"⬇️ Reading '{test_filename}'...")
                downloaded_content = blob.download_as_text()
                if downloaded_content == test_content:
                    print(f"✅ Read successful. Content matches: '{downloaded_content}'")
                else:
                    print(f"❌ Read failed. Content mismatch.")
                
                # Optional: Cleanup
                blob.delete()
                print(f"🧹 Cleanup: Deleted '{test_filename}'")

            except Exception as e:
                print(f"❌ Failed for bucket {bucket_name}: {e}")
        
        print("\n--- Summary ---")
        print("Verification complete. Check logs above for individual bucket results.")

    except Exception as e:
        print(f"❌ Error connecting to GCS: {e}")

if __name__ == "__main__":
    check_gcs()
