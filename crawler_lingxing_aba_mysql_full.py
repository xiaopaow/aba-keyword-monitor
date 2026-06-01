#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import base64
import gzip
import hashlib
import json
import time
import zipfile
from pathlib import Path
from typing import Dict, Iterable, Iterator, Optional, Tuple

import ijson
import pymysql
import requests
from Crypto.Cipher import AES

HOST = "https://openapi.lingxing.com"
TOKEN_PATH = "/api/auth-server/oauth/access-token"
ABA_REPORT_PATH = "/pb/openapi/newad/abaReport"
BLOCK_SIZE = 16
BATCH_SIZE = 5000


def pkcs5_pad(text: str) -> bytes:
    pad_len = BLOCK_SIZE - len(text.encode("utf-8")) % BLOCK_SIZE
    return (text + chr(pad_len) * pad_len).encode("utf-8")


def md5_upper(text: str) -> str:
    return hashlib.md5(text.encode("utf-8")).hexdigest().upper()


def canonical_params(params: dict) -> str:
    items = []
    for key in sorted(params.keys()):
        value = params[key]
        if value is None or value == "":
            continue
        if isinstance(value, (dict, list)):
            value = json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        items.append(f"{key}={value}")
    return "&".join(items)


def generate_sign(app_id: str, params: dict) -> str:
    digest = md5_upper(canonical_params(params))
    cipher = AES.new(app_id.encode("utf-8"), AES.MODE_ECB)
    encrypted = cipher.encrypt(pkcs5_pad(digest))
    return base64.b64encode(encrypted).decode("utf-8")


def detect_file_type(path: Path) -> str:
    head = path.read_bytes()[:8]
    if head.startswith(b"PK\x03\x04"):
        return "zip"
    if head.startswith(b"\x1f\x8b"):
        return "gz"
    if head.startswith(b"{") or head.startswith(b"["):
        return "json"
    if head.startswith(b"<"):
        return "xml"
    return "unknown"


