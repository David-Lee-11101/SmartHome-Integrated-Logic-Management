import os


def load_ifttt_credentials():
    if os.getenv("IFTTT_ADAPTER_ENABLED", "false").lower() != "true":
        raise RuntimeError("The IFTTT adapter is disabled; set IFTTT_ADAPTER_ENABLED=true to opt in")
    values = {
        "username": os.getenv("IFTTT_USERNAME", ""),
        "email": os.getenv("IFTTT_EMAIL", ""),
        "password": os.getenv("IFTTT_PASSWORD", ""),
        "authorization": os.getenv("IFTTT_AUTHORIZATION", ""),
    }
    missing = [name for name, value in values.items() if name != "username" and not value]
    if missing:
        raise RuntimeError("Missing required IFTTT configuration: " + ", ".join(sorted(missing)))
    return values
