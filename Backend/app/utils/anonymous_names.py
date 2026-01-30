import random

ADJECTIVES = [
    "Silent", "Quiet", "Gentle", "Soft", "Calm", "Peaceful", "Serene", "Tranquil",
    "Mystic", "Cosmic", "Lunar", "Solar", "Stellar", "Celestial", "Ethereal",
    "Velvet", "Silk", "Crystal", "Pearl", "Amber", "Jade", "Ruby", "Sapphire",
    "Wandering", "Drifting", "Floating", "Gliding", "Soaring", "Dancing",
    "Whispering", "Murmuring", "Echoing", "Humming", "Chanting",
    "Ancient", "Timeless", "Eternal", "Infinite", "Endless",
    "Hidden", "Secret", "Veiled", "Shrouded", "Cloaked",
    "Wild", "Free", "Untamed", "Boundless", "Limitless",
    "Dreaming", "Waking", "Sleeping", "Resting", "Pondering",
    "Brave", "Bold", "Fierce", "Strong", "Resilient",
    "Kind", "Tender", "Caring", "Loving", "Warm",
    "Curious", "Seeking", "Searching", "Wondering", "Exploring",
    "Luminous", "Radiant", "Glowing", "Shining", "Brilliant",
    "Shadow", "Twilight", "Midnight", "Dawn", "Dusk",
    "Ocean", "River", "Mountain", "Forest", "Desert",
    "Storm", "Rain", "Snow", "Wind", "Thunder",
    "Ghost", "Spirit", "Phantom", "Wraith", "Shade"
]

NOUNS = [
    "Owl", "Falcon", "Raven", "Hawk", "Eagle", "Swan", "Dove", "Crane",
    "Wolf", "Fox", "Bear", "Deer", "Rabbit", "Tiger", "Lion", "Leopard",
    "Dragon", "Phoenix", "Unicorn", "Griffin", "Pegasus",
    "Star", "Moon", "Sun", "Comet", "Nebula", "Galaxy", "Constellation",
    "Rose", "Lily", "Orchid", "Lotus", "Jasmine", "Lavender", "Violet",
    "Ocean", "River", "Lake", "Sea", "Stream", "Waterfall", "Tide",
    "Mountain", "Hill", "Valley", "Peak", "Summit", "Canyon",
    "Forest", "Woods", "Grove", "Garden", "Meadow", "Field",
    "Cloud", "Mist", "Fog", "Haze", "Vapor", "Smoke",
    "Flame", "Fire", "Ember", "Spark", "Blaze", "Inferno",
    "Ice", "Snow", "Frost", "Crystal", "Glacier",
    "Thunder", "Lightning", "Storm", "Tempest", "Gale",
    "Dream", "Vision", "Whisper", "Echo", "Song", "Melody",
    "Shadow", "Silhouette", "Reflection", "Mirror", "Mirage",
    "Soul", "Heart", "Mind", "Spirit", "Essence",
    "Knight", "Wanderer", "Traveler", "Voyager", "Seeker",
    "Sage", "Oracle", "Prophet", "Mystic", "Seer",
    "Artist", "Poet", "Dreamer", "Thinker", "Philosopher"
]


def generate_anonymous_name() -> str:
    """
    Generate a random anonymous name like:
    - Silent Owl 7834
    - Cosmic Phoenix 1293
    - Velvet Dream 5621
    """
    adjective = random.choice(ADJECTIVES)
    noun = random.choice(NOUNS)
    number = random.randint(1000, 9999)
    
    return f"{adjective} {noun} {number}"