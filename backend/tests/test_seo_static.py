"""SEO/AEO/GEO static site tests for Cybercity Opus landing page."""
import json
import re
import xml.etree.ElementTree as ET

import pytest
import requests

BASE_URL = "http://localhost:3000"
CANONICAL = "https://opuscybercity-beige.vercel.app"


@pytest.fixture(scope="module")
def index_html():
    r = requests.get(f"{BASE_URL}/", timeout=10)
    assert r.status_code == 200
    return r.text


# --- Tailwind compiled CSS ---
class TestTailwind:
    def test_index_has_compiled_link(self, index_html):
        assert '/dist/tailwind.css' in index_html
        assert 'rel="stylesheet"' in index_html

    def test_index_no_cdn_tailwind(self, index_html):
        assert 'cdn.tailwindcss.com' not in index_html

    def test_dist_css_served(self):
        r = requests.get(f"{BASE_URL}/dist/tailwind.css", timeout=10)
        assert r.status_code == 200
        assert 'css' in r.headers.get('content-type', '').lower()
        assert len(r.content) > 5000, f"CSS body too small: {len(r.content)}"


# --- Canonical / og:url ---
class TestCanonical:
    def test_canonical_link(self, index_html):
        m = re.search(r'<link[^>]+rel=["\']canonical["\'][^>]+href=["\']([^"\']+)["\']', index_html)
        assert m, "canonical not found"
        assert m.group(1).rstrip('/') == CANONICAL

    def test_og_url(self, index_html):
        m = re.search(r'property=["\']og:url["\'][^>]+content=["\']([^"\']+)["\']', index_html)
        assert m
        assert m.group(1).rstrip('/') == CANONICAL

    def test_no_old_domain(self, index_html):
        # find any 'opuscybercity.vercel.app' NOT followed/preceded by -beige
        bad = re.findall(r'(?<!-)opuscybercity\.vercel\.app', index_html)
        # also filter that the match is not 'opuscybercity-beige.vercel.app' - regex above already excludes
        assert not bad, f"Old domain still referenced {len(bad)} times"


# --- Viewport ---
class TestViewport:
    def test_viewport_meta(self, index_html):
        # meta viewport tag - attributes may be in any order
        vp_tag = re.search(r'<meta[^>]*name=["\']viewport["\'][^>]*>', index_html)
        assert vp_tag, "viewport meta tag not found"
        content_m = re.search(r'content=["\']([^"\']+)["\']', vp_tag.group(0))
        assert content_m
        content = content_m.group(1)
        assert 'maximum-scale=1.0' not in content
        assert 'user-scalable=no' not in content


# --- robots.txt ---
class TestRobots:
    @pytest.fixture(scope="class")
    def robots(self):
        r = requests.get(f"{BASE_URL}/robots.txt", timeout=10)
        assert r.status_code == 200
        return r.text

    @pytest.mark.parametrize("bot", ["GPTBot", "PerplexityBot", "ClaudeBot", "Google-Extended", "OAI-SearchBot"])
    def test_bot_present(self, robots, bot):
        assert re.search(rf"^User-agent:\s*{re.escape(bot)}\s*$", robots, re.MULTILINE), f"Missing {bot}"

    def test_sitemap_line(self, robots):
        assert f"Sitemap: {CANONICAL}/sitemap.xml" in robots


# --- sitemap.xml ---
class TestSitemap:
    def test_sitemap(self):
        r = requests.get(f"{BASE_URL}/sitemap.xml", timeout=10)
        assert r.status_code == 200
        root = ET.fromstring(r.text)
        ns = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        locs = [e.text for e in root.findall('.//s:loc', ns)] or [e.text for e in root.iter() if e.tag.endswith('loc')]
        assert locs, "No <loc> tags found"
        for loc in locs:
            assert 'opuscybercity-beige.vercel.app' in loc, f"Bad loc: {loc}"
            assert not re.search(r'(?<!-)opuscybercity\.vercel\.app', loc), f"Bare domain in {loc}"


