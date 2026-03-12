import sqlite3
import os

DB_PATH = 'return_system_v2.db'

def alter_db():
    if not os.path.exists(DB_PATH):
        print(f"Database file '{DB_PATH}' not found!")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # Add batch_name to return_plan
        print("Checking return_plan table...")
        cursor.execute("PRAGMA table_info(return_plan)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'batch_name' not in columns:
            cursor.execute("ALTER TABLE return_plan ADD COLUMN batch_name VARCHAR DEFAULT '기본차수'")
            print("Added 'batch_name' column to 'return_plan' table.")
        else:
            print("'batch_name' already exists in 'return_plan'.")

        # Add batch_name to scan_record
        print("Checking scan_record table...")
        cursor.execute("PRAGMA table_info(scan_record)")
        columns = [col[1] for col in cursor.fetchall()]
        if 'batch_name' not in columns:
            cursor.execute("ALTER TABLE scan_record ADD COLUMN batch_name VARCHAR DEFAULT '기본차수'")
            print("Added 'batch_name' column to 'scan_record' table.")
        else:
            print("'batch_name' already exists in 'scan_record'.")

        # Create indices for better performance since we query by batch_name
        try:
            cursor.execute("CREATE INDEX ix_return_plan_batch_name ON return_plan (batch_name)")
            print("Created index on return_plan.batch_name")
        except sqlite3.OperationalError:
            print("Index ix_return_plan_batch_name already exists.")

        try:
            cursor.execute("CREATE INDEX ix_scan_record_batch_name ON scan_record (batch_name)")
            print("Created index on scan_record.batch_name")
        except sqlite3.OperationalError:
            print("Index ix_scan_record_batch_name already exists.")

        conn.commit()
        print("Database alter completely successfully.")
    except Exception as e:
        print(f"Error altering database: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    alter_db()
