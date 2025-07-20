#!/usr/bin/env python3
"""
Commodity Correlator for TradePulse
Analyzes macro-economic news impact on commodities based on country export exposure
"""

import json
import logging
import re
from datetime import datetime, timedelta
from collections import defaultdict
from typing import List, Dict, Tuple
import os
import sys

# Ajouter le chemin des scripts pour les imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Configuration des chemins
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEWS_JSON_PATH = os.path.join(BASE_DIR, "data", "news.json")
EXPORT_EXPOSURE_PATH = os.path.join(BASE_DIR, "data", "export_exposure.json")
COMMODITIES_JSON_PATH = os.path.join(BASE_DIR, "data", "commodities.json")

# Logger configuration
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────
# Macro / micro patterns for filtering
# ──────────────────────────────────────────
MACRO_KEYWORDS = [
    # Trade & geopolitics
    "tariff", "trade war", "sanctions", "embargo", "export ban", "import restriction",
    "conflict", "war", "tension", "crisis", "diplomatic", "military",
    
    # Economics & policy
    "recession", "inflation", "gdp", "interest rate", "central bank", "fed", "ecb", "boj",
    "monetary policy", "fiscal policy", "stimulus", "quantitative",
    
    # Energy / supply
    "oil price", "energy crisis", "supply chain", "production cut", "shortage",
    "pipeline", "refinery", "opec", "strategic reserve",
    
    # Agriculture / climate
    "drought", "flood", "crop failure", "harvest", "weather", "climate",
    "frost", "heatwave", "hurricane", "typhoon",
    
    # Currency / FX
    "currency", "devaluation", "dollar", "euro", "yuan", "yen",
    "exchange rate", "forex", "carry trade",
    
    # Raw materials
    "mining", "ore production", "metal prices", "commodity prices"
]

COMPANY_KEYWORDS = [
    r"\b(?:inc|corp|ltd|plc|llc|co|company)\b",
    r"(?:nyse|nasdaq|tsx|lse):",
    r"\bearnings?\b", r"\brevenue\b", r"\bquarterly\b", 
    r"\bguidance\b", r"\bprofit\b", r"\bshares?\b",
    r"\bIPO\b", r"\bmerger\b", r"\bacquisition\b"
]

# Pre-compile patterns for performance
MACRO_PATTERNS = [re.compile(rf"\b{kw}\b", re.I) for kw in MACRO_KEYWORDS]
COMPANY_PATTERNS = [re.compile(kw, re.I) for kw in COMPANY_KEYWORDS]

