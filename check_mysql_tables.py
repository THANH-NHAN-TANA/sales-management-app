import mysql.connector
from mysql.connector import Error

def check_database_tables():
    try:
        # Thông tin kết nối database (thay bằng thông tin của bạn)
        connection = mysql.connector.connect(
            host='cstore.cju6ggoikqtr.ap-southeast-1.rds.amazonaws.com',
            port='3308',
            user='admin',
            password='12345678',
            database='store'
        )
        
        if connection.is_connected():
            print("Đã kết nối thành công đến MySQL database")
            
            cursor = connection.cursor()
            
            # Lấy danh sách tất cả các bảng
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()
            
            print("\nDanh sách các bảng trong database:")
            print("-" * 50)
            
            for table in tables:
                table_name = table[0]
                print(f"\nBảng: {table_name}")
                
                # Đếm số dòng (sử dụng backtick để tránh lỗi với reserved keywords)
                cursor.execute(f"SELECT COUNT(*) FROM `{table_name}`")
                row_count = cursor.fetchone()[0]
                print(f"Số dòng: {row_count}")
                
                # Lấy 5 dòng đầu tiên (nếu có)
                if row_count > 0:
                    cursor.execute(f"SELECT * FROM `{table_name}` LIMIT 5")
                    rows = cursor.fetchall()
                    
                    # Lấy thông tin cột (sử dụng backtick để tránh lỗi với reserved keywords)
                    cursor.execute(f"SHOW COLUMNS FROM `{table_name}`")
                    columns = [column[0] for column in cursor.fetchall()]
                    
                    print("Các cột:", columns)
                    print("Dữ liệu mẫu (tối đa 5 dòng):")
                    for row in rows:
                        print(row)
                else:
                    print("Bảng rỗng")
                
                print("-" * 50)
            
    except Error as e:
        print(f"Lỗi khi kết nối đến MySQL: {e}")
    
    finally:
        if 'connection' in locals() and connection.is_connected():
            cursor.close()
            connection.close()
            print("\nĐã đóng kết nối đến MySQL database")

if __name__ == "__main__":
    check_database_tables()