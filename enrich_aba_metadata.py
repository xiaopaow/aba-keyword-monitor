#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import html
import json
import os
import re
import time
import urllib.parse
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import pymysql
import requests


HTTP_SESSION = requests.Session()
HTTP_SESSION.trust_env = False

MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "root")
MYSQL_DB = os.getenv("MYSQL_DATABASE", "lingxing")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")

DEEPL_URL = "https://dict.deepl.com/english-chinese/search"
DEEPL_HEADERS = {
    "accept": "text/html",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6",
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded",
    "origin": "https://www.deepl.com",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "referer": "https://www.deepl.com/",
    "sec-ch-ua": '"Chromium";v="148", "Microsoft Edge";v="148", "Not/A)Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-site",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0"
    ),
}
DEEPL_PARAMS = {
    "ajax": "1",
    "source": "english",
    "onlyDictEntries": "1",
    "translator": "dnsof7h3k2lgh3gda",
    "kind": "full",
    "eventkind": "keyup",
    "forleftside": "true",
    "il": "zh",
}

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
)
VALID_IMAGE_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
MIN_VALID_IMAGE_BYTES = 5 * 1024


def mysql_connect():
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
    if not re.fullmatch(r"[A-Za-z0-9_]+", name):
        raise ValueError(f"Unsafe table name: {name}")
    return f"`{name}`"


