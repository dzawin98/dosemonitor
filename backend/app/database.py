from sqlalchemy import create_engine
from sqlalchemy.engine import url as sa_url
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os
import pymysql

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dose_management.db")

def _ensure_mysql_database_exists(database_url: str):
    try:
        parsed = sa_url.make_url(database_url)
        if parsed.get_backend_name() == 'mysql' and parsed.get_driver_name() == 'pymysql':
            db_name = parsed.database
            host = parsed.host or 'localhost'
            port = parsed.port or 3306
            username = parsed.username or 'root'
            password = parsed.password or ''
            # Connect without database and create if missing
            conn = pymysql.connect(host=host, port=port, user=username, password=password)
            try:
                with conn.cursor() as cur:
                    cur.execute(f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
                conn.commit()
            finally:
                conn.close()
    except Exception:
        # Silent fail to not block app start; errors will surface on connect
        pass

# Ensure MySQL database exists (if using MySQL)
_ensure_mysql_database_exists(DATABASE_URL)

# Create engine
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL)

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class
Base = declarative_base()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()