# --- llms.txt ---
class TestLlmsTxt:
    def test_llms(self):
        r = requests.get(f"{BASE_URL}/llms.txt", timeout=10)
        assert r.status_code == 200
        body = r.text
        for needle in ["Cybercity Opus", "Road No. 45", "Jubilee Hills", "P02500004589"]:
            assert needle in body, f"Missing '{needle}' in llms.txt"


# --- Self-hosted images ---
class TestImages:
    @pytest.mark.parametrize("img", [
        "location-map.jpg",
        "floorplan-office.jpg",
        "floorplan-commercial.jpg",
        "floorplan-office-config.jpg",
    ])
    def test_image_served(self, img):
        r = requests.get(f"{BASE_URL}/public/site/{img}", timeout=10)
        assert r.status_code == 200, f"{img} => {r.status_code}"
        assert 'image/jpeg' in r.headers.get('content-type', '').lower()

    def test_html_references_local_images(self, index_html):
        for img in ["location-map.jpg", "floorplan-office.jpg",
                    "floorplan-commercial.jpg", "floorplan-office-config.jpg"]:
            assert f"public/site/{img}" in index_html, f"HTML missing public/site/{img}"

    def test_no_hotlink(self, index_html):
        assert 'lh3.googleusercontent.com' not in index_html


# --- JSON-LD ---
@pytest.fixture(scope="module")
def jsonld(index_html):
    m = re.search(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
                  index_html, re.DOTALL)
    assert m, "JSON-LD block not found"
    data = json.loads(m.group(1))
    return data


class TestJsonLd:
    def _entries(self, data):
        if isinstance(data, dict) and '@graph' in data:
            return data['@graph']
        if isinstance(data, list):
            return data
        return [data]

    def test_top_level_types(self, jsonld):
        entries = self._entries(jsonld)
        types = [e.get('@type') for e in entries]
        for t in ["Organization", "WebSite", "BreadcrumbList", "RealEstateListing", "FAQPage"]:
            assert t in types, f"Missing @type {t}. Got: {types}"

    def test_real_estate_listing(self, jsonld):
        entries = self._entries(jsonld)
        rel = next(e for e in entries if e.get('@type') == 'RealEstateListing')
        addr = rel.get('address')
        assert addr, "RealEstateListing missing address"
        for k in ['streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry']:
            assert k in addr, f"address missing {k}"
        geo = rel.get('geo')
        assert geo
        assert abs(float(geo['latitude']) - 17.4239) < 0.01
        assert abs(float(geo['longitude']) - 78.4106) < 0.01
        images = rel.get('image')
        assert isinstance(images, list) and len(images) >= 2
        ident = rel.get('identifier')
        # identifier may be dict or list
        idents = ident if isinstance(ident, list) else [ident]
        assert any('P02500004589' in str(i.get('value', '')) for i in idents if isinstance(i, dict))
        offers = rel.get('offers')
        assert offers
        assert offers.get('@type') == 'AggregateOffer'
        assert offers.get('offerCount') in (3, '3')
        assert offers.get('priceCurrency') == 'INR'

    def test_organization(self, jsonld):
        entries = self._entries(jsonld)
        org = next(e for e in entries if e.get('@type') == 'Organization')
        assert org.get('address')
        sameas = org.get('sameAs')
        assert isinstance(sameas, list)
        assert 'https://www.instagram.com/cybercity.group' in sameas

    def test_faq(self, jsonld):
        entries = self._entries(jsonld)
        faq = next(e for e in entries if e.get('@type') == 'FAQPage')
        me = faq['mainEntity']
        assert len(me) >= 12, f"FAQ has only {len(me)} entries"
        names = ' '.join(q['name'].lower() for q in me)
        assert 'price per' in names
        assert 'possession' in names
        assert 'freehold' in names

    def test_breadcrumb(self, jsonld):
        entries = self._entries(jsonld)
        bcs = [e for e in entries if e.get('@type') == 'BreadcrumbList']
        assert len(bcs) == 1
        items = bcs[0]['itemListElement']
        assert len(items) == 3
        positions = sorted(int(i['position']) for i in items)
        assert positions == [1, 2, 3]