def get_access_token(app_id: str, app_secret: str) -> str:
    response = requests.post(
        HOST + TOKEN_PATH,
        files={"appId": (None, app_id), "appSecret": (None, app_secret)},
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if str(payload.get("code")) != "200":
        raise RuntimeError(f"Get token failed: {payload}")
    token = payload.get("data", {}).get("access_token")
    if not token:
        raise RuntimeError(f"Missing access_token: {payload}")
    return token


def request_report_url(app_id: str, token: str, country: str, data_start_time: str) -> str:
    timestamp = str(int(time.time()))
    body = {"country": country, "data_start_time": data_start_time}
    sign_source = {**body, "access_token": token, "app_key": app_id, "timestamp": timestamp}
    sign = generate_sign(app_id, sign_source)
    query = {"access_token": token, "app_key": app_id, "timestamp": timestamp, "sign": sign}

    response = requests.post(
        HOST + ABA_REPORT_PATH,
        params=query,
        json=body,
        headers={"X-API-VERSION": "2", "Content-Type": "application/json"},
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json()
    if int(payload.get("code", -1)) != 0:
        raise RuntimeError(f"Request report failed: {payload}")
    url = payload.get("data", {}).get("url")
    if not url:
        raise RuntimeError(f"Missing download url: {payload}")
    return url


def download_report(url: str, output_dir: Path, data_start_time: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    tmp_path = output_dir / "aba_report.tmp"

    with requests.get(url, stream=True, timeout=300) as response:
        response.raise_for_status()
        with tmp_path.open("wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    file.write(chunk)

    file_type = detect_file_type(tmp_path)
    suffix = data_start_time.replace("-", "")
    final_path = {
        "zip": output_dir / f"aba_report_{suffix}.zip",
        "json": output_dir / f"aba_report_{suffix}.json",
        "gz": output_dir / f"aba_report_{suffix}.gz",
        "xml": output_dir / "aba_report_error.xml",
    }.get(file_type, output_dir / "aba_report.bin")

    if final_path.exists():
        final_path.unlink()
    tmp_path.rename(final_path)
    return final_path


def extract_zip(zip_path: Path, output_dir: Path) -> Path:
    extract_dir = output_dir / "aba_extract"
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        archive.extractall(extract_dir)
    return extract_dir


def find_json_file(folder: Path) -> Path:
    for path in folder.rglob("*.json"):
        return path
    raise FileNotFoundError("zip 内未找到 json 文件")


def gunzip_file(gz_path: Path, output_dir: Path) -> Path:
    json_path = output_dir / f"{gz_path.stem}.json"
    with gzip.open(gz_path, "rb") as source:
        with json_path.open("wb") as target:
            while True:
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                target.write(chunk)
    return json_path


def resolve_json_path(downloaded_path: Path, output_dir: Path) -> Path:
    file_type = detect_file_type(downloaded_path)
    print("File type:", file_type)
    if file_type == "zip":
        return find_json_file(extract_zip(downloaded_path, output_dir))
    if file_type == "json":
        return downloaded_path
    if file_type == "gz":
        return gunzip_file(downloaded_path, output_dir)
    if file_type == "xml":
        print(downloaded_path.read_text(encoding="utf-8", errors="ignore")[:2000])
        raise SystemExit("下载到的是 XML 错误文件，可能是签名过期或权限错误，请重新运行")
    raise SystemExit("未知文件格式，无法处理")


def parse_report_meta(json_path: Path) -> Dict[str, object]:
    with json_path.open("rb") as file:
        spec = next(ijson.items(file, "reportSpecification"), None)
    if not spec:
        raise RuntimeError("JSON 缺少 reportSpecification")

    options = spec.get("reportOptions") or {}
    marketplaces = spec.get("marketplaceIds") or ["ATVPDKIKX0DER"]
    return {
        "report_period": options.get("reportPeriod") or "WEEK",
        "report_start_date": spec.get("dataStartTime"),
        "report_end_date": spec.get("dataEndTime"),
        "marketplace_id": marketplaces[0] if marketplaces else "ATVPDKIKX0DER",
    }


def normalize_text(value: object, max_len: Optional[int] = None) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_len] if max_len else text


def normalize_int(value: object) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def normalize_float(value: object) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def iter_aba_rows(json_path: Path, meta: Dict[str, object]) -> Iterator[Tuple[object, ...]]:
    with json_path.open("rb") as file:
        for item in ijson.items(file, "dataByDepartmentAndSearchTerm.item"):
            search_term = normalize_text(item.get("searchTerm"), 500)
            rank = normalize_int(item.get("searchFrequencyRank"))
            if not search_term or not rank:
                continue
            yield (
                meta["report_start_date"],
                meta["report_end_date"],
                meta["report_period"],
                meta["marketplace_id"],
                normalize_text(item.get("departmentName"), 255),
                search_term,
                rank,
                normalize_text(item.get("clickedAsin"), 50),
                normalize_text(item.get("clickedItemName")),
                normalize_int(item.get("clickShareRank")),
                normalize_float(item.get("clickShare")),
                normalize_float(item.get("conversionShare")),
            )


def mysql_connect():
    conn = pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        charset="utf8mb4",
        autocommit=True,
    )
    with conn.cursor() as cursor:
        cursor.execute(f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DB}` DEFAULT CHARSET utf8mb4 COLLATE utf8mb4_unicode_ci;")
    conn.close()

    return pymysql.connect(
        host=MYSQL_HOST,
        port=MYSQL_PORT,
        user=MYSQL_USER,
        password=MYSQL_PASSWORD,
        database=MYSQL_DB,
        charset="utf8mb4",
        autocommit=True,
    )


def quote_identifier(name: str) -> str:
    safe = name.replace("`", "``")
    return f"`{safe}`"


def create_table_if_not_exists(conn, table_name: str):
    table = quote_identifier(table_name)
    sql = f"""
    CREATE TABLE IF NOT EXISTS {table} (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        report_start_date DATE NOT NULL,
        report_end_date DATE,
        report_period VARCHAR(20) DEFAULT 'WEEK',
        marketplace_id VARCHAR(50) DEFAULT 'ATVPDKIKX0DER',
        department_name VARCHAR(255),
        search_term VARCHAR(500) NOT NULL,
        search_frequency_rank INT NOT NULL,
        clicked_asin VARCHAR(50),
        clicked_item_name TEXT,
        click_share_rank INT,
        click_share DECIMAL(12, 6),
        conversion_share DECIMAL(12, 6),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_report_term_product (report_start_date, search_term, click_share_rank, clicked_asin),
        INDEX idx_search_term (search_term),
        INDEX idx_rank (search_frequency_rank),
        INDEX idx_asin (clicked_asin),
        INDEX idx_click_rank (click_share_rank),
        INDEX idx_report_start (report_start_date),
        INDEX idx_term_rank (search_term, click_share_rank)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    """
    with conn.cursor() as cursor:
        cursor.execute(sql)
    migrate_table_if_needed(conn, table_name)


def column_exists(conn, table_name: str, column_name: str) -> bool:
    sql = """
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = %s
      AND column_name = %s;
    """
    with conn.cursor() as cursor:
        cursor.execute(sql, (table_name, column_name))
        return cursor.fetchone()[0] > 0


def index_exists(conn, table_name: str, index_name: str) -> bool:
    sql = """
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = %s
      AND index_name = %s;
    """
    with conn.cursor() as cursor:
        cursor.execute(sql, (table_name, index_name))
        return cursor.fetchone()[0] > 0


def run_ddl(conn, sql: str):
    with conn.cursor() as cursor:
        cursor.execute(sql)


def add_column_if_missing(conn, table_name: str, column_name: str, definition: str):
    if not column_exists(conn, table_name, column_name):
        run_ddl(conn, f"ALTER TABLE {quote_identifier(table_name)} ADD COLUMN {column_name} {definition};")


def add_index_if_missing(conn, table_name: str, index_name: str, definition: str):
    if not index_exists(conn, table_name, index_name):
        run_ddl(conn, f"ALTER TABLE {quote_identifier(table_name)} ADD {definition};")


def drop_index_if_exists(conn, table_name: str, index_name: str):
    if index_exists(conn, table_name, index_name):
        run_ddl(conn, f"ALTER TABLE {quote_identifier(table_name)} DROP INDEX {index_name};")


def migrate_table_if_needed(conn, table_name: str):
    """Upgrade old rank-only tables so full ABA rows can be inserted."""
    table = quote_identifier(table_name)
    add_column_if_missing(conn, table_name, "report_start_date", "DATE NULL")
    add_column_if_missing(conn, table_name, "report_end_date", "DATE NULL")
    add_column_if_missing(conn, table_name, "report_period", "VARCHAR(20) DEFAULT 'WEEK'")
    add_column_if_missing(conn, table_name, "marketplace_id", "VARCHAR(50) DEFAULT 'ATVPDKIKX0DER'")
    add_column_if_missing(conn, table_name, "department_name", "VARCHAR(255) NULL")
    add_column_if_missing(conn, table_name, "clicked_asin", "VARCHAR(50) NULL")
    add_column_if_missing(conn, table_name, "clicked_item_name", "TEXT NULL")
    add_column_if_missing(conn, table_name, "click_share_rank", "INT NULL")
    add_column_if_missing(conn, table_name, "click_share", "DECIMAL(12, 6) NULL")
    add_column_if_missing(conn, table_name, "conversion_share", "DECIMAL(12, 6) NULL")
    add_column_if_missing(conn, table_name, "updated_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")

    if column_exists(conn, table_name, "report_date"):
        run_ddl(conn, f"UPDATE {table} SET report_start_date = COALESCE(report_start_date, report_date);")
        run_ddl(conn, f"ALTER TABLE {table} MODIFY report_date DATE NULL;")

    run_ddl(conn, f"ALTER TABLE {table} MODIFY search_term VARCHAR(500) NOT NULL;")
    run_ddl(conn, f"ALTER TABLE {table} MODIFY report_start_date DATE NOT NULL;")

    # Old tables used UNIQUE(report_date, search_term), which prevents the 3 product rows per keyword.
    drop_index_if_exists(conn, table_name, "uk_report_term")
    add_index_if_missing(
        conn,
        table_name,
        "uk_report_term_product",
        "UNIQUE KEY uk_report_term_product (report_start_date, search_term, click_share_rank, clicked_asin)"
    )
    add_index_if_missing(conn, table_name, "idx_search_term", "INDEX idx_search_term (search_term)")
    add_index_if_missing(conn, table_name, "idx_rank", "INDEX idx_rank (search_frequency_rank)")
    add_index_if_missing(conn, table_name, "idx_asin", "INDEX idx_asin (clicked_asin)")
    add_index_if_missing(conn, table_name, "idx_click_rank", "INDEX idx_click_rank (click_share_rank)")
    add_index_if_missing(conn, table_name, "idx_report_start", "INDEX idx_report_start (report_start_date)")
    add_index_if_missing(conn, table_name, "idx_term_rank", "INDEX idx_term_rank (search_term, click_share_rank)")


def insert_rows(conn, table_name: str, rows: Iterable[Tuple[object, ...]]) -> int:
    table = quote_identifier(table_name)
    sql = f"""
    INSERT INTO {table} (
        report_start_date,
        report_end_date,
        report_period,
        marketplace_id,
        department_name,
        search_term,
        search_frequency_rank,
        clicked_asin,
        clicked_item_name,
        click_share_rank,
        click_share,
        conversion_share
    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    ON DUPLICATE KEY UPDATE
        report_end_date = VALUES(report_end_date),
        report_period = VALUES(report_period),
        marketplace_id = VALUES(marketplace_id),
        department_name = VALUES(department_name),
        search_frequency_rank = VALUES(search_frequency_rank),
        clicked_item_name = VALUES(clicked_item_name),
        click_share = VALUES(click_share),
        conversion_share = VALUES(conversion_share),
        updated_at = CURRENT_TIMESTAMP;
    """
    total = 0
    batch = []
    with conn.cursor() as cursor:
        for row in rows:
            batch.append(row)
            if len(batch) >= BATCH_SIZE:
                cursor.executemany(sql, batch)
                total += len(batch)
                print(f"Inserted {total:,} rows...")
                batch.clear()
        if batch:
            cursor.executemany(sql, batch)
            total += len(batch)
            print(f"Inserted {total:,} rows...")
    return total


def main():
    if not APP_ID or not APP_SECRET or "xxx" in APP_ID:
        raise SystemExit("请先填写 APP_ID 和 APP_SECRET")

    output_dir = Path(OUTPUT_DIR)
    table_suffix = DATA_START_TIME.replace("-", "")
    table_name = f"aba_search_terms_{table_suffix}"
    print(f"Target table: {table_name}")

    print("1) Getting access_token...")
    token = get_access_token(APP_ID, APP_SECRET)

    print("2) Requesting ABA report url...")
    url = request_report_url(APP_ID, token, COUNTRY, DATA_START_TIME)
    print("Download URL:", url)

    print("3) Downloading report...")
    downloaded_path = download_report(url, output_dir, DATA_START_TIME)
    print("Downloaded:", downloaded_path)
    json_path = resolve_json_path(downloaded_path, output_dir)
    print("JSON:", json_path)

    print("4) Reading report metadata...")
    meta = parse_report_meta(json_path)
    print("Report:", meta)

    print("5) Connecting MySQL...")
    conn = mysql_connect()
    try:
        print("6) Creating table if not exists...")
        create_table_if_not_exists(conn, table_name)

        print("7) Streaming JSON rows into MySQL...")
        total = insert_rows(conn, table_name, iter_aba_rows(json_path, meta))
    finally:
        conn.close()

    print(f"Done. {total:,} rows written to {MYSQL_DB}.{table_name}")


if __name__ == "__main__":
    MYSQL_HOST = "127.0.0.1"
    MYSQL_PORT = 3306
    MYSQL_USER = "root"
    MYSQL_PASSWORD = "root"
    MYSQL_DB = "lingxing"

    APP_ID = ""
    APP_SECRET = ""
    COUNTRY = "US"
    DATA_START_TIME = "2026-05-24"
    OUTPUT_DIR = "output"
    main()
