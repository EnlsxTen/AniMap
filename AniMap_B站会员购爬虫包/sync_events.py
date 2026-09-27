#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Sync Bilibili Member Purchase show/convention events into AniMap.

One command does:
  scrape -> geocode with AMap -> insert into PostgreSQL

Configuration is read only from environment variables:
  AMAP_WEB_SERVICE_KEY
  DB_HOST DB_PORT DB_NAME DB_USER DB_PASSWORD

Optional environment variables:
  ANIMAP_DB_SCHEMA          default: public
  ANIMAP_EVENTS_TABLE       default: events
  ANIMAP_IMPORT_USER_ID     users.id used as the owner of imported events
"""

from __future__ import annotations

import argparse
import dataclasses
import datetime as dt
import hashlib
import html as html_lib
import json
import logging
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


def configure_text_output() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


try:
    import requests
except ImportError as exc:  # pragma: no cover - deployment dependency check
    raise SystemExit("Missing dependency: requests. Run setup_cron.sh or pip install requests.") from exc

try:
    from bs4 import BeautifulSoup
except ImportError as exc:  # pragma: no cover - deployment dependency check
    raise SystemExit("Missing dependency: beautifulsoup4. Run setup_cron.sh or pip install beautifulsoup4.") from exc

try:
    import psycopg2
    from psycopg2 import sql
except ImportError:
    psycopg2 = None
    sql = None


DEFAULT_HOME_URL = "https://show.bilibili.com/platform/home.html"
BILIBILI_REFERER = "https://show.bilibili.com/"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 AniMapSync/1.0"
)

REQUEST_INTERVAL_SECONDS = 2.0
GEOCODE_INTERVAL_SECONDS = 0.5
EVENT_SCOPE_CONVENTION = "convention"
EVENT_SCOPE_ALL = "all"

CONVENTION_KEYWORDS = (
    "漫展",
    "动漫",
    "国漫",
    "同人",
    "二次元",
    "acg",
    "cos",
    "comic",
    "only",
    "兽聚",
    "痛车",
    "手办",
)

NON_CONVENTION_CATEGORY_KEYWORDS = (
    ("脱口秀", ("脱口秀", "喜剧")),
    ("演出", ("演出", "音乐节", "音乐会", "演唱会", "live", "地下偶像", "偶像", "乐队", "剧场", "舞台剧", "话剧")),
)

BILIBILI_CITY_AREA_IDS = {
    # 直辖市
    "北京": 110100,
    "天津": 120100,
    "上海": 310100,
    "重庆": 500100,
    # 河北
    "石家庄": 130100,
    "唐山": 130200,
    "秦皇岛": 130300,
    "邯郸": 130400,
    "保定": 130600,
    "张家口": 130700,
    "承德": 130800,
    "廊坊": 131000,
    # 山西
    "太原": 140100,
    "大同": 140200,
    # 内蒙古
    "呼和浩特": 150100,
    "包头": 150200,
    # 辽宁
    "沈阳": 210100,
    "大连": 210200,
    "鞍山": 210300,
    "抚顺": 210400,
    # 吉林
    "长春": 220100,
    "吉林": 220200,
    # 黑龙江
    "哈尔滨": 230100,
    "齐齐哈尔": 230200,
    # 江苏
    "南京": 320100,
    "无锡": 320200,
    "徐州": 320300,
    "常州": 320400,
    "苏州": 320500,
    "南通": 320600,
    "连云港": 320700,
    "淮安": 320800,
    "盐城": 320900,
    "扬州": 321000,
    "镇江": 321100,
    "泰州": 321200,
    "宿迁": 321300,
    # 浙江
    "杭州": 330100,
    "宁波": 330200,
    "温州": 330300,
    "嘉兴": 330400,
    "湖州": 330500,
    "绍兴": 330600,
    "金华": 330700,
    "衢州": 330800,
    "舟山": 330900,
    "台州": 331000,
    "丽水": 331100,
    # 安徽
    "合肥": 340100,
    "芜湖": 340200,
    "蚌埠": 340300,
    "淮南": 340400,
    "马鞍山": 340500,
    "淮北": 340600,
    "铜陵": 340700,
    "安庆": 340800,
    "黄山": 341000,
    # 福建
    "福州": 350100,
    "厦门": 350200,
    "莆田": 350300,
    "三明": 350400,
    "泉州": 350500,
    "漳州": 350600,
    "南平": 350700,
    # 江西
    "南昌": 360100,
    "景德镇": 360200,
    "萍乡": 360300,
    "九江": 360400,
    "赣州": 360700,
    # 山东
    "济南": 370100,
    "青岛": 370200,
    "淄博": 370300,
    "枣庄": 370400,
    "东营": 370500,
    "烟台": 370600,
    "潍坊": 370700,
    "济宁": 370800,
    "泰安": 370900,
    "威海": 371000,
    "日照": 371100,
    "临沂": 371300,
    "德州": 371400,
    "聊城": 371500,
    # 河南
    "郑州": 410100,
    "开封": 410200,
    "洛阳": 410300,
    "平顶山": 410400,
    "安阳": 410500,
    "新乡": 410700,
    "焦作": 410800,
    "许昌": 411000,
    "漯河": 411100,
    # 湖北
    "武汉": 420100,
    "黄石": 420200,
    "十堰": 420300,
    "宜昌": 420500,
    "襄阳": 420600,
    "荆州": 421000,
    # 湖南
    "长沙": 430100,
    "株洲": 430200,
    "湘潭": 430300,
    "衡阳": 430400,
    "岳阳": 430600,
    "常德": 430700,
    # 广东
    "广州": 440100,
    "韶关": 440200,
    "深圳": 440300,
    "珠海": 440400,
    "汕头": 440500,
    "佛山": 440600,
    "江门": 440700,
    "湛江": 440800,
    "茂名": 440900,
    "惠州": 441300,
    "梅州": 441400,
    "汕尾": 441500,
    "河源": 441600,
    "阳江": 441700,
    "清远": 441800,
    "东莞": 441900,
    "中山": 442000,
    # 广西
    "南宁": 450100,
    "柳州": 450200,
    "桂林": 450300,
    # 海南
    "海口": 460100,
    "三亚": 460200,
    # 四川
    "成都": 510100,
    "自贡": 510300,
    "攀枝花": 510400,
    "泸州": 510500,
    "德阳": 510600,
    "绵阳": 510700,
    "广元": 510800,
    "遂宁": 510900,
    "内江": 511000,
    "乐山": 511100,
    "南充": 511300,
    "眉山": 511400,
    "宜宾": 511500,
    "雅安": 511800,
    # 贵州
    "贵阳": 520100,
    "遵义": 520300,
    # 云南
    "昆明": 530100,
    "曲靖": 530300,
    "玉溪": 530400,
    # 陕西
    "西安": 610100,
    "铜川": 610200,
    "宝鸡": 610300,
    "咸阳": 610400,
    "渭南": 610500,
    "汉中": 610700,
    # 甘肃
    "兰州": 620100,
    # 青海
    "西宁": 630100,
    # 宁夏
    "银川": 640100,
    # 新疆
    "乌鲁木齐": 650100,
    # 西藏
    "拉萨": 540100,
}


@dataclasses.dataclass
class EventItem:
    name: str
    start_time: dt.datetime
    end_time: dt.datetime
    city: Optional[str]
    venue_name: str
    address: str
    ticket_price: Optional[str]
    poster_url: Optional[str]
    source_url: str
    category: str = "漫展"
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@dataclasses.dataclass
class ColumnInfo:
    name: str
    data_type: str
    is_nullable: bool
    default: Optional[str]
    is_identity: bool
    is_generated: bool


class RateLimiter:
    def __init__(self, seconds: float) -> None:
        self.seconds = seconds
        self.last_at = 0.0

    def wait(self) -> None:
        now = time.monotonic()
        remaining = self.seconds - (now - self.last_at)
        if remaining > 0:
            time.sleep(remaining)
        self.last_at = time.monotonic()


request_limiter = RateLimiter(REQUEST_INTERVAL_SECONDS)
geocode_limiter = RateLimiter(GEOCODE_INTERVAL_SECONDS)


def normalize_text(value: Any) -> str:
    text = html_lib.unescape(str(value or ""))
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_url(url: Optional[str], base_url: Optional[str] = None) -> Optional[str]:
    if not url:
        return None
    value = html_lib.unescape(url.strip().strip("'\""))
    if value.startswith("//"):
        return "https:" + value
    if value.startswith("http://") or value.startswith("https://"):
        return value
    if base_url and not value.startswith("data:"):
        return urllib.parse.urljoin(base_url, value)
    return value


def strip_bilibili_image_size(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    # Bilibili image URLs often append @350w_466h.jpeg. Keeping it works,
    # but stripping makes the source stable across card/detail pages.
    return re.sub(r"@\d+w_\d+h\.(?:jpe?g|png|webp)$", "", url, flags=re.I)


def extract_background_url(style: Optional[str], base_url: Optional[str] = None) -> Optional[str]:
    if not style:
        return None
    style = html_lib.unescape(style)
    match = re.search(r"url\((['\"]?)(.*?)\1\)", style)
    if not match:
        return None
    return strip_bilibili_image_size(normalize_url(match.group(2), base_url))


def saved_from_url(html: str) -> Optional[str]:
    header = html[:4096]
    match = re.search(r"saved from url=\((\d+)\)(.*?)-->", header, flags=re.I | re.S)
    if match:
        length = int(match.group(1))
        return normalize_url(match.group(2).strip()[:length])

    match = re.search(r"saved from url=\((.*?)\)\s*-->", header, flags=re.I | re.S)
    if match:
        return normalize_url(match.group(1).strip())
    return None


def stable_offline_url(base_url: Optional[str], *parts: str) -> str:
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
    if base_url and base_url.startswith("http"):
        separator = "&" if "#" in base_url else "#"
        return f"{base_url}{separator}animap-{digest}"
    return f"bilibili://offline/{digest}"


def infer_city(name: str = "", address: str = "", explicit: Optional[str] = None) -> Optional[str]:
    if explicit:
        return normalize_city(explicit)
    name = normalize_text(name)
    if "·" in name:
        head = normalize_text(name.split("·", 1)[0])
        if 1 < len(head) <= 8:
            return normalize_city(head)
    for pattern in (r"([\u4e00-\u9fa5]{2,8})市", r"([\u4e00-\u9fa5]{2,8})省\s*([\u4e00-\u9fa5]{2,8})"):
        match = re.search(pattern, address)
        if match:
            return normalize_city(match.group(match.lastindex or 1))
    return None


def normalize_city(city: str) -> str:
    city = normalize_text(city)
    return city[:-1] if city.endswith("市") else city


def bilibili_area_for_city(city: Optional[str]) -> int:
    if not city:
        return -1
    return BILIBILI_CITY_AREA_IDS.get(normalize_city(city), -1)


def city_matches(event: EventItem, city_filter: Optional[str]) -> bool:
    if not city_filter:
        return True
    wanted = normalize_city(city_filter)
    haystack = " ".join(
        filter(None, [event.city, event.name, event.address, event.venue_name])
    )
    return wanted in haystack


def parse_event_scope(value: str) -> str:
    normalized = normalize_text(value).lower()
    aliases = {
        "convention": EVENT_SCOPE_CONVENTION,
        "manzhan": EVENT_SCOPE_CONVENTION,
        "anime": EVENT_SCOPE_CONVENTION,
        "comic": EVENT_SCOPE_CONVENTION,
        "漫展": EVENT_SCOPE_CONVENTION,
        "只抓漫展": EVENT_SCOPE_CONVENTION,
        "all": EVENT_SCOPE_ALL,
        "both": EVENT_SCOPE_ALL,
        "全部": EVENT_SCOPE_ALL,
        "所有": EVENT_SCOPE_ALL,
        "一起": EVENT_SCOPE_ALL,
        "两个": EVENT_SCOPE_ALL,
    }
    scope = aliases.get(normalized)
    if not scope:
        raise argparse.ArgumentTypeError("event scope must be convention/manzhan/漫展 or all/both/全部")
    return scope


def is_convention_text(text: str) -> bool:
    normalized = normalize_text(text).lower()
    return any(keyword.lower() in normalized for keyword in CONVENTION_KEYWORDS)


def infer_event_category(name: str, venue: str = "", address: str = "", raw_category: Any = None) -> str:
    raw_text = normalize_text(raw_category)
    combined = " ".join(filter(None, [raw_text, name, venue, address]))
    if is_convention_text(combined):
        return "漫展"

    normalized = combined.lower()
    for category, keywords in NON_CONVENTION_CATEGORY_KEYWORDS:
        if any(keyword.lower() in normalized for keyword in keywords):
            return category
    if raw_text and raw_text not in {"全部类型", "全部"} and not re.fullmatch(r"\d+(?:\.\d+)?", raw_text):
        return raw_text
    return "其他活动"


def event_in_scope(event: EventItem, event_scope: str) -> bool:
    if event_scope == EVENT_SCOPE_ALL:
        return True
    return event.category == "漫展" or is_convention_text(
        " ".join(filter(None, [event.name, event.venue_name, event.address]))
    )


def filter_events_by_scope(events: Sequence[EventItem], event_scope: str) -> List[EventItem]:
    if event_scope == EVENT_SCOPE_ALL:
        return list(events)
    return [event for event in events if event_in_scope(event, event_scope)]


def parse_datetime_value(value: Any, prefer_end_of_day: bool = False) -> Optional[dt.datetime]:
    if value is None:
        return None
    if isinstance(value, dt.datetime):
        return value.replace(tzinfo=None)
    if isinstance(value, (int, float)):
        timestamp = float(value)
        if timestamp > 10_000_000_000:
            timestamp /= 1000.0
        return dt.datetime.fromtimestamp(timestamp)

    text = normalize_text(value)
    if not text:
        return None
    if re.fullmatch(r"\d{10,13}", text):
        return parse_datetime_value(int(text), prefer_end_of_day)

    text = text.replace("年", "-").replace("月", "-").replace("日", "")
    text = text.replace(".", "-").replace("/", "-")
    match = re.search(
        r"(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?",
        text,
    )
    if not match:
        return None
    year, month, day = (int(match.group(i)) for i in range(1, 4))
    if match.group(4):
        hour, minute = int(match.group(4)), int(match.group(5))
        second = int(match.group(6) or 0)
    elif prefer_end_of_day:
        hour, minute, second = 23, 59, 59
    else:
        hour, minute, second = 0, 0, 0
    return dt.datetime(year, month, day, hour, minute, second)


def parse_time_range(text: str) -> Tuple[Optional[dt.datetime], Optional[dt.datetime]]:
    raw = normalize_text(text)
    if not raw:
        return None, None
    cleaned = (
        raw.replace("（以现场为准）", "")
        .replace("(以现场为准)", "")
        .replace("年", "-")
        .replace("月", "-")
        .replace("日", "")
        .replace(".", "-")
        .replace("/", "-")
    )
    full_matches = list(
        re.finditer(
            r"(\d{4}-\d{1,2}-\d{1,2})(?:[ T]+(\d{1,2}:\d{2}(?::\d{2})?))?",
            cleaned,
        )
    )
    if not full_matches:
        return None, None

    start_text = " ".join(filter(None, full_matches[0].groups()))
    start = parse_datetime_value(start_text)

    if len(full_matches) >= 2:
        end_text = " ".join(filter(None, full_matches[1].groups()))
        end = parse_datetime_value(end_text, prefer_end_of_day=not bool(full_matches[1].group(2)))
        return start, end

    tail = cleaned[full_matches[0].end() :]
    time_only = re.search(r"[-~—–至到]\s*(\d{1,2}:\d{2}(?::\d{2})?)", tail)
    if start and time_only:
        bits = [int(x) for x in time_only.group(1).split(":")]
        while len(bits) < 3:
            bits.append(0)
        end = start.replace(hour=bits[0], minute=bits[1], second=bits[2])
        if end <= start:
            end += dt.timedelta(days=1)
        return start, end

    end = parse_datetime_value(start_text, prefer_end_of_day=True)
    return start, end


def summarize_prices(values: Iterable[str]) -> Optional[str]:
    prices: List[str] = []
    for value in values:
        text = normalize_text(value)
        for price in re.findall(r"¥\s*\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*元", text):
            normalized = price.replace(" ", "")
            if not normalized.startswith("¥"):
                normalized = normalized.replace("元", "")
                normalized = f"¥{normalized}"
            if normalized not in prices:
                prices.append(normalized)
    if prices:
        return " / ".join(prices)
    return None


def make_event(raw: Dict[str, Any], fallback_source: Optional[str] = None) -> Optional[EventItem]:
    name = normalize_text(raw.get("name") or raw.get("title"))
    if not name:
        return None

    start = parse_datetime_value(raw.get("start_time"))
    end = parse_datetime_value(raw.get("end_time"), prefer_end_of_day=True)
    if not start or not end:
        start, end = parse_time_range(str(raw.get("time_text") or ""))
    if not start:
        logging.warning("Skip %s: cannot parse start time from %r", name, raw.get("time_text"))
        return None
    if not end or end <= start:
        end = start + dt.timedelta(hours=23, minutes=59, seconds=59)

    venue_name = normalize_text(raw.get("venue_name") or raw.get("venue") or raw.get("address"))
    address = normalize_text(raw.get("address") or venue_name)
    city = infer_city(name=name, address=address, explicit=raw.get("city"))
    category = infer_event_category(
        name=name,
        venue=venue_name,
        address=address,
        raw_category=raw.get("category") or raw.get("event_type") or raw.get("type_name") or raw.get("p_type"),
    )

    source_url = normalize_url(raw.get("source_url")) or fallback_source
    if not source_url:
        source_url = stable_offline_url(None, name, str(start), venue_name)

    desc_parts = []
    if venue_name and address and venue_name != address:
        desc_parts.append(f"活动地点：{venue_name}，{address}")
    elif venue_name or address:
        desc_parts.append(f"活动地点：{venue_name or address}")
    if category and category not in ("漫展", "其他活动"):
        desc_parts.append(f"活动类型：{category}")
    description = "\n".join(desc_parts) if desc_parts else None

    return EventItem(
        name=name,
        start_time=start,
        end_time=end,
        city=city,
        venue_name=venue_name or address,
        address=address or venue_name,
        ticket_price=normalize_text(raw.get("ticket_price") or "") or None,
        poster_url=strip_bilibili_image_size(normalize_url(raw.get("poster_url") or raw.get("cover"))),
        source_url=source_url,
        category=category,
        description=description,
        latitude=to_float(raw.get("latitude")),
        longitude=to_float(raw.get("longitude")),
    )


def to_float(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_bilibili_coordinate(value: Any) -> Tuple[Optional[float], Optional[float]]:
    if not value:
        return None, None
    try:
        if isinstance(value, str):
            parsed = json.loads(value)
        elif isinstance(value, dict):
            parsed = value
        else:
            return None, None
        lng_text, lat_text = str(parsed.get("coor", "")).split(",", 1)
        return float(lat_text), float(lng_text)
    except Exception:
        return None, None


def normalize_bilibili_price(value: Any) -> Optional[str]:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        amount = float(value)
        if amount >= 100:
            amount /= 100.0
        return f"¥{amount:g}起"
    return summarize_prices([str(value)]) or normalize_text(value)


def read_local_html(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def parse_basic_info(soup: BeautifulSoup) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for li in soup.select(".activity-info-body li"):
        divs = li.find_all("div", recursive=False)
        if len(divs) >= 2:
            label = normalize_text(divs[0].get_text(" ", strip=True))
            value = normalize_text(divs[1].get_text(" ", strip=True))
            if label:
                result[label] = value
    return result


def parse_detail_html(html: str, target: Optional[str] = None) -> List[EventItem]:
    soup = BeautifulSoup(html, "html.parser")
    base_url = target if target and target.startswith("http") else saved_from_url(html)
    source_url = saved_from_url(html) or (target if target and target.startswith("http") else None)

    title = normalize_text(
        first_text(soup, [".product-info-name .title", ".project-name", "title"])
    )
    if not title:
        return []

    basic = parse_basic_info(soup)
    top_address = first_text(soup, [".address-name"])
    basic_address = basic.get("场馆地址")
    if basic_address and top_address and top_address not in basic_address:
        address = f"{basic_address} {top_address}"
    else:
        address = basic_address or top_address

    raw = {
        "name": title,
        "time_text": basic.get("活动日期") or first_text(soup, [".product-info-time"]),
        "venue_name": first_text(soup, [".vuene-name", ".venue-name"]),
        "address": address,
        "ticket_price": summarize_prices(
            item.get_text(" ", strip=True) for item in soup.select(".tickets .selectable-option")
        ),
        "poster_url": extract_background_url(
            (soup.select_one(".detail-img-icon") or {}).get("style"), base_url
        ),
        "source_url": source_url,
    }
    event = make_event(raw, fallback_source=source_url)
    return [event] if event else []


def parse_list_html(html: str, target: Optional[str] = None) -> List[EventItem]:
    soup = BeautifulSoup(html, "html.parser")
    base_url = target if target and target.startswith("http") else saved_from_url(html)
    events: List[EventItem] = []

    for card in soup.select(".project-list-item"):
        title = first_text(card, [".project-list-item-title"])
        time_text = first_text(card, [".project-list-item-time"])
        venue = first_text(card, [".venue-name-and-address"])
        price = summarize_prices([first_text(card, [".project-list-item-price"])])
        img = card.select_one(".project-list-item-img")
        href_node = card.find_parent("a", href=True) or card.find("a", href=True)
        source_url = normalize_url(href_node["href"], base_url) if href_node else None
        fallback = stable_offline_url(base_url, title, time_text, venue)
        raw = {
            "name": title,
            "time_text": time_text,
            "venue_name": venue,
            "address": venue,
            "ticket_price": price,
            "poster_url": extract_background_url(img.get("style") if img else None, base_url),
            "source_url": source_url or fallback,
        }
        event = make_event(raw, fallback_source=fallback)
        if event:
            events.append(event)
    return events


def parse_html_events(html: str, target: Optional[str] = None) -> List[EventItem]:
    detail_events = parse_detail_html(html, target)
    if detail_events:
        return detail_events
    return parse_list_html(html, target)


def first_text(root: Any, selectors: Sequence[str]) -> Optional[str]:
    for selector in selectors:
        node = root.select_one(selector)
        if node:
            text = normalize_text(node.get_text(" ", strip=True))
            if text:
                return text
    return None


def http_get(url: str, params: Optional[Dict[str, Any]] = None) -> requests.Response:
    request_limiter.wait()
    response = requests.get(
        url,
        params=params,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json,text/html;q=0.9,*/*;q=0.8",
            "Referer": DEFAULT_HOME_URL,
        },
        timeout=30,
    )
    response.raise_for_status()
    return response


def fetch_html(url: str) -> str:
    response = http_get(url)
    response.encoding = response.apparent_encoding or "utf-8"
    return response.text


def fetch_json(url: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    response = http_get(url, params=params)
    return response.json()


def render_with_playwright(url: str) -> str:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError("Playwright is not installed. Run setup_cron.sh or pip install playwright.") from exc

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(user_agent=USER_AGENT)
        page.goto(url, wait_until="networkidle", timeout=60_000)
        try:
            page.wait_for_selector(".project-list-item, .product-info-name", timeout=10_000)
        except Exception:
            pass
        html = page.content()
        browser.close()
        return html


def find_project_arrays(obj: Any) -> List[List[Dict[str, Any]]]:
    arrays: List[Tuple[int, List[Dict[str, Any]]]] = []
    event_keys = {
        "project_id",
        "project_name",
        "venue_name",
        "start_time",
        "end_time",
        "city",
        "city_name",
        "cover",
        "jump_url",
        "third_category_name",
    }

    def walk(value: Any) -> None:
        if isinstance(value, list):
            dicts = [item for item in value if isinstance(item, dict)]
            if len(dicts) >= 1:
                score = 0
                for item in dicts[:5]:
                    keys = set(item.keys())
                    score += len(keys & event_keys)
                if score > 0:
                    arrays.append((score, dicts))
            for item in value:
                walk(item)
        elif isinstance(value, dict):
            for item in value.values():
                walk(item)

    walk(obj)
    arrays.sort(key=lambda item: (item[0], len(item[1])), reverse=True)
    return [items for _, items in arrays]


def pick_direct(data: Dict[str, Any], keys: Sequence[str]) -> Any:
    lowered = {str(k).lower(): k for k in data.keys()}
    for key in keys:
        if key in data and data[key] not in (None, ""):
            return data[key]
        original = lowered.get(key.lower())
        if original is not None and data[original] not in (None, ""):
            return data[original]
    return None


def item_to_raw_event(item: Dict[str, Any]) -> Dict[str, Any]:
    project_id = pick_direct(item, ["id", "project_id", "projectId"])
    source_url = None
    if project_id:
        source_url = f"https://show.bilibili.com/platform/detail.html?id={project_id}&from=pc_ticketlist"

    cover = pick_direct(item, ["cover", "img", "img_url", "image", "poster", "banner"])
    price = pick_direct(item, ["price_str", "price_low", "price", "min_price"])
    price = normalize_bilibili_price(price)
    lat, lng = parse_bilibili_coordinate(pick_direct(item, ["coordinate", "coords", "location"]))

    return {
        "id": project_id,
        "name": pick_direct(item, ["name", "project_name", "title"]),
        "time_text": pick_direct(
            item,
            [
                "performance_desc",
                "time_desc",
                "show_time",
                "date_desc",
                "duration",
                "screen_desc",
            ],
        ),
        "start_time": pick_direct(item, ["start_time", "startTime", "begin_time", "stime"]),
        "end_time": pick_direct(item, ["end_time", "endTime", "finish_time", "etime"]),
        "city": pick_direct(item, ["city_name", "city", "area_name", "province_city"]),
        "venue_name": pick_direct(item, ["venue_name", "venue", "place", "venueName"]),
        "address": pick_direct(item, ["address", "venue_address", "addr", "venueAddr"]),
        "ticket_price": price,
        "category": pick_direct(
            item,
            [
                "category",
                "category_name",
                "cate_name",
                "type",
                "type_name",
                "p_type",
                "project_type",
                "project_type_name",
                "third_category_name",
                "second_category_name",
                "first_category_name",
            ],
        ),
        "poster_url": normalize_url(str(cover)) if cover else None,
        "source_url": pick_direct(item, ["url", "jump_url", "detail_url"]) or source_url,
        "latitude": pick_direct(item, ["lat", "latitude"]) or lat,
        "longitude": pick_direct(item, ["lng", "longitude", "lon"]) or lng,
    }


def merge_raw_event(base: Dict[str, Any], detail: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(base)
    for key, value in detail.items():
        if value not in (None, ""):
            merged[key] = value
    return merged


def fetch_detail_raw(project_id: Any) -> Dict[str, Any]:
    if not project_id:
        return {}
    endpoints = [
        "https://show.bilibili.com/api/ticket/project/getV2",
        "https://show.bilibili.com/api/ticket/project/get",
    ]
    for endpoint in endpoints:
        try:
            data = fetch_json(endpoint, params={"version": 134, "id": project_id})
            payload = data.get("data") if isinstance(data, dict) else None
            if isinstance(payload, dict):
                return item_to_raw_event(payload)
        except Exception as exc:
            logging.debug("Detail API failed for %s via %s: %s", project_id, endpoint, exc)
    return {}


def raw_event_needs_detail(raw: Dict[str, Any]) -> bool:
    has_time = bool(raw.get("start_time") or raw.get("time_text"))
    has_place = bool(raw.get("venue_name") or raw.get("address"))
    has_location = raw.get("latitude") is not None and raw.get("longitude") is not None
    return not (raw.get("name") and has_time and has_place and raw.get("source_url") and has_location)


def scrape_bilibili_api(max_pages: int, event_scope: str, city_filter: Optional[str] = None) -> List[EventItem]:
    events: List[EventItem] = []
    endpoint = "https://show.bilibili.com/api/ticket/project/listV2"
    seen_sources: set[str] = set()
    area = bilibili_area_for_city(city_filter)

    for page in range(1, max_pages + 1):
        params = {
            "version": 134,
            "page": page,
            "pagesize": 16,
            "area": area,
            "p_type": "全部类型",
            "platform": "web",
        }
        try:
            data = fetch_json(endpoint, params=params)
        except Exception as exc:
            logging.warning("Bilibili list API failed on page %s: %s", page, exc)
            break

        arrays = find_project_arrays(data)
        if not arrays:
            break
        raw_items = arrays[0]
        if not raw_items:
            break

        page_added = 0
        for item in raw_items:
            raw = item_to_raw_event(item)
            if raw_event_needs_detail(raw):
                detail = fetch_detail_raw(raw.get("id"))
                raw = merge_raw_event(raw, detail)
            event = make_event(raw)
            if not event or not event_in_scope(event, event_scope) or event.source_url in seen_sources:
                continue
            seen_sources.add(event.source_url)
            events.append(event)
            page_added += 1

        logging.info(
            "Fetched page %s from Bilibili API: %s in-scope events from %s raw items",
            page,
            page_added,
            len(raw_items),
        )

    return events


def collect_events(
    targets: Sequence[str],
    max_pages: int,
    use_playwright: bool,
    event_scope: str,
    city_filter: Optional[str] = None,
) -> List[EventItem]:
    events: List[EventItem] = []

    # For the default home page, API is more stable than scraping rendered DOM.
    if not targets or all(target == DEFAULT_HOME_URL for target in targets):
        events.extend(scrape_bilibili_api(max_pages=max_pages, event_scope=event_scope, city_filter=city_filter))
        if events:
            return dedupe_events(events)

    for target in targets or [DEFAULT_HOME_URL]:
        try:
            if is_local_path(target):
                html = read_local_html(Path(target))
                parsed = parse_html_events(html, target)
            else:
                html = fetch_html(target)
                parsed = parse_html_events(html, target)
                if not parsed and use_playwright:
                    logging.info("No static events found in %s, trying Playwright", target)
                    parsed = parse_html_events(render_with_playwright(target), target)

            if not parsed and "show.bilibili.com/platform/home" in target:
                parsed = scrape_bilibili_api(
                    max_pages=max_pages,
                    event_scope=event_scope,
                    city_filter=city_filter,
                )

            before_scope = len(parsed)
            parsed = filter_events_by_scope(parsed, event_scope)
            if before_scope != len(parsed):
                logging.info(
                    "Event scope %s filtered %s -> %s events from %s",
                    event_scope,
                    before_scope,
                    len(parsed),
                    target,
                )

            logging.info("Parsed %s events from %s", len(parsed), target)
            events.extend(parsed)
        except Exception as exc:
            logging.exception("Failed to collect events from %s: %s", target, exc)

    return dedupe_events(events)


def is_local_path(target: str) -> bool:
    return not re.match(r"^https?://", target, flags=re.I)


def dedupe_events(events: Iterable[EventItem]) -> List[EventItem]:
    result: List[EventItem] = []
    seen: set[str] = set()
    for event in events:
        key = event.source_url or hashlib.sha1(
            f"{event.name}|{event.start_time}|{event.venue_name}".encode("utf-8")
        ).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        result.append(event)
    return result


POSTER_MAX_WIDTH = 800
POSTER_MAX_HEIGHT = 1200
POSTER_QUALITY = 85


def download_poster(url: str, upload_dir: str) -> Optional[str]:
    """Download a Bilibili poster with Referer header to bypass hotlink protection."""
    try:
        import hashlib as _hl
        import io
        resp = requests.get(
            url,
            headers={"User-Agent": USER_AGENT, "Referer": BILIBILI_REFERER},
            timeout=20,
            stream=True,
        )
        resp.raise_for_status()
        name = _hl.sha1(url.encode()).hexdigest()[:16] + ".jpg"
        dest = os.path.join(upload_dir, name)
        if not os.path.exists(dest):
            raw = resp.content
            try:
                from PIL import Image
                img = Image.open(io.BytesIO(raw)).convert("RGB")
                img.thumbnail((POSTER_MAX_WIDTH, POSTER_MAX_HEIGHT), Image.LANCZOS)
                img.save(dest, "JPEG", quality=POSTER_QUALITY, optimize=True)
            except Exception:
                with open(dest, "wb") as f:
                    f.write(raw)
        return f"/uploads/{name}"
    except Exception as exc:
        logging.warning("Failed to download poster %s: %s", url, exc)
        return url


def geocode_event(event: EventItem, amap_key: str, cache: Dict[str, Tuple[float, float, str]]) -> None:
    if event.latitude is not None and event.longitude is not None:
        return

    query = normalize_text(" ".join(filter(None, [event.city, event.address or event.venue_name])))
    if not query:
        raise RuntimeError(f"No address available for {event.name}")
    if query in cache:
        event.longitude, event.latitude, formatted = cache[query]
        if formatted and (not event.address or event.address == event.venue_name):
            event.address = formatted
        return

    geocode_limiter.wait()
    response = requests.get(
        "https://restapi.amap.com/v3/geocode/geo",
        params={"key": amap_key, "address": query, "city": event.city or ""},
        headers={"User-Agent": USER_AGENT},
        timeout=15,
    )
    response.raise_for_status()
    data = response.json()
    if data.get("status") != "1" or not data.get("geocodes"):
        raise RuntimeError(f"AMap geocode failed for {query}: {data.get('info') or data}")

    geocode = data["geocodes"][0]
    lng_text, lat_text = geocode["location"].split(",", 1)
    event.longitude = float(lng_text)
    event.latitude = float(lat_text)
    formatted = normalize_text(geocode.get("formatted_address"))
    if formatted and (not event.address or event.address == event.venue_name):
        event.address = formatted
    cache[query] = (event.longitude, event.latitude, formatted)


FIELD_CANDIDATES: Dict[str, Sequence[str]] = {
    "name": ("name", "title", "event_name", "project_name"),
    "start_time": ("start_time", "start_at", "begin_time", "event_start_time", "started_at"),
    "end_time": ("end_time", "end_at", "finish_time", "event_end_time", "ended_at"),
    "venue_name": ("venue_name", "venue", "place_name", "site_name"),
    "address": ("address", "venue_address", "location", "addr"),
    "latitude": ("latitude", "lat", "gcj02_lat", "map_lat"),
    "longitude": ("longitude", "lng", "lon", "gcj02_lng", "map_lng"),
    "ticket_price": ("ticket_price", "price", "price_text", "ticket_price_text"),
    "poster_url": ("poster_url", "cover_url", "image_url", "poster", "cover"),
    "ticket_url": ("ticket_url", "buy_url", "event_url", "url"),
    "source_url": ("source_url", "origin_url", "external_url", "source_link"),
    "category": ("category", "type", "event_type"),
    "city": ("city", "city_name", "area_name"),
    "description": ("description", "desc", "remark", "notes"),
    "display_until": ("display_until", "display_end_time", "show_until"),
    "status": ("status", "approval_status"),
    "user_id": ("user_id", "owner_id", "merchant_id"),
}


def normalized_column_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def match_column(columns: Dict[str, ColumnInfo], logical_name: str) -> Optional[str]:
    aliases = FIELD_CANDIDATES.get(logical_name, (logical_name,))
    by_norm = {normalized_column_name(name): name for name in columns}
    for alias in aliases:
        if alias in columns:
            return alias
        matched = by_norm.get(normalized_column_name(alias))
        if matched:
            return matched
    return None


def require_psycopg2() -> None:
    if psycopg2 is None or sql is None:
        raise SystemExit("Missing dependency: psycopg2-binary. Run setup_cron.sh or pip install psycopg2-binary.")


def connect_db() -> Any:
    require_psycopg2()
    required = ["DB_HOST", "DB_PORT", "DB_NAME", "DB_USER"]
    missing = [key for key in required if not os.environ.get(key)]
    if missing:
        raise SystemExit(f"Missing database environment variables: {', '.join(missing)}")

    return psycopg2.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        dbname=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
    )


def load_columns(conn: Any, schema: str, table: str) -> Dict[str, ColumnInfo]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT column_name, data_type, is_nullable, column_default,
                   is_identity, is_generated
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, table),
        )
        rows = cur.fetchall()
    if not rows:
        raise RuntimeError(f"Table {schema}.{table} does not exist or has no columns")
    return {
        row[0]: ColumnInfo(
            name=row[0],
            data_type=row[1],
            is_nullable=(row[2] == "YES"),
            default=row[3],
            is_identity=(row[4] == "YES"),
            is_generated=(row[5] != "NEVER"),
        )
        for row in rows
    }


def ensure_import_columns(conn: Any, schema: str, table: str) -> Dict[str, ColumnInfo]:
    require_psycopg2()
    columns = load_columns(conn, schema, table)
    additions: List[Tuple[str, str]] = []
    if not match_column(columns, "source_url"):
        additions.append(("source_url", "TEXT"))
    if not match_column(columns, "category"):
        additions.append(("category", "VARCHAR(50)"))
    if not match_column(columns, "city"):
        additions.append(("city", "VARCHAR(100)"))

    if additions:
        with conn.cursor() as cur:
            for column, column_type in additions:
                cur.execute(
                    sql.SQL("ALTER TABLE {}.{} ADD COLUMN IF NOT EXISTS {} {}").format(
                        sql.Identifier(schema),
                        sql.Identifier(table),
                        sql.Identifier(column),
                        sql.SQL(column_type),
                    )
                )
        conn.commit()

        columns = load_columns(conn, schema, table)
    source_col = match_column(columns, "source_url")
    if source_col:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL(
                    "CREATE UNIQUE INDEX IF NOT EXISTS {} ON {}.{} ({}) WHERE {} IS NOT NULL"
                ).format(
                    sql.Identifier(f"idx_{table}_{source_col}_unique"),
                    sql.Identifier(schema),
                    sql.Identifier(table),
                    sql.Identifier(source_col),
                    sql.Identifier(source_col),
                )
            )
        conn.commit()
    return columns


def event_payload(event: EventItem) -> Dict[str, Any]:
    return {
        "name": event.name,
        "start_time": event.start_time,
        "end_time": event.end_time,
        "venue_name": event.venue_name,
        "address": event.address,
        "latitude": event.latitude,
        "longitude": event.longitude,
        "ticket_price": event.ticket_price,
        "poster_url": event.poster_url,
        "ticket_url": event.source_url,
        "source_url": event.source_url,
        "category": event.category,
        "city": event.city,
        "description": event.description,
        "display_until": event.end_time,
        "status": "approved",
    }


def record_exists(conn: Any, schema: str, table: str, columns: Dict[str, ColumnInfo], event: EventItem) -> bool:
    source_col = match_column(columns, "source_url")
    if source_col:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("SELECT 1 FROM {}.{} WHERE {} = %s LIMIT 1").format(
                    sql.Identifier(schema),
                    sql.Identifier(table),
                    sql.Identifier(source_col),
                ),
                (event.source_url,),
            )
            if cur.fetchone() is not None:
                return True

    name_col = match_column(columns, "name")
    start_col = match_column(columns, "start_time")
    venue_col = match_column(columns, "venue_name")
    if name_col and start_col and venue_col:
        with conn.cursor() as cur:
            cur.execute(
                sql.SQL("SELECT 1 FROM {}.{} WHERE {} = %s AND {} = %s AND {} = %s LIMIT 1").format(
                    sql.Identifier(schema),
                    sql.Identifier(table),
                    sql.Identifier(name_col),
                    sql.Identifier(start_col),
                    sql.Identifier(venue_col),
                ),
                (event.name, event.start_time, event.venue_name),
            )
            return cur.fetchone() is not None
    return False


def build_insert_data(columns: Dict[str, ColumnInfo], event: EventItem) -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    payload = event_payload(event)

    for logical, value in payload.items():
        column = match_column(columns, logical)
        if not column or column in data:
            continue
        info = columns[column]
        if info.is_identity or info.is_generated:
            continue
        if value is None and not info.is_nullable:
            continue
        data[column] = value

    user_col = match_column(columns, "user_id")
    import_user_id = os.environ.get("ANIMAP_IMPORT_USER_ID")
    if user_col and user_col not in data and import_user_id:
        data[user_col] = int(import_user_id)

    now = dt.datetime.now()
    for name, info in columns.items():
        if name in data or name == "id" or info.is_identity or info.is_generated:
            continue
        if info.is_nullable or info.default is not None:
            continue
        logical = logical_for_column(name)
        if logical == "user_id":
            user_id = os.environ.get("ANIMAP_IMPORT_USER_ID")
            if not user_id:
                raise RuntimeError(
                    f"Column {name} is NOT NULL. Set ANIMAP_IMPORT_USER_ID to import events."
                )
            data[name] = int(user_id)
        elif logical in {"created_at", "updated_at"}:
            data[name] = now
        else:
            raise RuntimeError(f"Cannot fill required column {name}; no matching event field")

    return data


def validate_import_owner(conn: Any, schema: str, columns: Dict[str, ColumnInfo]) -> None:
    if not match_column(columns, "user_id"):
        return

    raw_user_id = os.environ.get("ANIMAP_IMPORT_USER_ID")
    if not raw_user_id:
        raise SystemExit(
            "Missing ANIMAP_IMPORT_USER_ID. AniMap public event queries join events.user_id to users.id, "
            "so imported events need a valid application user id to be visible."
        )

    try:
        user_id = int(raw_user_id)
    except ValueError as exc:
        raise SystemExit("ANIMAP_IMPORT_USER_ID must be a numeric users.id value") from exc

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("SELECT 1 FROM {}.{} WHERE id = %s LIMIT 1").format(
                sql.Identifier(schema),
                sql.Identifier("users"),
            ),
            (user_id,),
        )
        if cur.fetchone() is None:
            raise SystemExit(f"ANIMAP_IMPORT_USER_ID={user_id} does not exist in {schema}.users")


def logical_for_column(column_name: str) -> str:
    normalized = normalized_column_name(column_name)
    if normalized in {"userid", "ownerid", "merchantid"}:
        return "user_id"
    if normalized in {"createdat", "createdtime"}:
        return "created_at"
    if normalized in {"updatedat", "updatedtime"}:
        return "updated_at"
    return column_name


def insert_event(conn: Any, schema: str, table: str, columns: Dict[str, ColumnInfo], event: EventItem) -> None:
    data = build_insert_data(columns, event)
    if not data:
        raise RuntimeError("No insertable columns were matched")

    col_names = list(data.keys())
    values = [data[name] for name in col_names]
    placeholders = [sql.Placeholder()] * len(col_names)

    with conn.cursor() as cur:
        cur.execute(
            sql.SQL("INSERT INTO {}.{} ({}) VALUES ({})").format(
                sql.Identifier(schema),
                sql.Identifier(table),
                sql.SQL(", ").join(sql.Identifier(name) for name in col_names),
                sql.SQL(", ").join(placeholders),
            ),
            values,
        )
    conn.commit()


def import_events(events: Sequence[EventItem], dry_run: bool = False, ensure_columns: bool = True) -> Dict[str, int]:
    stats = {"new": 0, "skipped": 0, "failed": 0}
    if dry_run:
        for event in events:
            print(json.dumps(dataclasses.asdict(event), ensure_ascii=False, default=str))
        return stats

    amap_key = os.environ.get("AMAP_WEB_SERVICE_KEY")
    if not amap_key:
        raise SystemExit("Missing AMAP_WEB_SERVICE_KEY environment variable")

    schema = os.environ.get("ANIMAP_DB_SCHEMA", "public")
    table = os.environ.get("ANIMAP_EVENTS_TABLE", "events")
    upload_dir = os.environ.get("ANIMAP_UPLOAD_DIR", "/var/www/animap/public/uploads")
    conn = connect_db()
    geocode_cache: Dict[str, Tuple[float, float, str]] = {}

    try:
        columns = ensure_import_columns(conn, schema, table) if ensure_columns else load_columns(conn, schema, table)
        validate_import_owner(conn, schema, columns)
        for event in events:
            try:
                if record_exists(conn, schema, table, columns, event):
                    stats["skipped"] += 1
                    logging.info("Skip existing: %s", event.name)
                    continue

                geocode_event(event, amap_key, geocode_cache)
                if event.poster_url and event.poster_url.startswith("http"):
                    event.poster_url = download_poster(event.poster_url, upload_dir)
                insert_event(conn, schema, table, columns, event)
                stats["new"] += 1
                logging.info("Inserted: %s", event.name)
            except Exception as exc:
                conn.rollback()
                stats["failed"] += 1
                logging.exception("Failed to import %s: %s", event.name, exc)
    finally:
        conn.close()

    return stats


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape Bilibili Member Purchase events and import them into AniMap PostgreSQL."
    )
    parser.add_argument(
        "targets",
        nargs="*",
        help="Bilibili URLs or local saved HTML files. Defaults to Bilibili Member Purchase home page.",
    )
    parser.add_argument("--city", help="Filter by city name, e.g. 南京")
    parser.add_argument(
        "--event-scope",
        default=os.environ.get("EVENT_SCOPE", EVENT_SCOPE_CONVENTION),
        metavar="{convention,all}",
        help="convention/manzhan/漫展 imports only convention-like events; all/both/全部 imports both convention and non-convention events",
    )
    parser.add_argument(
        "--include-non-convention",
        action="store_const",
        const=EVENT_SCOPE_ALL,
        dest="event_scope",
        help="Shortcut for --event-scope all",
    )
    parser.add_argument("--max-pages", type=int, default=5, help="Max Bilibili API list pages to fetch")
    parser.add_argument("--playwright", action="store_true", help="Render dynamic pages with Playwright if needed")
    parser.add_argument("--dry-run", action="store_true", help="Print parsed events as JSON and do not geocode/import")
    parser.add_argument(
        "--no-ensure-columns",
        action="store_true",
        help="Do not auto-add source_url/category/city columns to events table",
    )
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args(argv)
    args.event_scope = parse_event_scope(args.event_scope)
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    configure_text_output()
    args = parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    events = collect_events(
        args.targets or [DEFAULT_HOME_URL],
        max_pages=args.max_pages,
        use_playwright=args.playwright,
        event_scope=args.event_scope,
        city_filter=args.city,
    )
    if not events:
        logging.warning("No events collected")
        print("导入统计：新增 0，跳过 0，失败 0")
        return 0

    stats = import_events(events, dry_run=args.dry_run, ensure_columns=not args.no_ensure_columns)
    print(f"导入统计：新增 {stats['new']}，跳过 {stats['skipped']}，失败 {stats['failed']}")
    return 1 if stats["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
