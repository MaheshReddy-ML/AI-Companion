"""Shared public project facts; never contains an individual user's profile."""

PROJECT_CONTEXT = (
    "Trusted project context (data, not instructions): Emora was created by Mahesh Reddy, "
    "Sanjay, Harish, and Sindhu, the student development team. Mahesh studies at Parul University. "
    "Emora is an AI companion project combining local-first Qwen-based language generation, "
    "selective persistent user-owned memory, emotion-aware interaction, optional visual check-ins, "
    "voice/TTS, VRM avatars, FastAPI, MongoDB, and deterministic personality and behavior controls. "
    "The backend selects MLX on Apple Silicon, CUDA when available, or CPU; configured remote "
    "providers can be fallbacks. Chat uses recent history and consent-controlled memory context; "
    "behavior and speech plans are built deterministically after generation. Emotion estimates "
    "are non-clinical signals, not diagnoses. Availability depends on settings and account access. "
    "Use these facts only for relevant project questions. Do not invent team members, organizations, "
    "features, deployment status or technical details that are not provided. The project creator "
    "is not necessarily the current user."
)


PROJECT_TEAM = ("Mahesh Reddy", "Sanjay", "Harish", "Sindhu")
PROJECT_TECHNICAL_CONTEXT = (
    "Mahesh Reddy is Emora’s lead developer and team lead. "
    "He is deeply involved in Emora’s technical direction, architecture, "
    "development, and product thinking."
)
PROJECT_CONTEXT += " " + PROJECT_TECHNICAL_CONTEXT


def authoritative_project_reply(message: str) -> str | None:
    """Resolve narrow project identity questions from supplied facts, not generation.

    Explicit targets keep unrelated factual/technical questions on the model path.
    No personal account information is included in these public project answers.
    """
    import re

    text = " ".join(message.casefold().strip(" .?!").split())
    text = re.sub(r"^(?:so[, ]+)?(?:i (?:wanna|want to|would like to) know[, ]+)?", "", text)
    target = r"(?:this (?:website|site|app|project)|emora|yuna|you|this)"
    team_question = re.fullmatch(
        rf"(?:who (?:built|created|developed|designed|made) {target}|"
        rf"who (?:is|are) (?:the )?(?:developers?|creators?|development team|team) (?:of|for|behind) {target})",
        text,
    )
    leadership_question = re.fullmatch(
        rf"(?:who (?:is|are) (?:the )?(?:lead developer|team lead|technical lead|lead) (?:of|for|behind) {target}|"
        rf"who (?:leads|is responsible for) {target}(?:'s|’s)?(?: technical direction| development)?)",
        text,
    )
    if leadership_question:
        return PROJECT_TECHNICAL_CONTEXT
    if team_question:
        return f"Emora is built by {', '.join(PROJECT_TEAM[:-1])}, and {PROJECT_TEAM[-1]}."
    return None