def create_metadata_tables(conn):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS `aba_keyword_explanations` (
                search_term VARCHAR(500) NOT NULL PRIMARY KEY,
                cn_explanation VARCHAR(255),
                source VARCHAR(50) DEFAULT 'ai',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS `aba_asin_assets` (
                asin VARCHAR(50) NOT NULL PRIMARY KEY,
                title TEXT,
                image_url TEXT,
                source VARCHAR(50) DEFAULT 'amazon_page',
                fetched_at TIMESTAMP NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_fetched_at (fetched_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            """
        )


def latest_week_table(conn) -> str:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name REGEXP '^aba_search_terms_[0-9]{8}$'
            ORDER BY table_name DESC
            LIMIT 1;
            """
        )
        row = cursor.fetchone()
    if not row:
        raise RuntimeError("未找到 aba_search_terms_YYYYMMDD 周表")
    return row[0]


def get_columns(conn, table_name: str) -> set:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = %s;
            """,
            (table_name,),
        )
        return {row[0] for row in cursor.fetchall()}


def fetch_terms_needing_explanation(conn, table_name: str, limit: int, retranslate_source: str = "") -> List[str]:
    table = quote_identifier(table_name)
    fetch_limit = max(limit * 8, limit + 50)
    with conn.cursor() as cursor:
        if retranslate_source:
            cursor.execute(
                f"""
                SELECT c.search_term
                FROM {table} c
                JOIN `aba_keyword_explanations` e ON e.search_term = c.search_term
                WHERE c.search_term IS NOT NULL
                  AND c.search_term <> ''
                  AND e.source = %s
                ORDER BY c.search_frequency_rank ASC, c.search_term ASC
                LIMIT %s;
                """,
                (retranslate_source, fetch_limit),
            )
        else:
            cursor.execute(
                f"""
                SELECT c.search_term
                FROM {table} c
                LEFT JOIN `aba_keyword_explanations` e ON e.search_term = c.search_term
                WHERE c.search_term IS NOT NULL
                  AND c.search_term <> ''
                  AND (e.search_term IS NULL OR e.cn_explanation IS NULL OR e.cn_explanation = '')
                ORDER BY c.search_frequency_rank ASC, c.search_term ASC
                LIMIT %s;
                """,
                (fetch_limit,),
            )
        terms: List[str] = []
        seen = set()
        for row in cursor.fetchall():
            term = row[0]
            if term in seen:
                continue
            seen.add(term)
            terms.append(term)
            if len(terms) >= limit:
                break
        return terms


def chunks(values: Sequence[str], size: int) -> Iterable[List[str]]:
    for index in range(0, len(values), size):
        yield list(values[index:index + size])


def extract_json_object(text: str) -> Dict[str, str]:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, flags=re.S)
    if fenced:
        text = fenced.group(1)
    else:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            text = text[start:end + 1]
    parsed = json.loads(text)
    if not isinstance(parsed, dict):
        raise ValueError("AI 返回不是 JSON object")
    return {str(key): str(value).strip() for key, value in parsed.items() if str(value).strip()}


def generate_openai_explanations(batch: List[str]) -> Dict[str, str]:
    if not OPENAI_API_KEY:
        return {}

    prompt = (
        "你是亚马逊 ABA 搜索词分析助手。请把每个英文搜索词生成中文解释，"
        "偏用户搜索意图，6到20个中文字符，保留品牌名和专有名词。"
        "只返回 JSON object，key 必须与输入搜索词完全一致，value 是中文解释。\n\n"
        f"搜索词：{json.dumps(batch, ensure_ascii=False)}"
    )
    response = HTTP_SESSION.post(
        f"{OPENAI_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
        json={
            "model": OPENAI_MODEL,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": "只输出合法 JSON，不要解释。"},
                {"role": "user", "content": prompt},
            ],
        },
        timeout=90,
    )
    response.raise_for_status()
    payload = response.json()
    content = payload["choices"][0]["message"]["content"]
    return extract_json_object(content)


def translate_with_deepl(term: str) -> Optional[str]:
    response = HTTP_SESSION.post(
        DEEPL_URL,
        headers=DEEPL_HEADERS,
        params=DEEPL_PARAMS,
        data={"query": term},
        timeout=20,
    )
    response.raise_for_status()
    match = re.search(
        r"href=['\"]/%E4%B8%AD%E6%96%87-%E8%8B%B1%E8%AF%AD/%E7%BF%BB%E8%AD%AF/([^'\"]+?)\.html['\"]",
        response.text,
    )
    if not match:
        return None

    value = urllib.parse.unquote(match.group(1))
    value = value.replace("-", " ")
    value = html.unescape(value).strip()
    return value or None


def generate_deepl_explanations(terms: List[str], sleep_seconds: float) -> Dict[str, str]:
    translations: Dict[str, str] = {}
    for index, term in enumerate(terms, start=1):
        try:
            translation = translate_with_deepl(term)
            if translation:
                translations[term] = translation
                print(f"[deepl {index}/{len(terms)}] {term} -> {translation}")
            else:
                print(f"[deepl {index}/{len(terms)}] {term} missing")
        except Exception as error:
            print(f"[deepl {index}/{len(terms)}] {term} failed: {error}")
        time.sleep(max(0, sleep_seconds))
    return translations


def upsert_explanations(conn, explanations: Dict[str, str], source: str):
    if not explanations:
        return
    sql = """
    INSERT INTO `aba_keyword_explanations` (search_term, cn_explanation, source)
    VALUES (%s, %s, %s)
    ON DUPLICATE KEY UPDATE
      cn_explanation = VALUES(cn_explanation),
      source = VALUES(source);
    """
    rows = [(term, explanation, source) for term, explanation in explanations.items()]
    with conn.cursor() as cursor:
        cursor.executemany(sql, rows)


def normalize_asin(value: object) -> Optional[str]:
    if value is None:
        return None
    asin = str(value).strip().upper()
    return asin if asin else None


def fetch_asins_from_normalized_table(conn, table_name: str, limit: int) -> List[Tuple[str, str]]:
    table = quote_identifier(table_name)
    fetch_limit = max(limit * 8, limit + 50)
    with conn.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT c.clicked_asin, c.clicked_item_name AS title
            FROM {table} c
            LEFT JOIN `aba_asin_assets` a ON a.asin = c.clicked_asin
            WHERE c.clicked_asin IS NOT NULL
              AND c.clicked_asin <> ''
              AND c.click_share_rank BETWEEN 1 AND 3
              AND (a.asin IS NULL OR a.image_url IS NULL OR a.image_url = '')
            ORDER BY c.search_frequency_rank ASC, c.click_share_rank ASC
            LIMIT %s;
            """,
            (fetch_limit,),
        )
        asins: List[Tuple[str, str]] = []
        seen = set()
        for row in cursor.fetchall():
            asin = normalize_asin(row[0])
            if not asin or asin in seen:
                continue
            seen.add(asin)
            asins.append((asin, row[1] or ""))
            if len(asins) >= limit:
                break
        return asins


def fetch_asins_from_wide_table(conn, table_name: str, limit: int) -> List[Tuple[str, str]]:
    table = quote_identifier(table_name)
    fetch_limit = max(limit * 8, limit + 50)
    with conn.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT x.asin, x.title
            FROM (
                SELECT product1_asin AS asin, product1_item_name AS title, search_frequency_rank FROM {table}
                UNION ALL
                SELECT product2_asin AS asin, product2_item_name AS title, search_frequency_rank FROM {table}
                UNION ALL
                SELECT product3_asin AS asin, product3_item_name AS title, search_frequency_rank FROM {table}
            ) x
            LEFT JOIN `aba_asin_assets` a ON a.asin = x.asin
            WHERE x.asin IS NOT NULL
              AND x.asin <> ''
              AND (a.asin IS NULL OR a.image_url IS NULL OR a.image_url = '')
            ORDER BY x.search_frequency_rank ASC
            LIMIT %s;
            """,
            (fetch_limit,),
        )
        asins: List[Tuple[str, str]] = []
        seen = set()
        for row in cursor.fetchall():
            asin = normalize_asin(row[0])
            if not asin or asin in seen:
                continue
            seen.add(asin)
            asins.append((asin, row[1] or ""))
            if len(asins) >= limit:
                break
        return asins


def fetch_asins_needing_image(conn, table_name: str, limit: int) -> List[Tuple[str, str]]:
    columns = get_columns(conn, table_name)
    if {"clicked_asin", "clicked_item_name", "click_share_rank"}.issubset(columns):
        return fetch_asins_from_normalized_table(conn, table_name, limit)
    if {"product1_asin", "product2_asin", "product3_asin"}.issubset(columns):
        return fetch_asins_from_wide_table(conn, table_name, limit)
    raise RuntimeError(f"{table_name} 没有可识别的 ASIN 字段")


def decode_js_string(value: str) -> str:
    try:
        return json.loads(f'"{value}"')
    except Exception:
        return value


def extract_image_url(page_html: str) -> Optional[str]:
    patterns = [
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
        r'src=["\'](https://m\.media-amazon\.com/images/I/[^"\']+\.(?:jpg|jpeg|png|webp))["\']',
        r'src=["\'](https://[^"\']*\.media-amazon\.com/images/I/[^"\']+\.(?:jpg|jpeg|png|webp))["\']',
        r'background(?:-image)?\s*:\s*url\(["\']?(https://[^)"\']*\.media-amazon\.com/images/I/[^)"\']+\.(?:jpg|jpeg|png|webp))',
        r'(https:\\/\\/[^"\\]+\.media-amazon\.com\\/images\\/I\\/[^"\\]+\.(?:jpg|jpeg|png|webp))',
        r'"landingImage"\s*:\s*"([^"]+)"',
        r'"hiRes"\s*:\s*"([^"]+)"',
        r'"large"\s*:\s*"([^"]+)"',
    ]
    for pattern in patterns:
        match = re.search(pattern, page_html, flags=re.I | re.S)
        if match:
            url = html.unescape(decode_js_string(match.group(1))).replace("\\/", "/")
            if url.startswith("http"):
                return url
    return None


def is_valid_image_url(url: str) -> bool:
    try:
        with HTTP_SESSION.get(
            url,
            headers={"User-Agent": USER_AGENT, "Accept": "image/avif,image/webp,image/png,image/jpeg,image/*,*/*"},
            timeout=20,
            stream=True,
        ) as response:
            content_type = response.headers.get("content-type", "").split(";")[0].strip().lower()
            content_length = response.headers.get("content-length")
            if response.status_code != 200:
                print(f"Invalid image {url}: HTTP {response.status_code}")
                return False
            if content_type not in VALID_IMAGE_CONTENT_TYPES:
                print(f"Invalid image {url}: content-type {content_type or '-'}")
                return False
            if content_length and int(content_length) < MIN_VALID_IMAGE_BYTES:
                print(f"Invalid image {url}: content-length {content_length}")
                return False

            downloaded = 0
            for chunk in response.iter_content(chunk_size=8192):
                if not chunk:
                    continue
                downloaded += len(chunk)
                if downloaded >= MIN_VALID_IMAGE_BYTES:
                    return True
            print(f"Invalid image {url}: body only {downloaded} bytes")
            return False
    except Exception as error:
        print(f"Invalid image {url}: {error}")
        return False


def valid_or_none(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    return url if is_valid_image_url(url) else None


def fetch_amazon_image_url(asin: str) -> Optional[str]:
    url = f"https://www.amazon.com/dp/{asin}/ref=olp-opf-redir?aod=1&ie=UTF8&condition=ALL"
    response = HTTP_SESSION.get(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        timeout=30,
    )
    if response.status_code >= 400:
        print(f"Image fetch failed {asin}: HTTP {response.status_code}")
        return fetch_direct_asin_image_url(asin)
    image_url = extract_image_url(response.text)
    if valid_or_none(image_url):
        return image_url
    if "captcha" in response.text.lower():
        print(f"Image page captcha {asin}; fallback to direct ASIN image")
    return fetch_direct_asin_image_url(asin)


def fetch_direct_asin_image_url(asin: str) -> Optional[str]:
    url = f"https://m.media-amazon.com/images/P/{asin}.01._SCLZZZZZZZ_.jpg"
    return valid_or_none(url)


def clean_invalid_cached_images(conn, limit: int):
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT asin, image_url
            FROM `aba_asin_assets`
            WHERE image_url IS NOT NULL
              AND image_url <> ''
            ORDER BY updated_at DESC
            LIMIT %s;
            """,
            (limit,),
        )
        rows = cursor.fetchall()

    cleaned = 0
    for index, (asin, image_url) in enumerate(rows, start=1):
        if is_valid_image_url(str(image_url)):
            print(f"[clean {index}/{len(rows)}] {asin} ok")
            continue
        with conn.cursor() as cursor:
            cursor.execute(
                """
                UPDATE `aba_asin_assets`
                SET image_url = NULL, fetched_at = NOW()
                WHERE asin = %s;
                """,
                (asin,),
            )
        cleaned += 1
        print(f"[clean {index}/{len(rows)}] {asin} cleared")
    print(f"Cleaned invalid image cache: {cleaned}/{len(rows)}")


