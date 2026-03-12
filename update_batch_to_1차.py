import sqlite3

def migrate_existing_data_to_first_batch(db_path='return_system_v2.db'):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    try:
        # Update existing records to '1차' where batch_name is null, empty, or '기본차수'
        cursor.execute("UPDATE return_plan SET batch_name = '1차' WHERE batch_name IS NULL OR batch_name = '' OR batch_name = '기본차수'")
        plan_updated = cursor.rowcount
        print(f"Updated {plan_updated} rows in return_plan table to '1차'.")

        cursor.execute("UPDATE scan_record SET batch_name = '1차' WHERE batch_name IS NULL OR batch_name = '' OR batch_name = '기본차수'")
        scan_updated = cursor.rowcount
        print(f"Updated {scan_updated} rows in scan_record table to '1차'.")

        conn.commit()
        print("Successfully migrated existing data to '1차' batch.")
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_existing_data_to_first_batch()