class CommodityCorrelator:
    def __init__(self):
        self.exposure_data = self._load_exposure_data()
        self.country_map = self._build_country_map()
        
        # Configuration thresholds
        self.QUALITY_MIN = 40    # Minimum quality score
        self.SIGNAL_MIN = 0.5    # Minimum signal score
        
    def _load_exposure_data(self):
        """Load export exposure data"""
        try:
            with open(EXPORT_EXPOSURE_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load exposure data: {e}")
            return {}
    
    def _build_country_map(self):
        """Build country detection map from news data"""
        # Map des variantes de noms de pays pour la détection
        country_patterns = {
            "US": ["united states", "usa", "us ", "america", "washington", "white house"],
            "CN": ["china", "chinese", "beijing", "shanghai", "hong kong"],
            "AU": ["australia", "australian", "sydney", "melbourne", "canberra"],
            "FR": ["france", "french", "paris", "macron"],
            "DE": ["germany", "german", "berlin", "frankfurt"],
            "GB": ["uk", "united kingdom", "britain", "british", "london"],
            "JP": ["japan", "japanese", "tokyo", "yen"],
            "CA": ["canada", "canadian", "ottawa", "toronto"],
            "BR": ["brazil", "brazilian", "brasilia", "são paulo"],
            "IN": ["india", "indian", "delhi", "mumbai"],
            "RU": ["russia", "russian", "moscow", "kremlin", "putin"],
            "KR": ["korea", "korean", "seoul", "south korea"],
            "IT": ["italy", "italian", "rome", "milan"],
            "ES": ["spain", "spanish", "madrid", "barcelona"],
            "MX": ["mexico", "mexican", "mexico city"],
            "ID": ["indonesia", "indonesian", "jakarta"],
            "SA": ["saudi", "saudi arabia", "riyadh"],
            "AE": ["uae", "emirates", "dubai", "abu dhabi"],
            "AR": ["argentina", "argentine", "buenos aires"],
            "CL": ["chile", "chilean", "santiago"],
            "PE": ["peru", "peruvian", "lima"],
            "ZA": ["south africa", "johannesburg", "pretoria"],
            "NG": ["nigeria", "nigerian", "lagos", "abuja"],
            "EG": ["egypt", "egyptian", "cairo"],
            "TH": ["thailand", "thai", "bangkok"],
            "MY": ["malaysia", "malaysian", "kuala lumpur"],
            "SG": ["singapore", "singaporean"],
            "VN": ["vietnam", "vietnamese", "hanoi", "ho chi minh"],
            "PH": ["philippines", "philippine", "manila"],
            "PK": ["pakistan", "pakistani", "islamabad", "karachi"],
            "BD": ["bangladesh", "bangladeshi", "dhaka"],
            "TR": ["turkey", "turkish", "ankara", "istanbul"],
            "IR": ["iran", "iranian", "tehran"],
            "IQ": ["iraq", "iraqi", "baghdad"],
            "IL": ["israel", "israeli", "tel aviv", "jerusalem"],
            "UA": ["ukraine", "ukrainian", "kiev", "kyiv"],
            "PL": ["poland", "polish", "warsaw"],
            "NL": ["netherlands", "dutch", "amsterdam", "holland"],
            "BE": ["belgium", "belgian", "brussels"],
            "SE": ["sweden", "swedish", "stockholm"],
            "NO": ["norway", "norwegian", "oslo"],
            "DK": ["denmark", "danish", "copenhagen"],
            "FI": ["finland", "finnish", "helsinki"],
            "CH": ["switzerland", "swiss", "zurich", "geneva"],
            "AT": ["austria", "austrian", "vienna"],
            "GR": ["greece", "greek", "athens"],
            "PT": ["portugal", "portuguese", "lisbon"],
            "CZ": ["czech", "czech republic", "prague"],
            "HU": ["hungary", "hungarian", "budapest"],
            "RO": ["romania", "romanian", "bucharest"],
            "IE": ["ireland", "irish", "dublin"],
            "NZ": ["new zealand", "kiwi", "auckland", "wellington"],
            "QA": ["qatar", "qatari", "doha"],
            "KW": ["kuwait", "kuwaiti"],
            "MA": ["morocco", "moroccan", "rabat", "casablanca"],
            "KE": ["kenya", "kenyan", "nairobi"],
            "GH": ["ghana", "ghanaian", "accra"],
            "ET": ["ethiopia", "ethiopian", "addis ababa"],
            "TZ": ["tanzania", "tanzanian", "dar es salaam"],
            "UG": ["uganda", "ugandan", "kampala"],
            "ZM": ["zambia", "zambian", "lusaka"],
            "ZW": ["zimbabwe", "zimbabwean", "harare"],
            "VE": ["venezuela", "venezuelan", "caracas"],
            "CO": ["colombia", "colombian", "bogota"],
            "EC": ["ecuador", "ecuadorian", "quito"],
            "BO": ["bolivia", "bolivian", "la paz"],
            "PY": ["paraguay", "paraguayan", "asuncion"],
            "UY": ["uruguay", "uruguayan", "montevideo"],
            "KZ": ["kazakhstan", "kazakh", "astana", "almaty"],
            "UZ": ["uzbekistan", "uzbek", "tashkent"],
            "AZ": ["azerbaijan", "azerbaijani", "baku"],
            "GE": ["georgia", "georgian", "tbilisi"],
            "AM": ["armenia", "armenian", "yerevan"],
            "BY": ["belarus", "belarusian", "minsk"],
            "LT": ["lithuania", "lithuanian", "vilnius"],
            "LV": ["latvia", "latvian", "riga"],
            "EE": ["estonia", "estonian", "tallinn"],
            "RS": ["serbia", "serbian", "belgrade"],
            "HR": ["croatia", "croatian", "zagreb"],
            "SI": ["slovenia", "slovenian", "ljubljana"],
            "SK": ["slovakia", "slovak", "bratislava"],
            "MK": ["macedonia", "macedonian", "skopje"],
            "AL": ["albania", "albanian", "tirana"],
            "LU": ["luxembourg", "luxembourgish"],
            "IS": ["iceland", "icelandic", "reykjavik"],
            "MT": ["malta", "maltese", "valletta"],
            "CY": ["cyprus", "cypriot", "nicosia"],
            "BH": ["bahrain", "bahraini", "manama"],
            "OM": ["oman", "omani", "muscat"],
            "JO": ["jordan", "jordanian", "amman"],
            "LB": ["lebanon", "lebanese", "beirut"],
            "SY": ["syria", "syrian", "damascus"],
            "YE": ["yemen", "yemeni", "sana'a", "sanaa"],
            "LY": ["libya", "libyan", "tripoli"],
            "TN": ["tunisia", "tunisian", "tunis"],
            "DZ": ["algeria", "algerian", "algiers"],
            "SD": ["sudan", "sudanese", "khartoum"],
            "CI": ["ivory coast", "cote d'ivoire", "abidjan"],
            "CM": ["cameroon", "cameroonian", "yaounde"],
            "AO": ["angola", "angolan", "luanda"],
            "MZ": ["mozambique", "mozambican", "maputo"],
            "NA": ["namibia", "namibian", "windhoek"],
            "BW": ["botswana", "gaborone"],
            "MU": ["mauritius", "mauritian", "port louis"],
            "MG": ["madagascar", "malagasy", "antananarivo"],
            "SN": ["senegal", "senegalese", "dakar"],
            "ML": ["mali", "malian", "bamako"],
            "BF": ["burkina faso", "ouagadougou"],
            "NE": ["niger", "nigerien", "niamey"],
            "TD": ["chad", "chadian", "n'djamena"],
            "MR": ["mauritania", "mauritanian", "nouakchott"],
            "GM": ["gambia", "gambian", "banjul"],
            "GW": ["guinea-bissau", "bissau"],
            "SL": ["sierra leone", "freetown"],
            "LR": ["liberia", "liberian", "monrovia"],
            "TG": ["togo", "togolese", "lome"],
            "BJ": ["benin", "beninese", "porto-novo"],
            "GA": ["gabon", "gabonese", "libreville"],
            "CG": ["congo", "republic of congo", "brazzaville"],
            "CD": ["congo", "drc", "kinshasa", "democratic republic"],
            "GQ": ["equatorial guinea", "malabo"],
            "CF": ["central african republic", "bangui"],
            "RW": ["rwanda", "rwandan", "kigali"],
            "BI": ["burundi", "burundian", "bujumbura"],
            "DJ": ["djibouti", "djiboutian"],
            "ER": ["eritrea", "eritrean", "asmara"],
            "SO": ["somalia", "somali", "mogadishu"],
            "MW": ["malawi", "malawian", "lilongwe"],
            "SZ": ["swaziland", "eswatini", "mbabane"],
            "LS": ["lesotho", "maseru"],
            "FJ": ["fiji", "fijian", "suva"],
            "PG": ["papua new guinea", "port moresby"],
            "SB": ["solomon islands", "honiara"],
            "VU": ["vanuatu", "port vila"],
            "NC": ["new caledonia", "noumea"],
            "PF": ["french polynesia", "tahiti", "papeete"],
            "LK": ["sri lanka", "sri lankan", "colombo"],
            "MM": ["myanmar", "burma", "burmese", "yangon"],
            "KH": ["cambodia", "cambodian", "phnom penh"],
            "LA": ["laos", "laotian", "vientiane"],
            "MN": ["mongolia", "mongolian", "ulaanbaatar"],
            "BN": ["brunei", "bandar seri begawan"],
            "TL": ["timor-leste", "east timor", "dili"],
            "MV": ["maldives", "male"],
            "BT": ["bhutan", "thimphu"],
            "NP": ["nepal", "nepalese", "kathmandu"],
            "AF": ["afghanistan", "afghan", "kabul"],
            "TJ": ["tajikistan", "tajik", "dushanbe"],
            "KG": ["kyrgyzstan", "kyrgyz", "bishkek"],
            "TM": ["turkmenistan", "turkmen", "ashgabat"],
            "PS": ["palestine", "palestinian", "ramallah", "gaza"],
            "VA": ["vatican"],
            "SM": ["san marino"],
            "AD": ["andorra"],
            "MC": ["monaco"],
            "LI": ["liechtenstein"],
            "GI": ["gibraltar"],
            "FK": ["falkland islands", "stanley"],
            "GF": ["french guiana", "cayenne"],
            "GL": ["greenland", "nuuk"],
            "BM": ["bermuda", "hamilton"],
            "KY": ["cayman islands", "george town"],
            "VG": ["british virgin islands"],
            "TC": ["turks and caicos"],
            "AI": ["anguilla"],
            "MS": ["montserrat"],
            "GP": ["guadeloupe"],
            "MQ": ["martinique"],
            "BB": ["barbados", "bridgetown"],
            "AG": ["antigua", "barbuda", "st. john's"],
            "DM": ["dominica", "roseau"],
            "GD": ["grenada", "st. george's"],
            "KN": ["st. kitts", "nevis", "basseterre"],
            "LC": ["st. lucia", "castries"],
            "VC": ["st. vincent", "grenadines", "kingstown"],
            "BS": ["bahamas", "bahamian", "nassau"],
            "BZ": ["belize", "belmopan"],
            "GY": ["guyana", "georgetown"],
            "SR": ["suriname", "paramaribo"],
            "JM": ["jamaica", "jamaican", "kingston"],
            "TT": ["trinidad", "tobago", "port of spain"],
            "CU": ["cuba", "cuban", "havana"],
            "DO": ["dominican republic", "santo domingo"],
            "HT": ["haiti", "haitian", "port-au-prince"],
            "PR": ["puerto rico", "san juan"],
            "GT": ["guatemala", "guatemalan"],
            "HN": ["honduras", "honduran", "tegucigalpa"],
            "SV": ["el salvador", "salvadoran", "san salvador"],
            "NI": ["nicaragua", "nicaraguan", "managua"],
            "CR": ["costa rica", "costa rican", "san jose"],
            "PA": ["panama", "panamanian"],
            "AW": ["aruba"],
            "CW": ["curacao"],
            "SX": ["sint maarten"],
            "BQ": ["bonaire"],
            "HK": ["hong kong"],
            "MO": ["macau", "macao"],
            "TW": ["taiwan", "taipei"],
            "KP": ["north korea", "pyongyang"],
            "FM": ["micronesia", "palikir"],
            "MH": ["marshall islands", "majuro"],
            "PW": ["palau", "koror"],
            "NR": ["nauru"],
            "KI": ["kiribati", "tarawa"],
            "TV": ["tuvalu", "funafuti"],
            "TO": ["tonga", "nuku'alofa"],
            "WS": ["samoa", "apia"],
            "NU": ["niue"],
            "CK": ["cook islands", "rarotonga"],
            "TK": ["tokelau"],
            "WF": ["wallis and futuna"],
            "PY": ["paraguay", "paraguayan", "asuncion"],
            "GN": ["guinea", "guinean", "conakry"]
        }
        
        # Convert to sets for O(1) lookup
        return {cc: set(patterns) for cc, patterns in country_patterns.items()}
    
    # ---------- Macro/Micro filtering ----------
    @staticmethod
    def _is_company_article(text: str) -> bool:
        """Check if article is about a specific company"""
        return any(p.search(text) for p in COMPANY_PATTERNS)
    
    @staticmethod
    def _is_macro_article(text: str) -> bool:
        """Check if article contains macro-economic keywords"""
        return any(p.search(text) for p in MACRO_PATTERNS)
    
    def detect_countries_from_text(self, text: str) -> List[str]:
        """Detect countries mentioned in text"""
        detected = set()
        text_lower = text.lower()
        
        for country_code, patterns in self.country_map.items():
            for pattern in patterns:
                if pattern in text_lower:
                    detected.add(country_code)
                    break
        
        return list(detected)
    
    def get_country_exports(self, country_code: str) -> List[Dict]:
        """Get export products for a country"""
        exports = []
        for mapping in self.exposure_data.get("mappings", []):
            if mapping["country"] == country_code:
                exports.append(mapping)
        return exports
    
    def correlate_news_to_commodities(self, news_data: Dict) -> Dict:
        """Main correlation engine with macro filtering"""
        commodity_signals = defaultdict(lambda: {
            "score": 0,
            "trend": "neutral",
            "affected_countries": [],
            "related_news": [],
            "last_update": datetime.now().isoformat()
        })
        
        # Process each country's news
        for country_code, articles in news_data.items():
            if not isinstance(articles, list):
                continue
            
            # Process each article
            for article in articles:
                # Quality filter
                quality_score = article.get("quality_score", 50)
                if quality_score < self.QUALITY_MIN:
                    continue
                
                # Build text for analysis
                text = f"{article.get('title', '')} {article.get('snippet', '')}"
                
                # MACRO FILTER: Skip company-specific news
                if self._is_company_article(text):
                    logger.debug(f"Skipping company article: {article.get('title', '')}")
                    continue
                
                # MACRO FILTER: Must contain macro keywords
                if not self._is_macro_article(text):
                    logger.debug(f"Skipping non-macro article: {article.get('title', '')}")
                    continue
                
                # Check importance level if available
                if article.get("importance_level") == "general":
                    continue
                
                # Detect countries in article
                detected_countries = self.detect_countries_from_text(text)
                
                # If no countries detected but article is categorized by country, use that
                if not detected_countries and country_code != "lastUpdated":
                    # Map full country names to codes
                    country_mapping = {
                        "us": "US", "france": "FR", "europe_other": ["DE", "GB", "IT", "ES"],
                        "asia": ["CN", "JP", "KR", "IN"], "emerging_markets": ["BR", "MX", "ZA"],
                        "global": []
                    }
                    
                    if country_code in country_mapping:
                        mapped = country_mapping[country_code]
                        if isinstance(mapped, str):
                            detected_countries = [mapped]
                        elif isinstance(mapped, list):
                            detected_countries = mapped
                
                # Process each detected country
                for detected_country in detected_countries:
                    # Get country's export exposure
                    country_exports = self.get_country_exports(detected_country)
                    if not country_exports:
                        continue
                    
                    # Analyze each export product
                    for export in country_exports:
                        # Use existing ML analysis
                        sentiment = article.get("impact", "neutral")
                        
                        # Calculate impact
                        signal = self._calculate_commodity_signal(
                            article, export, sentiment
                        )
                        
                        if signal["score"] > self.SIGNAL_MIN:
                            commodity_code = export["product_code"]
                            
                            # Update commodity signal
                            commodity_signals[commodity_code]["score"] += signal["score"]
                            commodity_signals[commodity_code]["trend"] = signal["trend"]
                            
                            # Add country if not already there
                            country_info = {
                                "country": export["country"],
                                "country_name": export["country_name"],
                                "impact": export["impact"]
                            }
                            if country_info not in commodity_signals[commodity_code]["affected_countries"]:
                                commodity_signals[commodity_code]["affected_countries"].append(country_info)
                            
                            # Add news reference
                            news_ref = {
                                "title": article.get("title", ""),
                                "date": article.get("date", ""),
                                "url": article.get("url", ""),
                                "impact": sentiment,
                                "score": signal["score"]
                            }
                            commodity_signals[commodity_code]["related_news"].append(news_ref)
        
        return self._finalize_signals(commodity_signals)
    
    def _calculate_commodity_signal(self, article, export, sentiment):
        """Calculate signal strength for a commodity"""
        # Base score from article quality
        base_score = article.get("quality_score", 50) / 100.0
        
        # Impact weight from export data
        impact_weight = export["impact_weight"]
        
        # Direction based on sentiment and crisis scenario
        if sentiment == "negative":
            if export["crisis_scenario"] == "UP":
                trend = "bullish"
                multiplier = 1.2
            else:
                trend = "bearish"
                multiplier = 0.8
        elif sentiment == "positive":
            if export["crisis_scenario"] == "UP":
                trend = "bearish"
                multiplier = 0.8
            else:
                trend = "bullish"
                multiplier = 1.2
        else:
            trend = "neutral"
            multiplier = 0.5
        
        score = base_score * impact_weight * multiplier
        
        return {
            "score": score,
            "trend": trend
        }
    
    def _finalize_signals(self, signals):
        """Aggregate and rank signals"""
        # Sort by score
        sorted_commodities = sorted(
            signals.items(),
            key=lambda x: x[1]["score"],
            reverse=True
        )
        
        # Apply thresholds
        thresholds = self.exposure_data["config"]["thresholds"]
        
        output = {
            "lastUpdated": datetime.now().isoformat(),
            "summary": {
                "total_commodities_affected": len(signals),
                "critical_alerts": 0,
                "important_alerts": 0,
                "watch_list": 0
            },
            "commodities": []
        }
        
        # Get product mapping
        product_mapping = self.exposure_data.get("product_mapping", {})
        
        for commodity_code, data in sorted_commodities[:20]:  # Top 20
            alert_level = "none"
            if data["score"] >= thresholds["alert_critical"]:
                alert_level = "critical"
                output["summary"]["critical_alerts"] += 1
            elif data["score"] >= thresholds["alert_important"]:
                alert_level = "important"
                output["summary"]["important_alerts"] += 1
            elif data["score"] >= thresholds["alert_watch"]:
                alert_level = "watch"
                output["summary"]["watch_list"] += 1
            
            # Keep only top 5 news
            data["related_news"] = sorted(
                data["related_news"],
                key=lambda x: x["score"],
                reverse=True
            )[:5]
            
            output["commodities"].append({
                "code": commodity_code,
                "name": product_mapping.get(commodity_code, commodity_code),
                "score": round(data["score"], 2),
                "trend": data["trend"],
                "alert_level": alert_level,
                "affected_countries": data["affected_countries"],
                "news_count": len(data["related_news"]),
                "top_news": data["related_news"]
            })
        
        return output
    
    def run(self):
        """Main execution"""
        logger.info("🏗️ Starting commodity correlation analysis...")
        logger.info("📋 Filtering: Only macro-economic news will be processed")
        
        # Load latest news
        try:
            with open(NEWS_JSON_PATH, 'r', encoding='utf-8') as f:
                news_data = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load news data: {e}")
            return None
        
        # Run correlation
        commodity_signals = self.correlate_news_to_commodities(news_data)
        
        # Save results
        try:
            os.makedirs(os.path.dirname(COMMODITIES_JSON_PATH), exist_ok=True)
            with open(COMMODITIES_JSON_PATH, 'w', encoding='utf-8') as f:
                json.dump(commodity_signals, f, ensure_ascii=False, indent=2)
            
            logger.info(f"✅ Commodity analysis complete: {len(commodity_signals['commodities'])} commodities tracked")
            logger.info(f"🚨 Alerts: {commodity_signals['summary']['critical_alerts']} critical, {commodity_signals['summary']['important_alerts']} important")
            logger.info(f"📊 Macro filtering active - company news excluded")
        except Exception as e:
            logger.error(f"Failed to save commodity data: {e}")
            return None
        
        return commodity_signals

if __name__ == "__main__":
    correlator = CommodityCorrelator()
    correlator.run()
