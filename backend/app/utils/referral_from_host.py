from starlette.requests import Request


def get_referral_from_host(request: Request) -> str | None:
    host = request.headers.get("host", "")
    parts = host.split(".")

    if len(parts) > 1 and parts[0] != "localhost":
        return parts[0].upper()

    return None
