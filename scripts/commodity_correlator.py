#!/usr/bin/env python3
"""
Commodity Correlator for TradePulse
Analyses news impact on commodities based on country export exposure
"""

import json
import logging
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

class CommodityCorrelator:
    def __init__(self):
        self.exposure_data = self._load_exposure_data()
        self.country_map = self._build_country_map()
        
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
            "SA": ["saudi arabia", "saudi", "riyadh"],
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
            "BG": ["bulgaria", "bulgarian", "sofia"],
            "HR": ["croatia", "croatian", "zagreb"],
            "IE": ["ireland", "irish", "dublin"],
            "NZ": ["new zealand", "kiwi", "auckland", "wellington"],
            "QA": ["qatar", "qatari", "doha"],
            "KW": ["kuwait", "kuwaiti"],
            "OM": ["oman", "omani", "muscat"],
            "JO": ["jordan", "jordanian", "amman"],
            "LB": ["lebanon", "lebanese", "beirut"],
            "MA": ["morocco", "moroccan", "rabat", "casablanca"],
            "TN": ["tunisia", "tunisian", "tunis"],
            "DZ": ["algeria", "algerian", "algiers"],
            "LY": ["libya", "libyan", "tripoli"],
            "SD": ["sudan", "sudanese", "khartoum"],
            "ET": ["ethiopia", "ethiopian", "addis ababa"],
            "KE": ["kenya", "kenyan", "nairobi"],
            "GH": ["ghana", "ghanaian", "accra"],
            "CI": ["ivory coast", "cote d'ivoire", "abidjan"],
            "CM": ["cameroon", "cameroonian", "yaounde"],
            "AO": ["angola", "angolan", "luanda"],
            "ZW": ["zimbabwe", "zimbabwean", "harare"],
            "ZM": ["zambia", "zambian", "lusaka"],
            "MZ": ["mozambique", "mozambican", "maputo"],
            "TZ": ["tanzania", "tanzanian", "dar es salaam"],
            "UG": ["uganda", "ugandan", "kampala"],
            "CD": ["congo", "drc", "kinshasa", "democratic republic"],
            "VE": ["venezuela", "venezuelan", "caracas"],
            "CO": ["colombia", "colombian", "bogota"],
            "EC": ["ecuador", "ecuadorian", "quito"],
            "BO": ["bolivia", "bolivian", "la paz"],
            "PY": ["paraguay", "paraguayan", "asuncion"],
            "UY": ["uruguay", "uruguayan", "montevideo"],
            "CU": ["cuba", "cuban", "havana"],
            "DO": ["dominican republic", "santo domingo"],
            "GT": ["guatemala", "guatemalan"],
            "HN": ["honduras", "honduran", "tegucigalpa"],
            "SV": ["el salvador", "salvadoran", "san salvador"],
            "NI": ["nicaragua", "nicaraguan", "managua"],
            "CR": ["costa rica", "costa rican", "san jose"],
            "PA": ["panama", "panamanian"],
            "JM": ["jamaica", "jamaican", "kingston"],
            "TT": ["trinidad", "tobago", "port of spain"],
            "LK": ["sri lanka", "sri lankan", "colombo"],
            "MM": ["myanmar", "burma", "burmese", "yangon"],
            "KH": ["cambodia", "cambodian", "phnom penh"],
            "LA": ["laos", "laotian", "vientiane"],
            "MN": ["mongolia", "mongolian", "ulaanbaatar"],
            "KZ": ["kazakhstan", "kazakh", "astana", "almaty"],
            "UZ": ["uzbekistan", "uzbek", "tashkent"],
            "TM": ["turkmenistan", "turkmen", "ashgabat"],
            "TJ": ["tajikistan", "tajik", "dushanbe"],
            "KG": ["kyrgyzstan", "kyrgyz", "bishkek"],
            "AZ": ["azerbaijan", "azerbaijani", "baku"],
            "AM": ["armenia", "armenian", "yerevan"],
            "GE": ["georgia", "georgian", "tbilisi"],
            "MD": ["moldova", "moldovan", "chisinau"],
            "BY": ["belarus", "belarusian", "minsk"],
            "LT": ["lithuania", "lithuanian", "vilnius"],
            "LV": ["latvia", "latvian", "riga"],
            "EE": ["estonia", "estonian", "tallinn"],
            "RS": ["serbia", "serbian", "belgrade"],
            "BA": ["bosnia", "bosnian", "sarajevo"],
            "MK": ["macedonia", "macedonian", "skopje"],
            "AL": ["albania", "albanian", "tirana"],
            "SI": ["slovenia", "slovenian", "ljubljana"],
            "SK": ["slovakia", "slovak", "bratislava"],
            "IS": ["iceland", "icelandic", "reykjavik"],
            "LU": ["luxembourg", "luxembourgish"],
            "MT": ["malta", "maltese", "valletta"],
            "CY": ["cyprus", "cypriot", "nicosia"],
            "LI": ["liechtenstein"],
            "AD": ["andorra"],
            "MC": ["monaco"],
            "SM": ["san marino"],
            "VA": ["vatican"],
            "GN": ["guinea", "guinean", "conakry"],
            "BF": ["burkina faso", "ouagadougou"],
            "ML": ["mali", "malian", "bamako"],
            "NE": ["niger", "nigerien", "niamey"],
            "TD": ["chad", "chadian", "n'djamena"],
            "MR": ["mauritania", "mauritanian", "nouakchott"],
            "SN": ["senegal", "senegalese", "dakar"],
            "GM": ["gambia", "gambian", "banjul"],
            "GW": ["guinea-bissau", "bissau"],
            "SL": ["sierra leone", "freetown"],
            "LR": ["liberia", "liberian", "monrovia"],
            "TG": ["togo", "togolese", "lome"],
            "BJ": ["benin", "beninese", "porto-novo"],
            "GA": ["gabon", "gabonese", "libreville"],
            "CG": ["congo", "republic of congo", "brazzaville"],
            "GQ": ["equatorial guinea", "malabo"],
            "CF": ["central african republic", "bangui"],
            "RW": ["rwanda", "rwandan", "kigali"],
            "BI": ["burundi", "burundian", "bujumbura"],
            "DJ": ["djibouti", "djiboutian"],
            "ER": ["eritrea", "eritrean", "asmara"],
            "SO": ["somalia", "somali", "mogadishu"],
            "SC": ["seychelles"],
            "MU": ["mauritius", "mauritian", "port louis"],
            "KM": ["comoros", "comorian", "moroni"],
            "MG": ["madagascar", "malagasy", "antananarivo"],
            "SZ": ["swaziland", "eswatini", "mbabane"],
            "LS": ["lesotho", "maseru"],
            "BW": ["botswana", "gaborone"],
            "NA": ["namibia", "namibian", "windhoek"],
            "MW": ["malawi", "malawian", "lilongwe"],
            "FJ": ["fiji", "fijian", "suva"],
            "PG": ["papua new guinea", "port moresby"],
            "SB": ["solomon islands", "honiara"],
            "VU": ["vanuatu", "port vila"],
            "NC": ["new caledonia", "noumea"],
            "PF": ["french polynesia", "tahiti", "papeete"],
            "GU": ["guam"],
            "MP": ["northern mariana", "saipan"],
            "AS": ["american samoa", "pago pago"],
            "PW": ["palau", "koror"],
            "FM": ["micronesia", "palikir"],
            "MH": ["marshall islands", "majuro"],
            "KI": ["kiribati", "tarawa"],
            "NR": ["nauru"],
            "TV": ["tuvalu", "funafuti"],
            "TO": ["tonga", "nuku'alofa"],
            "WS": ["samoa", "apia"],
            "CK": ["cook islands", "rarotonga"],
            "NU": ["niue"],
            "TK": ["tokelau"],
            "PN": ["pitcairn"],
            "WF": ["wallis and futuna"],
            "TL": ["timor-leste", "east timor", "dili"],
            "BN": ["brunei", "bandar seri begawan"],
            "MO": ["macau", "macao"],
            "HK": ["hong kong"],
            "TW": ["taiwan", "taipei"],
            "KP": ["north korea", "pyongyang"],
            "MV": ["maldives", "male"],
            "BT": ["bhutan", "thimphu"],
            "NP": ["nepal", "nepalese", "kathmandu"],
            "AF": ["afghanistan", "afghan", "kabul"],
            "YE": ["yemen", "yemeni", "sana'a", "sanaa"],
            "SY": ["syria", "syrian", "damascus"],
            "PS": ["palestine", "palestinian", "ramallah", "gaza"],
            "BH": ["bahrain", "bahraini", "manama"],
            "PR": ["puerto rico", "san juan"],
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
            "GF": ["french guiana", "cayenne"],
            "FK": ["falkland islands", "stanley"],
            "GL": ["greenland", "nuuk"],
            "BM": ["bermuda", "hamilton"],
            "KY": ["cayman islands", "george town"],
            "TC": ["turks and caicos"],
            "VG": ["british virgin islands"],
            "VI": ["us virgin islands"],
            "AI": ["anguilla"],
            "MS": ["montserrat"],
            "GP": ["guadeloupe"],
            "MQ": ["martinique"],
            "AW": ["aruba"],
            "CW": ["curacao"],
            "SX": ["sint maarten"],
            "BQ": ["bonaire"],
            "HT": ["haiti", "haitian", "port-au-prince"],
            "RE": ["reunion"],
            "YT": ["mayotte"],
            "PM": ["st. pierre", "miquelon"],
            "SH": ["st. helena"],
            "IO": ["british indian ocean"],
            "CX": ["christmas island"],
            "CC": ["cocos islands"],
            "NF": ["norfolk island"],
            "HM": ["heard island"],
            "AQ": ["antarctica"],
            "BV": ["bouvet island"],
            "TF": ["french southern"],
            "GS": ["south georgia"],
            "UM": ["us minor outlying"],
            "EH": ["western sahara"],
            "SJ": ["svalbard"],
            "AX": ["aland islands"],
            "FO": ["faroe islands"],
            "GG": ["guernsey"],
            "JE": ["jersey"],
            "IM": ["isle of man"],
            "GI": ["gibraltar"]
        }
        
        return country_patterns
    
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
        """Main correlation engine"""
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
                # Detect countries in article
                article_text = f"{article.get('title', '')} {article.get('snippet', '')}"
                detected_countries = self.detect_countries_from_text(article_text)
                
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
                        quality_score = article.get("quality_score", 50)
                        
                        # Skip low quality
                        if quality_score < 40:
                            continue
                        
                        # Calculate impact
                        signal = self._calculate_commodity_signal(
                            article, export, sentiment
                        )
                        
                        if signal["score"] > 0.5:
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
        except Exception as e:
            logger.error(f"Failed to save commodity data: {e}")
            return None
        
        return commodity_signals

if __name__ == "__main__":
    correlator = CommodityCorrelator()
    correlator.run()
