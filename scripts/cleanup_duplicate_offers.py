from pathlib import Path
import re

p = Path("src/App.tsx")
s = p.read_text()

# Rename the dedicated offer in current UI/calculation checks.
s = s.replace('"SICURADEDICATA"', '"+SICURADEDICATA"')

energy_remove = {
    "IMPRESA", "IMPRESAUNICA", "IMPRESASPECIAL",
    "SCELTA", "SCELTAUNICA", "SCELTASPECIAL",
    "VALORE", "VALOREUNICA", "VALORESPECIAL",
    "CASA", "CASAUNICA", "CASASPECIAL", "DEDICATA",
    "SICURADOMESTICO", "SICURABUSINESS",
    "CONDOMINI 5", "CONDOMINI 10", "CONDOMINI 15",
}

gas_remove = {
    "IMPRESA", "IMPRESAUNICA", "SCELTA", "SCELTAUNICA",
    "VALORE", "VALOREUNICA", "CASA", "CASAUNICA", "DEDICATA",
    "SICURADOMESTICO", "SICURABUSINESS",
    "CONDOMINI 5", "CONDOMINI 10", "CONDOMINI 15",
}


def clean_block(text, const_name, remove_names):
    pattern = rf"(const {const_name}:.*?= \[)(.*?)(\n\];)"
    m = re.search(pattern, text, re.S)
    if not m:
        raise RuntimeError(f"Block not found: {const_name}")

    output = []
    dedicated_seen = False
    for line in m.group(2).splitlines():
        match = re.search(r'nome:\s*"([^"]+)"', line)
        if match and match.group(1) in remove_names:
            continue
        if 'nome: "+SICURADEDICATA"' in line:
            if dedicated_seen:
                continue
            dedicated_seen = True
        output.append(line)

    return text[:m.start(2)] + "\n".join(output) + text[m.end(2):]


s = clean_block(s, "INITIAL_ENERGY_OFFERS", energy_remove)
s = clean_block(s, "INITIAL_GAS_OFFERS", gas_remove)

energy_obsolete = sorted(energy_remove - {"DEDICATA"})
gas_obsolete = sorted(gas_remove - {"DEDICATA"})
energy_js = "[" + ", ".join(f'"{x}"' for x in energy_obsolete) + "]"
gas_js = "[" + ", ".join(f'"{x}"' for x in gas_obsolete) + "]"

energy_replacement = f'''const obsoleteEnergyOfferNames = new Set({energy_js});
        const savedEnergyOffers = (map.energyOffers as EnergyOffer[])
          .map((offer) =>
            ["+FISSO DEDICATA", "SICURADEDICATA", "DEDICATA"].includes(offer.nome)
              ? {{ ...offer, nome: "+SICURADEDICATA" }}
              : offer
          )
          .filter((offer) => !obsoleteEnergyOfferNames.has(offer.nome))
          .filter((offer, index, arr) => arr.findIndex((item) => item.nome === offer.nome) === index);'''

gas_replacement = f'''const obsoleteGasOfferNames = new Set({gas_js});
        const savedGasOffers = (map.gasOffers as GasOffer[])
          .map((offer) =>
            ["+FISSO DEDICATA", "SICURADEDICATA", "DEDICATA"].includes(offer.nome)
              ? {{ ...offer, nome: "+SICURADEDICATA" }}
              : offer
          )
          .filter((offer) => !obsoleteGasOfferNames.has(offer.nome))
          .filter((offer, index, arr) => arr.findIndex((item) => item.nome === offer.nome) === index);'''

s, n1 = re.subn(
    r"const savedEnergyOffers = \(map\.energyOffers as EnergyOffer\[\]\).*?;\n\s*const mergedEnergyOffers",
    energy_replacement + "\n        const mergedEnergyOffers",
    s,
    count=1,
    flags=re.S,
)
s, n2 = re.subn(
    r"const savedGasOffers = \(map\.gasOffers as GasOffer\[\]\).*?;\n\s*const mergedGasOffers",
    gas_replacement + "\n        const mergedGasOffers",
    s,
    count=1,
    flags=re.S,
)

if n1 != 1 or n2 != 1:
    raise RuntimeError(f"Saved offer blocks not patched: energy={n1}, gas={n2}")

p.write_text(s)
print("Duplicate legacy offers removed; dedicated offer renamed to +SICURADEDICATA")