def upsert_asin_asset(conn, asin: str, title: str, image_url: Optional[str]):
    sql = """
    INSERT INTO `aba_asin_assets` (asin, title, image_url, source, fetched_at)
    VALUES (%s, %s, %s, 'amazon_page', NOW())
    ON DUPLICATE KEY UPDATE
      title = COALESCE(VALUES(title), title),
      image_url = VALUES(image_url),
      source = VALUES(source),
      fetched_at = VALUES(fetched_at);
    """
    with conn.cursor() as cursor:
        cursor.execute(sql, (asin, title or None, image_url))


def column_exists(conn, table_name: str, column_name: str) -> bool:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = %s
              AND column_name = %s;
            """,
            (table_name, column_name),
        )
        return cursor.fetchone()[0] > 0


def index_exists(conn, table_name: str, index_name: str) -> bool:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.statistics
            WHERE table_schema = DATABASE()
              AND table_name = %s
              AND index_name = %s;
            """,
            (table_name, index_name),
        )
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


def rebuild_row_numbers(conn, table_name: str):
    add_column_if_missing(conn, table_name, "row_no", "BIGINT NULL")
    table = quote_identifier(table_name)
    print("Building row_no index for fast deep page jumps...")
    run_ddl(
        conn,
        f"""
        UPDATE {table} t
        JOIN (
            SELECT id, ROW_NUMBER() OVER (ORDER BY search_frequency_rank ASC, search_term ASC) AS rn
            FROM {table}
        ) ranked ON ranked.id = t.id
        SET t.row_no = ranked.rn;
        """,
    )
    add_index_if_missing(conn, table_name, "idx_row_no", "INDEX idx_row_no (row_no)")
    print("row_no index ready.")



