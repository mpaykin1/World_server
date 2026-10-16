"""The default hero — «Странник»: brown hair, red scarf, blue tunic."""
from art.character import Spec, sheet
from art.registry import hero


@hero("wanderer")
def wanderer():
    return sheet(Spec())
