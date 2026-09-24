"""Pipeline configuration: universe, institutions, macro series."""

import os

# SEC asks automated clients to identify themselves:
# https://www.sec.gov/os/accessing-edgar-data
SEC_USER_AGENT = os.environ.get("SEC_USER_AGENT", "MarketAtlas research contact@example.com")
BROWSER_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

YEARS_OF_HISTORY = 10
HORIZON_DAYS = 252          # ~12 months of trading days
SAMPLE_EVERY = 21           # one sample per ~month per ticker
DOUBLE = 2.0

# The price universe. Mega/large caps, mid-cap growth, 2026 themes and the
# Doubling Lab candidates. Survivorship bias: only currently listed tickers.
UNIVERSE = [
    # Mega / large cap
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "BRK-B", "JPM", "V", "MA", "LLY", "UNH",
    "XOM", "CVX", "COP", "JNJ", "PG", "KO", "PEP", "WMT", "COST", "HD", "ORCL", "CRM", "ADBE", "NFLX",
    "AMD", "INTC", "QCOM", "TXN", "MU", "AMAT", "LRCX", "KLAC", "ASML", "TSM", "IBM", "CSCO", "INTU", "NOW",
    "BAC", "WFC", "GS", "MS", "C", "SCHW", "BLK", "SPGI", "AXP", "COF", "ALLY",
    "CAT", "DE", "GE", "HON", "RTX", "LMT", "BA", "UBER", "DAL", "UAL", "AAL", "RCL", "CCL",
    "DIS", "CMCSA", "T", "VZ", "MRK", "PFE", "ABBV", "VRTX", "REGN", "MRNA", "BSX", "ISRG", "ZTS",
    "NEE", "DUK", "SO", "CEG", "VST", "NRG", "TLN", "GEV",
    # AI hardware / memory / storage / servers
    "SNDK", "WDC", "STX", "DELL", "SMCI", "HPE", "ANET", "VRT", "ETN", "PWR", "FIX", "GNRC", "GLW", "COHR", "LITE",
    "MRVL", "ARM", "ON", "MPWR", "CRDO", "ALAB",
    # Software / internet
    "PLTR", "SNOW", "DDOG", "NET", "CRWD", "PANW", "ZS", "MDB", "SHOP", "APP", "HOOD", "COIN", "SOFI", "AFRM",
    "TTD", "CSGP", "EPAM", "PATH", "U", "RBLX", "DUOL", "SPOT", "ABNB", "DASH", "PDD", "BABA",
    # Consumer
    "LULU", "NKE", "SBUX", "CMG", "TSCO", "TGT", "EL", "F", "GM", "RIVN",
    # Energy / materials
    "OXY", "SLB", "HAL", "DVN", "EOG", "FANG", "FCX", "NEM", "ALB", "MP", "CCJ", "LEU", "UEC",
    # Doubling-lab themes
    "IREN", "CRWV", "NBIS", "CIFR", "WULF", "APLD", "HUT", "RIOT", "MARA", "BTDR", "CLSK",
    "IONQ", "RGTI", "QBTS", "QUBT", "OKLO", "SMR", "NNE", "RKLB", "ASTS", "PL", "LUNR",
    "RVMD", "NTRA", "CRSP", "BEAM", "NVAX", "ENPH", "FSLR", "RUN", "CHPT", "POET",
    "SOUN", "BBAI", "TEM", "HIMS", "CELH", "ONON", "AXON", "DHI", "BLDR",
]

QUICK_UNIVERSE = [
    "AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "META", "TSLA", "MU", "SNDK", "STX", "DELL", "INTC", "PLTR", "VST",
    "MRNA", "RCL", "UAL", "AXON", "HOOD", "IREN", "CRWV", "NBIS", "IONQ", "RGTI", "QBTS", "OKLO", "SMR", "RKLB",
    "ASTS", "RVMD",
]

# 13F filers (SEC CIK). The pipeline resolves each filer's two most recent
# 13F-HR filings from its EDGAR submissions feed.
INSTITUTIONS = [
    ("Berkshire Hathaway", "0001067983"),
    ("JPMorgan Chase", "0000019617"),
    ("Goldman Sachs", "0000886982"),
    ("Morgan Stanley", "0000895421"),
    ("Bank of America", "0000070858"),
    ("Citigroup", "0000831001"),
    ("Wells Fargo", "0000072971"),
    ("Vanguard Group", "0000102909"),
    ("State Street", "0000093751"),
    ("BlackRock", "0001364742"),
    ("Bridgewater Associates", "0001350694"),
    ("Appaloosa (Tepper)", "0001656456"),
    ("Duquesne (Druckenmiller)", "0001536411"),
    ("Pershing Square (Ackman)", "0001336528"),
    ("Coatue Management", "0001135730"),
    ("Tiger Global", "0001167483"),
    ("Renaissance Technologies", "0001037389"),
    ("Citadel Advisors", "0001423053"),
]
QUICK_INSTITUTIONS = ["Berkshire Hathaway", "Appaloosa (Tepper)", "Duquesne (Druckenmiller)"]

# FRED series (fetched via the no-key fredgraph CSV endpoint).
FRED_SERIES = [
    ("DGS10", "10-yr Treasury yield (%)"),
    ("DGS2", "2-yr Treasury yield (%)"),
    ("T10Y2Y", "10y–2y spread (pp)"),
    ("DFF", "Effective fed funds (%)"),
    ("CPIAUCSL", "CPI index (1982-84=100)"),
    ("UNRATE", "Unemployment rate (%)"),
    ("VIXCLS", "VIX"),
    ("DCOILBRENTEU", "Brent crude ($/bbl)"),
    ("BAMLH0A0HYM2", "High-yield OAS (pp)"),
    ("DTWEXBGS", "Broad trade-weighted USD"),
]

# Cap OpenFIGI lookups (CUSIP → ticker) per filer to stay inside the
# anonymous rate limit.
FIGI_LOOKUPS_PER_FILER = 80