def cli_main():
    parser = argparse.ArgumentParser(description="Enrich ABA keyword translations and ASIN image cache")
    parser.add_argument("--table", default="", help="Week table name, for example aba_search_terms_20260524. Defaults to latest.")
    parser.add_argument("--limit-keywords", type=int, default=200, help="Maximum keyword translations to generate this run")
    parser.add_argument("--limit-asins", type=int, default=200, help="Maximum ASIN image records to check this run")
    parser.add_argument("--translator", choices=["deepl", "openai"], default="deepl", help="Keyword explanation source, default deepl")
    parser.add_argument("--retranslate-source", default="", help="Retranslate existing explanations from this source, for example youdao")
    parser.add_argument("--ai-batch-size", type=int, default=50, help="OpenAI batch size")
    parser.add_argument("--keyword-sleep", type=float, default=0.3, help="Seconds to wait between dictionary translation requests")
    parser.add_argument("--sleep", type=float, default=1.5, help="Seconds to wait between Amazon image requests")
    parser.add_argument("--clean-invalid-images", action="store_true", help="Clear cached invalid or blank image URLs")
    parser.add_argument("--clean-limit", type=int, default=1000, help="Maximum cached image rows to validate this run")
    parser.add_argument("--ensure-row-no", action="store_true", help="Build row_no values and index for fast deep page jumps")
    parser.add_argument("--skip-keywords", action="store_true", help="Skip keyword translations")
    parser.add_argument("--skip-ai", action="store_true", help="Backward-compatible alias for --skip-keywords")
    parser.add_argument("--skip-images", action="store_true", help="Skip ASIN image cache")
    args = parser.parse_args()

    conn = mysql_connect()
    try:
        create_metadata_tables(conn)
        table_name = args.table or latest_week_table(conn)
        print(f"Using table: {table_name}")

        if args.clean_invalid_images:
            clean_invalid_cached_images(conn, args.clean_limit)

        if args.ensure_row_no:
            rebuild_row_numbers(conn, table_name)

        skip_keywords = args.skip_keywords or args.skip_ai
        if not skip_keywords:
            terms = fetch_terms_needing_explanation(conn, table_name, args.limit_keywords, args.retranslate_source.strip())
            print(f"Need keyword explanations: {len(terms):,}")

            if args.translator == "deepl":
                explanations = generate_deepl_explanations(terms, args.keyword_sleep)
                upsert_explanations(conn, explanations, "deepl")
                print(f"Saved DeepL explanations: {len(explanations):,}")
            else:
                if not OPENAI_API_KEY:
                    print("OPENAI_API_KEY is not set; skipping OpenAI explanations.")
                else:
                    for batch in chunks(terms, max(1, args.ai_batch_size)):
                        explanations = generate_openai_explanations(batch)
                        upsert_explanations(conn, explanations, "ai")
                        print(f"Saved OpenAI explanations: {len(explanations):,}")

        if not args.skip_images:
            asins = fetch_asins_needing_image(conn, table_name, args.limit_asins)
            print(f"Need ASIN images: {len(asins):,}")
            for index, (asin, title) in enumerate(asins, start=1):
                try:
                    image_url = fetch_amazon_image_url(asin)
                    upsert_asin_asset(conn, asin, title, image_url)
                    status = "ok" if image_url else "missing"
                    print(f"[{index}/{len(asins)}] {asin} {status}")
                except Exception as error:
                    upsert_asin_asset(conn, asin, title, None)
                    print(f"[{index}/{len(asins)}] {asin} failed: {error}")
                time.sleep(max(0, args.sleep))
    finally:
        conn.close()


if __name__ == "__main__":
    cli_main()
